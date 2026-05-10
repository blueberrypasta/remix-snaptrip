
import { supabase } from './supabaseClient';
import type { HistoryItem } from '../types';

export const historyService = {
  /**
   * 사용자의 모든 분석 히스토리를 DB에서 가져옵니다.
   */
  async getUserHistory(userId: string): Promise<HistoryItem[]> {
    try {
      if (!userId || userId === 'guest') return [];

      const { data, error } = await supabase
        .from('analysis_history')
        .select('*')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false });

      if (error) throw error;

      return (data || []).map(item => ({
        id: item.id.toString(),
        status: 'success',
        imageData: item.image_url || '',
        timestamp: new Date(item.timestamp).getTime(),
        title: item.title || '',
        fact: item.fact || '',
        story: item.story || '',
        // DB에서 가져온 데이터가 이미 객체(JSONB)일 수도, 문자열일 수도 있으므로 안전하게 처리
        sources: item.sources ? (typeof item.sources === 'string' ? JSON.parse(item.sources) : item.sources) : undefined,
        isAutoSaved: true 
      }));
    } catch (error) {
      console.error('[SnapTrip DB] Fetch Error:', error);
      return [];
    }
  },

  /**
   * 새로운 분석 결과를 DB에 저장합니다.
   */
  async saveResult(userId: string, item: HistoryItem): Promise<string | null> {
    try {
      if (!userId || userId === 'guest') return null;
      
      // 이미 저장된 정식 ID(숫자형)인 경우 중복 저장 방지
      if (item.id && !item.id.startsWith('temp_') && !isNaN(Number(item.id))) {
        return item.id;
      }

      const insertData: any = {
        user_id: userId,
        image_url: item.imageData,
        title: item.title?.trim() || "새로운 발견",
        fact: item.fact || '',
        story: item.story || '',
        // Supabase JSONB 컬럼에는 객체를 그대로 보냅니다.
        sources: item.sources || null,
        timestamp: new Date(item.timestamp).toISOString()
      };

      console.log('[SnapTrip DB] Attempting save for:', insertData.title);

      // 1차 시도: 전체 데이터 저장
      const { data, error } = await supabase
        .from('analysis_history')
        .insert([insertData])
        .select('id');

      if (error) {
        console.error('[SnapTrip DB] Save failed:', error.message);
        
        // 2차 시도: sources 컬럼이 없는 구형 스키마일 경우를 대비해 sources를 빼고 저장
        if (error.message.includes('column "sources" does not exist')) {
            console.warn('[SnapTrip DB] Falling back to schema without sources column...');
            const { sources, ...legacyData } = insertData;
            const { data: legacyResult, error: legacyError } = await supabase
                .from('analysis_history')
                .insert([legacyData])
                .select('id');
            
            if (!legacyError && legacyResult && legacyResult.length > 0) {
                return legacyResult[0].id.toString();
            }
        }
        
        // 3차 시도: 용량 초과(413) 시 이미지를 제외하고 저장
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('analysis_history')
          .insert([{ 
            ...insertData, 
            image_url: 'IMAGE_TOO_LARGE',
            sources: null 
          }])
          .select('id');
        
        if (!fallbackError && fallbackData && fallbackData.length > 0) {
          return fallbackData[0].id.toString();
        }
        
        throw error;
      }

      if (data && data.length > 0) {
        return data[0].id.toString();
      }
      
      return null;
    } catch (error: any) {
      console.error('[SnapTrip DB] Critical Save Error:', error.message || error);
      return null;
    }
  },

  /**
   * 특정 히스토리 삭제
   */
  async deleteResult(userId: string, id: string): Promise<boolean> {
    try {
      if (!userId || userId === 'guest' || !id || id.startsWith('temp_')) return true;

      const { error } = await supabase
        .from('analysis_history')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);

      return !error;
    } catch (error) {
      console.error('[SnapTrip DB] Delete Error:', error);
      return false;
    }
  },

  /**
   * 사용자의 모든 히스토리 삭제
   */
  async clearAll(userId: string): Promise<boolean> {
    try {
      if (!userId || userId === 'guest') return true;

      const { error } = await supabase
        .from('analysis_history')
        .delete()
        .eq('user_id', userId);

      if (error) {
        console.error('[SnapTrip DB] Clear All failed:', error.message);
        return false;
      }

      return true;
    } catch (error) {
      console.error('[SnapTrip DB] Clear All Error:', error);
      return false;
    }
  }
};
