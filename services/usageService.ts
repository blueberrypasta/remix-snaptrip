
import { supabase } from './supabaseClient';
import type { Language } from '../types';

const GUEST_STORAGE_KEY = 'snaptrip_guest_profile';
// Guests get the same 10 photo scans a day as signed-in users.
const GUEST_DAILY_CREDITS = 10;

const SUPPORTED_LANGUAGES: Language[] = ['en', 'ko', 'ja', 'zh', 'es', 'fr', 'de', 'it'];

const parseStoredObject = (value: string | null): Record<string, any> | null => {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

// 시스템 언어 감지
const getSystemLanguage = (): Language => {
  const browserLang = navigator.language.split('-')[0] as any;
  return SUPPORTED_LANGUAGES.includes(browserLang) ? browserLang : 'en';
};

// 현지 시각 기준 YYYY-MM-DD 문자열 생성
const getTodayString = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().split('T')[0];
};

const getLocalKey = (userId: string) => `snaptrip_profile_${userId}`;

export const usageService = {
  /**
   * 사용자의 크레딧 및 언어 설정을 가져오고, 날짜가 바뀌었으면 충전합니다.
   */
  async getUserCredits(userId: string): Promise<{ credits: number; isPremium: boolean; promoUsed: boolean; language: Language }> {
    const today = getTodayString();
    const systemLang = getSystemLanguage();

    // 1. 비로그인 게스트 처리
    if (!userId || userId === 'guest') {
      const guestDataRaw = localStorage.getItem(GUEST_STORAGE_KEY);
      let guestData = parseStoredObject(guestDataRaw);
      
      // 데이터가 아예 없으면 초기값 생성 (시스템 언어 반영)
      if (!guestData) {
        guestData = { credits: GUEST_DAILY_CREDITS, last_reset_at: today, language: systemLang, daily_limit: GUEST_DAILY_CREDITS };
        localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(guestData));
      }
      
      // 날짜가 바뀌었으면 보충
      // 날짜가 바뀌었거나 예전 1회 한도로 저장된 게스트면 10회로 보충
      if (guestData.last_reset_at !== today || guestData.daily_limit !== GUEST_DAILY_CREDITS) {
        guestData.credits = Math.max(Number(guestData.credits) || 0, GUEST_DAILY_CREDITS);
        guestData.last_reset_at = today;
        guestData.daily_limit = GUEST_DAILY_CREDITS;
        localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(guestData));
      }
      
      return { 
        credits: guestData.credits, 
        isPremium: false, 
        promoUsed: false, 
        language: guestData.language || systemLang 
      };
    }

    // 2. 로그인 사용자: 크레딧 생성/일일 충전은 서버 함수가 처리 (클라이언트는 credits를 쓸 수 없음)
    const localKey = getLocalKey(userId);
    const localData = parseStoredObject(localStorage.getItem(localKey));

    try {
      const { data, error } = await supabase.rpc('refresh_my_credits', {
        p_today: today,
        p_language: localData?.language || systemLang,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) throw new Error('empty profile');

      const result = {
        credits: row.credits ?? 0,
        isPremium: !!row.is_premium,
        promoUsed: !!row.promo_used,
        language: (row.language || localData?.language || systemLang) as Language,
      };
      localStorage.setItem(localKey, JSON.stringify({ ...(localData || {}), id: userId, credits: result.credits, is_premium: result.isPremium, promo_used: result.promoUsed, language: result.language }));
      return result;
    } catch (e) {
      console.warn("[SnapTrip] Profile Sync Fallback:", e);
      if (localData) {
        return { credits: localData.credits ?? 0, isPremium: !!localData.is_premium, promoUsed: !!localData.promo_used, language: localData.language || systemLang };
      }
      return { credits: 0, isPremium: false, promoUsed: false, language: systemLang };
    }
  },

  async updateUserLanguage(userId: string, language: Language): Promise<void> {
    const guestDataRaw = localStorage.getItem(GUEST_STORAGE_KEY);
    const guestData = parseStoredObject(guestDataRaw) || { credits: GUEST_DAILY_CREDITS, last_reset_at: getTodayString(), daily_limit: GUEST_DAILY_CREDITS };
    guestData.language = language;
    localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(guestData));

    if (userId && userId !== 'guest') {
      try {
        const { error } = await supabase.from('profiles').update({ language, updated_at: new Date().toISOString() }).eq('id', userId);
        if (error) throw error;
        const localKey = getLocalKey(userId);
        const currentLocal = parseStoredObject(localStorage.getItem(localKey)) || {};
        localStorage.setItem(localKey, JSON.stringify({ ...currentLocal, language }));
      } catch (e) {
        console.warn('[SnapTrip] Language sync fallback:', e);
      }
    }
  },

  async applyPromoCode(userId: string | null, code: string): Promise<{success: boolean, message: string}> {
    if (!userId || userId === 'guest') return { success: false, message: 'loginFirst' };
    try {
      const { data, error } = await supabase.rpc('redeem_promo_code', { p_code: code.trim() });
      if (error) throw error;
      return { success: data === 'success', message: String(data) };
    } catch (e) { return { success: false, message: 'error' }; }
  },

  async canAnalyze(userId: string): Promise<boolean> {

    const profile = await this.getUserCredits(userId);
    return profile.isPremium || profile.credits > 0;
  },

  async deductCredit(userId: string): Promise<number> {

    if (!userId || userId === 'guest') {
      const guestDataRaw = localStorage.getItem(GUEST_STORAGE_KEY);
      const guestData = parseStoredObject(guestDataRaw) || { credits: GUEST_DAILY_CREDITS, last_reset_at: getTodayString(), daily_limit: GUEST_DAILY_CREDITS };
      const newCredits = Math.max(0, guestData.credits - 1);
      guestData.credits = newCredits;
      localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(guestData));
      return newCredits;
    }
    try {
      const { data, error } = await supabase.rpc('consume_my_credit');
      if (error) throw error;
      const newCredits = Math.max(0, Number(data));
      const localKey = getLocalKey(userId);
      const currentLocal = parseStoredObject(localStorage.getItem(localKey)) || {};
      localStorage.setItem(localKey, JSON.stringify({ ...currentLocal, credits: newCredits }));
      return newCredits;
    } catch (e) { return 0; }
  }
};
