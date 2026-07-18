import React, { useState, useRef, useEffect, useCallback } from 'react';
import { WelcomeScreen } from './components/WelcomeScreen';
import { ResultScreen } from './components/ResultScreen';
import { GuideScreen } from './components/GuideScreen';
import { AboutScreen } from './components/AboutScreen';
import { HistorySidebar } from './components/HistorySidebar';
import { Header } from './components/Header';
import { LoginModal } from './components/LoginModal';
import { analyzeImageStream, fetchNearbyPlaces, fetchMoreNearbyPlaces } from './services/geminiService';
import { usageService } from './services/usageService';
import { historyService } from './services/historyService';
import { supabase } from './services/supabaseClient';
import { fileToBase64 } from './utils/fileUtils';
import type { AppState, HistoryItem, Language, User, LocationData, LocationSource } from './types';
import { useTranslations } from './translations';

const NEARBY_LIMIT = 20;

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>('welcome');
  const [currentResultId, setCurrentResultId] = useState<string | null>(null);
  const [guideLandmark, setGuideLandmark] = useState<string | null>(null);
  const [guideLocationHint, setGuideLocationHint] = useState<string | undefined>(undefined);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [isLoginModalOpen, setLoginModalOpen] = useState(false);
  const [language, setLanguage] = useState<Language>('en');
  const [user, setUser] = useState<User & { id: string } | null>(null);
  const [isSyncing, setIsSyncing] = useState(true); 
  const [credits, setCredits] = useState(0); 
  const [isQuotaExceeded, setIsQuotaExceeded] = useState(false);
  const [isApiRateLimited, setIsApiRateLimited] = useState(false);
  
  const [cachedLocation, setCachedLocation] = useState<LocationData | null>(null);
  const [nearbyGems, setNearbyGems] = useState<{name: string, type: string, rating: string | number, reviewCount: string | number, description: string, url: string}[]>([]);
  const [nearbyAreaName, setNearbyAreaName] = useState<string>('');
  const [nearbyWeather, setNearbyWeather] = useState<{emoji: string, tempC: number} | null>(null);
  const [isNearbyLoading, setIsNearbyLoading] = useState(false);
  const [locationStatus, setLocationStatus] = useState<'idle' | 'loading' | 'ready' | 'denied' | 'unavailable' | 'error' | 'empty'>('idle');
  const [isMoreNearbyLoading, setIsMoreNearbyLoading] = useState(false);

  const t = useTranslations(language);
  const isSyncingInProgress = useRef(false);
  const hasUserSelectedLanguage = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleReload = () => { window.location.reload(); };

  const handleOpenSelectKey = async () => {
    if (window.aistudio?.openSelectKey) {
      await window.aistudio.openSelectKey();
      setIsQuotaExceeded(false);
      window.location.reload();
    }
  };

  const handleSetLanguage = (lang: Language) => {
    hasUserSelectedLanguage.current = true;
    setLanguage(lang);
    const userId = user?.id || 'guest';
    usageService.updateUserLanguage(userId, lang);
  };

  const syncUserData = useCallback(async (userId: string) => {
    if (isSyncingInProgress.current) return;
    isSyncingInProgress.current = true;
    setIsSyncing(true);
    try {
      // 타임아웃으로 무한 대기 방지 (8초)
      const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T> =>
        Promise.race([
          promise,
          new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Sync timeout')), ms))
        ]);

      const profileData = await withTimeout(usageService.getUserCredits(userId), 8000);
      setCredits(profileData.credits);
      if (profileData.language && !hasUserSelectedLanguage.current) {
        setLanguage(profileData.language);
      }
      const dbHistory = await withTimeout(historyService.getUserHistory(userId), 8000);
      setHistory(prev => {
        const localOnlyItems = prev.filter(l => l.id.startsWith('temp_') || (l.status === 'success' && !dbHistory.some(d => d.id === l.id)));
        const combined = [...localOnlyItems, ...dbHistory.filter(d => !localOnlyItems.some(l => l.id === d.id))];
        return combined.sort((a, b) => b.timestamp - a.timestamp);
      });
    } catch (e) {
      console.error("[SnapTrip] Sync Error:", e);
    } finally {
      setIsSyncing(false);
      isSyncingInProgress.current = false;
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    let authHandledByInit = false;

    const setUserFromSession = (session: any) => {
      const suUser = session.user;
      setUser({
        id: suUser.id,
        name: suUser.user_metadata.full_name || suUser.email,
        email: suUser.email || '',
        avatar: `https://ui-avatars.com/api/?name=${suUser.email}`,
        credits: 0,
        isPremium: false
      });
      return suUser.id;
    };

    const initAuth = async () => {
      try {
        // 0. PKCE 코드 교환을 명시적으로 처리 (detectSessionInUrl: false)
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');
        if (code) {
          try {
            const { data, error } = await supabase.auth.exchangeCodeForSession(code);
            // URL 정리 (code 파라미터 제거)
            window.history.replaceState({}, '', window.location.pathname);
            if (!error && data.session && mounted) {
              authHandledByInit = true;
              const userId = setUserFromSession(data.session);
              await syncUserData(userId);
              return; // 코드 교환 성공 — 아래 getSession 불필요
            }
          } catch (codeErr) {
            console.warn("[SnapTrip] Code exchange failed:", codeErr);
            window.history.replaceState({}, '', window.location.pathname);
          }
        }

        // 1. 게스트 정보를 즉시 로드하여 기본 상태를 빠르게 세팅
        const guestProfile = await usageService.getUserCredits('guest');
        if (mounted) {
          setCredits(guestProfile.credits);
          if (!hasUserSelectedLanguage.current) {
            setLanguage(guestProfile.language);
          }
        }

        // 2. 기존 세션 확인 (localStorage에서)
        const { data: { session } } = await supabase.auth.getSession();
        if (session && mounted) {
          authHandledByInit = true;
          const userId = setUserFromSession(session);
          await syncUserData(userId);
        }
      } catch (e) {
        console.error("[SnapTrip] Auth Init Error:", e);
      } finally {
        if (mounted) setIsSyncing(false);
      }
    };
    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;
      if (event === 'SIGNED_OUT') {
        setUser(null);
        const guestProfile = await usageService.getUserCredits('guest');
        setCredits(guestProfile.credits);
      } else if (event === 'SIGNED_IN' && session) {
        // initAuth에서 이미 처리했으면 중복 sync 방지
        if (authHandledByInit) {
          authHandledByInit = false;
          return;
        }
        const userId = setUserFromSession(session);
        await syncUserData(userId);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [syncUserData]);

  const getCurrentCoords = useCallback((force: boolean = false): Promise<LocationData | null> => {
    return new Promise((resolve) => {
      if (!force && cachedLocation) return resolve(cachedLocation);
      setLocationStatus('loading');
      if (!navigator.geolocation) {
        setLocationStatus('unavailable');
        return resolve(null);
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => { 
          const loc = { latitude: pos.coords.latitude, longitude: pos.coords.longitude }; 
          setCachedLocation(loc); 
          setLocationStatus('ready');
          resolve(loc); 
        },
        (error) => {
          setLocationStatus(error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable');
          resolve(null);
        },
        { timeout: 7000, enableHighAccuracy: true }
      );
    });
  }, [cachedLocation]);

  const handleStartAnalysis = async (file: File) => {
    // 0. 초기 동기화가 진행 중이라면 잠시 대기 (최대 2초)
    if (isSyncing) {
        let waitCount = 0;
        while (isSyncing && waitCount < 10) {
            await new Promise(r => setTimeout(r, 200));
            waitCount++;
        }
    }

    const activeUserId = user?.id || 'guest';
    
    // 1. 크레딧 권한 체크 (비동기 서비스 직접 호출하여 가장 최신 데이터 확인)
    const canAnalyze = await usageService.canAnalyze(activeUserId);
    if (!canAnalyze) {
      if (!user) {
        setLoginModalOpen(true);
      } else {
        setIsQuotaExceeded(true);
      }
      return;
    }

    setIsQuotaExceeded(false);
    try {
      const { base64, mimeType, location: exifLocation } = await fileToBase64(file);
      
      let finalLocation = exifLocation;
      let locationSource: LocationSource = 'exif';
      
      if (!finalLocation) {
        finalLocation = await getCurrentCoords();
        locationSource = finalLocation ? 'device' : 'none';
      }

      const tempId = `temp_${Date.now()}`;
      const newItem: HistoryItem = { 
        id: tempId, 
        status: 'processing', 
        imageData: `data:${mimeType};base64,${base64}`, 
        timestamp: Date.now(), 
        progress: 5,
        locationSource,
        locationData: finalLocation || undefined
      };
      
      setHistory(prev => [newItem, ...prev]);
      setCurrentResultId(tempId);
      setAppState('result'); 
      
      try {
        const result = await analyzeImageStream(base64, mimeType, language, (partial) => {
          setHistory(prev => prev.map(item => item.id === tempId ? { ...item, ...partial, progress: Math.max(item.progress || 0, 95) } : item));
        }, finalLocation, locationSource);
        
        const finalItem: HistoryItem = { ...newItem, ...result, status: 'success', progress: 100 };
        
        setHistory(prev => prev.map(item => item.id === tempId ? finalItem : item));
        
        const newCredits = await usageService.deductCredit(activeUserId);
        setCredits(newCredits);
        
        if (user) {
          const dbId = await historyService.saveResult(user.id, finalItem);
          if (dbId) {
            setHistory(prev => prev.map(item => item.id === tempId ? { ...item, id: dbId, isAutoSaved: true } : item));
            setCurrentResultId(prevId => prevId === tempId ? dbId : prevId);
          }
        }
      } catch (e: any) { 
        console.error("[SnapTrip] Analysis Error:", e);
        if (e?.message?.includes('429') || e?.status === 429) {
          setIsApiRateLimited(true);
        } else if (e?.message?.includes('quota')) {
          setIsQuotaExceeded(true);
        }
        // 에러 시 튕겨나가는 대신 히스토리에서만 제거하고 알림 표시
        setHistory(prev => prev.filter(item => item.id !== tempId)); 
        setAppState('welcome');
        setCurrentResultId(null);
      }
    } catch (e) {
      console.error("[SnapTrip] File Processing Error:", e);
      setAppState('welcome');
    }
  };

  const loadNearbyGems = useCallback(async (loc: LocationData, lang: Language) => {
    setIsNearbyLoading(true);
    setLocationStatus('loading');
    try {
      const result = await fetchNearbyPlaces(loc, lang);
      setNearbyGems(result.places);
      setNearbyAreaName(result.areaName);
      setNearbyWeather(result.weather);
      setLocationStatus(result.places.length > 0 ? 'ready' : 'empty');
    } catch (error: any) { 
      // Do nothing globally to prevent full-screen quota error on startup
      console.warn("Nearby places error:", error);
      setLocationStatus('error');
    } finally { setIsNearbyLoading(false); }
  }, []);

  const handleLoadMoreNearby = async () => {
    if (isMoreNearbyLoading || !cachedLocation || nearbyGems.length >= NEARBY_LIMIT) return;
    setIsMoreNearbyLoading(true);
    try {
      const existingNames = nearbyGems.map(g => g.name);
      const morePlaces = await fetchMoreNearbyPlaces(cachedLocation, language, existingNames);
      if (morePlaces && morePlaces.length > 0) {
        setNearbyGems(prev => [...prev, ...morePlaces].slice(0, NEARBY_LIMIT));
      }
    } catch (e) {} finally { setIsMoreNearbyLoading(false); }
  };

  const handleRefreshLocation = async () => {
    if (isNearbyLoading) return;
    setNearbyGems([]); setNearbyAreaName(''); setNearbyWeather(null);
    const newLoc = await getCurrentCoords(true);
    if (newLoc) await loadNearbyGems(newLoc, language);
  };

  useEffect(() => {
    if (cachedLocation && nearbyGems.length === 0 && !isNearbyLoading && locationStatus === 'ready') loadNearbyGems(cachedLocation, language);
  }, [cachedLocation, language, nearbyGems.length, isNearbyLoading, locationStatus, loadNearbyGems]);

  useEffect(() => { getCurrentCoords(); }, [getCurrentCoords]);

  const handleHistorySelection = (item: HistoryItem) => {
    setCurrentResultId(item.id);
    setAppState('result');
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  const handleClearHistory = async () => {
    if (user) {
      const cleared = await historyService.clearAll(user.id);
      if (!cleared) {
        console.error('[SnapTrip] Failed to clear history from database');
        window.alert(t('error'));
        return;
      }
    }

    setHistory([]);
  };

  const handleStartGuide = (landmarkName: string) => {
    setGuideLandmark(landmarkName);
    setGuideLocationHint(nearbyAreaName);
    setAppState('guide');
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  return (
    <div className="min-h-screen bg-[#070A0E] text-white font-display flex flex-col relative overflow-x-hidden">
      {/* Background Aesthetics */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="st-aurora-far" />
        <div className="st-aurora-a" />
        <div className="st-aurora-b" />
        <div className="st-grain" />
      </div>

      <div className="relative z-10 flex flex-col flex-1">
        {(appState === 'welcome' || appState === 'about') && (
        <Header 
          onToggleSidebar={() => setSidebarOpen(true)} 
          language={language} setLanguage={handleSetLanguage} 
          user={user} onLogin={() => setLoginModalOpen(true)} onLogout={() => supabase.auth.signOut()} 
          credits={credits} maxCredits={10} isSyncing={isSyncing} 
          onShowAbout={() => { setAppState('about'); window.scrollTo({ top: 0, behavior: 'instant' }); }}
        />
      )}
      
      {isQuotaExceeded && (
        <div className="fixed top-20 left-4 right-4 z-[100] bg-amber-500 rounded-2xl p-4 shadow-2xl border border-white/20">
          <div className="flex items-center gap-3 mb-2">
            <span className="material-symbols-outlined">warning</span>
            <p className="text-sm font-black text-white">{t('quotaExceeded')}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={handleOpenSelectKey} className="flex-1 bg-white/20 hover:bg-white/30 text-white text-[10px] font-black py-2 rounded-xl border border-white/20 transition-all uppercase tracking-widest">{t('useOwnKey')}</button>
            <button onClick={() => setIsQuotaExceeded(false)} className="px-4 bg-black/20 text-white text-[10px] font-black py-2 rounded-xl transition-all">{t('cancel')}</button>
          </div>
        </div>
      )}

      {isApiRateLimited && (
        <div className="fixed top-20 left-4 right-4 z-[100] bg-red-500 rounded-2xl p-4 shadow-2xl border border-white/20">
          <div className="flex items-center gap-3 mb-2">
            <span className="material-symbols-outlined">hourglass_empty</span>
            <p className="text-sm font-black text-white">[{t('error')}] API 서버 접속량이 많습니다.</p>
          </div>
          <p className="text-xs text-white/90 font-bold mb-3">개인 API 키를 등록하면 대기 없이 바로 이용 가능해요!</p>
          <div className="flex gap-2">
            <button onClick={() => { setIsApiRateLimited(false); handleOpenSelectKey(); }} className="flex-1 bg-white/20 hover:bg-white/30 text-white text-[10px] font-black py-2 rounded-xl border border-white/20 transition-all uppercase tracking-widest">{t('useOwnKey')}</button>
            <button onClick={() => setIsApiRateLimited(false)} className="px-4 bg-black/20 text-white text-[10px] font-black py-2 rounded-xl transition-all">{t('cancel')}</button>
          </div>
        </div>
      )}

      <input type="file" ref={fileInputRef} accept="image/*" onChange={(e) => e.target.files?.[0] && handleStartAnalysis(e.target.files[0])} className="hidden" />
      <input type="file" ref={cameraInputRef} accept="image/*" capture="environment" onChange={(e) => e.target.files?.[0] && handleStartAnalysis(e.target.files[0])} className="hidden" />
      
      <main className="flex-1 relative">
        <div className="flex flex-col flex-1">
          {appState === 'welcome' && (
            <WelcomeScreen 
              onUploadClick={() => fileInputRef.current?.click()} 
              onCameraClick={() => cameraInputRef.current?.click()} 
              language={language} user={user} onLogin={() => setLoginModalOpen(true)} 
              recentHistory={history} onSelectHistory={handleHistorySelection} 
              credits={credits} onReload={handleReload} isSyncing={isSyncing}
              nearbyGems={nearbyGems} nearbyAreaName={nearbyAreaName} nearbyWeather={nearbyWeather}
              isNearbyLoading={isNearbyLoading} onRefreshLocation={handleRefreshLocation}
              locationStatus={locationStatus}
              onStartGuide={handleStartGuide} onShowMoreNearby={handleLoadMoreNearby} isMoreNearbyLoading={isMoreNearbyLoading}
            />
          )}
          {appState === 'result' && history.find(i => i.id === currentResultId) && (
            <ResultScreen 
              result={history.find(i => i.id === currentResultId)!} 
              onReset={() => { setAppState('welcome'); setCurrentResultId(null); }} 
              onNewPhoto={() => { setAppState('welcome'); setCurrentResultId(null); setTimeout(() => cameraInputRef.current?.click(), 300); }} 
              language={language} credits={credits} 
              onDelete={(id: string) => { if (!window.confirm(t('confirmDelete'))) return; if (user) historyService.deleteResult(user.id, id); setHistory(prev => prev.filter(item => item.id !== id)); setAppState('welcome'); }} 
            />
          )}
          {appState === 'guide' && guideLandmark && (
            <GuideScreen landmarkName={guideLandmark} language={language} onBack={() => { setAppState('welcome'); setGuideLandmark(null); }} locationHint={guideLocationHint} />
          )}
          {appState === 'about' && (
            <AboutScreen language={language} onBack={() => setAppState('welcome')} />
          )}
        </div>
      </main>
      <HistorySidebar history={history} onSelect={handleHistorySelection} isOpen={isSidebarOpen} onClose={() => setSidebarOpen(false)} language={language} onClearHistory={handleClearHistory} user={user} isSyncing={isSyncing} onRefresh={() => user && syncUserData(user.id)} />
      <LoginModal isOpen={isLoginModalOpen} onClose={() => setLoginModalOpen(false)} onLogin={() => {}} language={language} />
      </div>
    </div>
  );
};

export default App;
