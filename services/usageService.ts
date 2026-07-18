
import { supabase } from './supabaseClient';
import type { Language } from '../types';
import { isValidGeminiApiKey } from '../utils/apiKeyUtils';

const PROMO_CODE = 'joshjoshjosh';
const DAILY_FREE_CREDITS = 10;
const GUEST_STORAGE_KEY = 'snaptrip_guest_profile';

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
        guestData = { credits: 1, last_reset_at: today, language: systemLang };
        localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(guestData));
      }
      
      // 날짜가 바뀌었으면 보충
      if (guestData.last_reset_at !== today) {
        guestData.credits = Math.max(guestData.credits, 1);
        guestData.last_reset_at = today;
        localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(guestData));
      }
      
      return { 
        credits: guestData.credits, 
        isPremium: false, 
        promoUsed: false, 
        language: guestData.language || systemLang 
      };
    }

    // 2. 로그인 사용자 처리
    const localKey = getLocalKey(userId);
    const localDataRaw = localStorage.getItem(localKey);
    const localData = parseStoredObject(localDataRaw);

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('credits, is_premium, last_reset_at, promo_used, language')
        .eq('id', userId)
        .maybeSingle();

      if (error) throw error;

      // 버그로 인해 10 크레딧 이상을 받은 유저들(단, 프로모 코드를 쓰지 않은 경우) 10으로 롤백
      if (data && data.credits > 10 && !data.promo_used) {
         data.credits = 10;
         const { error: rollbackError } = await supabase.from('profiles').update({ credits: 10 }).eq('id', userId);
         if (rollbackError) throw rollbackError;
      }

      if (!data) {
        // 신규 로그인 유저 초기화 (기본 10)
        const initial = { 
          id: userId, 
          credits: 10, 
          last_reset_at: today, 
          language: localData?.language || systemLang,
          updated_at: new Date().toISOString()
        };
        const { error: insertError } = await supabase.from('profiles').upsert(initial);
        if (insertError) throw insertError;
        localStorage.setItem(localKey, JSON.stringify(initial));
        return { credits: 10, isPremium: false, promoUsed: false, language: initial.language as Language };
      }

      // 날짜 기반 리필 로직
      if (data.last_reset_at !== today) {
        const newCredits = Math.max(data.credits, DAILY_FREE_CREDITS);
        const updateData = { 
          credits: newCredits, 
          last_reset_at: today,
          updated_at: new Date().toISOString() 
        };
        const { error: refillError } = await supabase.from('profiles').update(updateData).eq('id', userId);
        if (refillError) throw refillError;
        
        const merged = { ...data, ...updateData };
        localStorage.setItem(localKey, JSON.stringify(merged));
        return { credits: newCredits, isPremium: data.is_premium, promoUsed: data.promo_used, language: (data.language || systemLang) as Language };
      }
      
      // 로컬 최신화
      localStorage.setItem(localKey, JSON.stringify({ ...data, id: userId }));
      return { 
        credits: data.credits, 
        isPremium: data.is_premium, 
        promoUsed: data.promo_used,
        language: (data.language || localData?.language || systemLang) as Language
      };

    } catch (e) {
      console.warn("[SnapTrip] Profile Sync Fallback:", e);
      if (localData) {
        console.warn("[SnapTrip] Using cached local credits:", localData.credits);
        return { credits: localData.credits, isPremium: localData.is_premium, promoUsed: localData.promo_used, language: localData.language || systemLang };
      }
      console.warn("[SnapTrip] No local cache — returning credits: 0 to avoid fake quota display");
      return { credits: 0, isPremium: false, promoUsed: false, language: systemLang };
    }
  },

  async updateUserLanguage(userId: string, language: Language): Promise<void> {
    const guestDataRaw = localStorage.getItem(GUEST_STORAGE_KEY);
    const guestData = parseStoredObject(guestDataRaw) || { credits: 1, last_reset_at: getTodayString() };
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
    const cleanCode = code.trim().toLowerCase();
    if (cleanCode !== PROMO_CODE.toLowerCase()) return { success: false, message: 'invalidCode' };
    const profile = await this.getUserCredits(userId);
    if (profile.promoUsed) return { success: false, message: 'alreadyUsed' };
    try {
      const newCredits = profile.credits + 100;
      const { error } = await supabase.from('profiles').update({ credits: newCredits, promo_used: true, updated_at: new Date().toISOString() }).eq('id', userId);
      if (error) throw error;
      const localKey = getLocalKey(userId);
      const currentLocal = parseStoredObject(localStorage.getItem(localKey)) || {};
      localStorage.setItem(localKey, JSON.stringify({ ...currentLocal, credits: newCredits, promo_used: true }));
      return { success: true, message: 'success' };
    } catch (e) { return { success: false, message: 'error' }; }
  },

  async canAnalyze(userId: string): Promise<boolean> {
    // 0. 본인 API 키가 있으면 항상 허용
    if (typeof window !== 'undefined' && isValidGeminiApiKey(localStorage.getItem('SNAPTRIP_API_KEY'))) {
      return true;
    }
    const profile = await this.getUserCredits(userId);
    return profile.isPremium || profile.credits > 0;
  },

  async deductCredit(userId: string): Promise<number> {
    // 0. 본인 API 키가 있으면 크레딧 차감 안함
    if (typeof window !== 'undefined' && isValidGeminiApiKey(localStorage.getItem('SNAPTRIP_API_KEY'))) {
      const profile = await this.getUserCredits(userId);
      return profile.credits;
    }

    if (!userId || userId === 'guest') {
      const guestDataRaw = localStorage.getItem(GUEST_STORAGE_KEY);
      const guestData = parseStoredObject(guestDataRaw) || { credits: 1, last_reset_at: getTodayString() };
      const newCredits = Math.max(0, guestData.credits - 1);
      guestData.credits = newCredits;
      localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(guestData));
      return newCredits;
    }
    try {
      const profile = await this.getUserCredits(userId);
      const newCredits = Math.max(0, profile.credits - 1);
      const { error } = await supabase.from('profiles').update({ credits: newCredits, updated_at: new Date().toISOString() }).eq('id', userId);
      if (error) throw error;
      const localKey = getLocalKey(userId);
      const currentLocal = parseStoredObject(localStorage.getItem(localKey)) || {};
      localStorage.setItem(localKey, JSON.stringify({ ...currentLocal, credits: newCredits }));
      return newCredits;
    } catch (e) { return 0; }
  }
};
