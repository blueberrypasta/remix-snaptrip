import { fetchCurrentWeather } from './services/weatherService';
import React, { useState, useRef, useEffect, useCallback, Suspense, lazy } from 'react';
import { TasteEntry } from './components/TasteEntry';
import { WelcomeScreen } from './components/WelcomeScreen';
import { Header } from './components/Header';

const ResultScreen = lazy(() => import('./components/ResultScreen').then(m => ({ default: m.ResultScreen })));
const GuideScreen = lazy(() => import('./components/GuideScreen').then(m => ({ default: m.GuideScreen })));
const AboutScreen = lazy(() => import('./components/AboutScreen').then(m => ({ default: m.AboutScreen })));
const HistorySidebar = lazy(() => import('./components/HistorySidebar').then(m => ({ default: m.HistorySidebar })));
const LoginModal = lazy(() => import('./components/LoginModal').then(m => ({ default: m.LoginModal })));
import { analyzeImageStream, fetchNearbyPlaces, fetchMoreNearbyPlaces } from './services/geminiService';
import { usageService } from './services/usageService';
import { historyService } from './services/historyService';
import { localPhotoService } from './services/localPhotoService';
import { supabase } from './services/supabaseClient';
import { fileToBase64 } from './utils/fileUtils';
import type { AppState, HistoryItem, Language, User, LocationData, LocationSource } from './types';
import { useTranslations } from './translations';
import { Icon } from './components/Icon';

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
  const [weatherStatus,setWeatherStatus]=useState<'idle'|'loading'|'ready'|'error'>('idle');
  const [weatherRevision,setWeatherRevision]=useState(0);
  const [nearbyWeather, setNearbyWeather] = useState<{emoji: string, tempC: number} | null>(null);
  const [isNearbyLoading, setIsNearbyLoading] = useState(false);
  const [locationStatus, setLocationStatus] = useState<'idle' | 'loading' | 'ready' | 'denied' | 'unavailable' | 'error' | 'empty'>('idle');
  const [isMoreNearbyLoading, setIsMoreNearbyLoading] = useState(false);
  const [retryFile, setRetryFile] = useState<File | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [activeAnalysisRequestId, setActiveAnalysisRequestId] = useState<string | null>(null);

  const t = useTranslations(language);
  const isSyncingRef = useRef(isSyncing);
  useEffect(() => { isSyncingRef.current = isSyncing; }, [isSyncing]);
  const isSyncingInProgress = useRef(false);
  const isAnalyzingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const currentRequestIdRef = useRef<string | null>(null);
  const pendingFileRef = useRef<File | null>(null);
  const hasUserSelectedLanguage = useRef(false);
  const nearbyLanguageRef = useRef(language);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try { localStorage.removeItem('SNAPTRIP_API_KEY'); } catch { /* Storage may be unavailable. */ }
  }, []);

  const handleCloseHistory = useCallback(() => setSidebarOpen(false), []);
  const handleReload = () => { window.location.reload(); };

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
      const hydratedHistory = await Promise.all(dbHistory.map(async item => {
        if (item.imageData) return item; // Legacy server-hosted image.
        try {
          return { ...item, imageData: await localPhotoService.get(userId, item.id) };
        } catch {
          return item;
        }
      }));
      setHistory(prev => {
        const localOnlyItems = prev.filter(l => l.id.startsWith('temp_') || (l.status === 'success' && !hydratedHistory.some(d => d.id === l.id)));
        const combined = [...localOnlyItems, ...hydratedHistory.filter(d => !localOnlyItems.some(l => l.id === d.id))];
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

  const handleCancelAnalysis = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    const canceledReqId = currentRequestIdRef.current;
    currentRequestIdRef.current = null;
    isAnalyzingRef.current = false;
    setActiveAnalysisRequestId(null);
    if (canceledReqId) {
      setHistory(prev => prev.filter(item => item.id !== canceledReqId));
    }
    setAppState('welcome');
    setCurrentResultId(null);
  }, []);

  const handleStartAnalysis = async (file: File) => {
    if (isAnalyzingRef.current) return;
    isAnalyzingRef.current = true;
    pendingFileRef.current = file;
    setRetryFile(file);
    setAnalysisError(null);

    const requestId = `temp_${crypto.randomUUID()}`;
    currentRequestIdRef.current = requestId;
    setActiveAnalysisRequestId(requestId);
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      if (isSyncingRef.current) {
        let waitCount = 0;
        while (isSyncingRef.current && waitCount < 10) {
          if (controller.signal.aborted) return;
          await new Promise(r => setTimeout(r, 200));
          waitCount++;
        }
        if (isSyncingRef.current) {
          throw new Error('Sync timeout');
        }
      }

      if (controller.signal.aborted || currentRequestIdRef.current !== requestId) return;

      const activeUserId = user?.id || 'guest';
      const canAnalyze = await usageService.canAnalyze(activeUserId);
      if (controller.signal.aborted || currentRequestIdRef.current !== requestId) return;
      if (!canAnalyze) {
        if (!user) {
          setLoginModalOpen(true);
        } else {
          setIsQuotaExceeded(true);
        }
        return;
      }

      setIsQuotaExceeded(false);

      const { base64, mimeType, location: exifLocation } = await fileToBase64(file);
      if (controller.signal.aborted || currentRequestIdRef.current !== requestId) return;

      const finalLocation = exifLocation || cachedLocation || null;
      const locationSource: LocationSource = exifLocation ? 'exif' : (cachedLocation ? 'device' : 'none');

      const newItem: HistoryItem = { 
        id: requestId,
        status: 'processing', 
        imageData: `data:${mimeType};base64,${base64}`, 
        timestamp: Date.now(), 
        progress: 5,
        locationSource,
        locationData: finalLocation || undefined
      };
      
      setHistory(prev => [newItem, ...prev]);
      setCurrentResultId(requestId);
      setAppState('result'); 
      
      try {
        const result = await analyzeImageStream(base64, mimeType, language, (partial) => {
          if (currentRequestIdRef.current !== requestId || controller.signal.aborted) return;
          setHistory(prev => prev.map(item => item.id === requestId ? { ...item, ...partial, progress: Math.max(item.progress || 0, 95) } : item));
        }, finalLocation, locationSource, controller.signal);
        
        if (controller.signal.aborted || currentRequestIdRef.current !== requestId) return;

        setActiveAnalysisRequestId(null);
        const finalItem: HistoryItem = { ...newItem, ...result, status: 'success', progress: 100 };
        setHistory(prev => prev.map(item => item.id === requestId ? finalItem : item));
        
        const newCredits = await usageService.deductCredit(activeUserId);
        setCredits(newCredits);
        pendingFileRef.current = null;
        setRetryFile(null);
        
        if (user) {
          const dbId = await historyService.saveResult(user.id, finalItem);
          if (dbId && currentRequestIdRef.current === requestId && !controller.signal.aborted) {
            try {
              await localPhotoService.save(user.id, dbId, finalItem.imageData);
            } catch (photoError) {
              console.warn('[SlapTrip] Photo could not be saved on this device:', photoError);
            }
            setHistory(prev => prev.map(item => item.id === requestId ? { ...item, id: dbId, isAutoSaved: true } : item));
            setCurrentResultId(prevId => prevId === requestId ? dbId : prevId);
          }
        }
      } catch (e: any) { 
        if (controller.signal.aborted || currentRequestIdRef.current !== requestId) return;
        console.warn("[SlapTrip] Analysis failed");
        if (e?.message?.includes('429') || e?.status === 429 || e?.message === 'rate_limited') {
          setAnalysisError(language === 'ko' ? '요청이 많아요. 잠시 후 같은 사진으로 다시 시도해 주세요.' : 'Too many requests. Wait a moment, then retry the same photo.');
        } else if (e?.message?.includes('quota')) {
          setIsQuotaExceeded(true);
        } else {
          setAnalysisError(language === 'ko' ? '사진 분석 중 오류가 발생했습니다.' : 'An error occurred during analysis.');
        }
        setHistory(prev => prev.filter(item => item.id !== requestId));
        setAppState('welcome');
        setCurrentResultId(null);
      }
    } catch (e: any) {
      if (controller.signal.aborted || currentRequestIdRef.current !== requestId) return;
      console.warn("[SlapTrip] Image processing failed");
      if (e?.message === 'Sync timeout') {
        setAnalysisError(language === 'ko' ? '동기화가 지연되고 있어요. 잠시 후 다시 시도해 주세요.' : 'Sync is taking longer. Please retry shortly.');
      } else if (e?.message === 'image_too_large') {
        setAnalysisError(language === 'ko' ? '20MB 이하 사진을 선택해 주세요.' : 'Please choose a photo smaller than 20 MB.');
      } else {
        setAnalysisError(language === 'ko' ? '사진을 읽지 못했어요. JPG 또는 PNG 사진을 선택해 주세요.' : 'Could not read this photo. Please choose a JPG or PNG image.');
      }
      setAppState('welcome');
    } finally {
      if (currentRequestIdRef.current === requestId) {
        isAnalyzingRef.current = false;
        abortControllerRef.current = null;
        setActiveAnalysisRequestId(null);
      }
    }
  };
  const loadNearbyGems = useCallback(async (loc: LocationData, lang: Language) => {
    setIsNearbyLoading(true);
    setLocationStatus('loading');
    try {
      const result = await fetchNearbyPlaces(loc, lang);
      setNearbyGems(result.places);
      setNearbyAreaName(result.areaName);
      setLocationStatus(result.places.length > 0 ? 'ready' : 'empty');
    } catch (error: any) { 
      // Do nothing globally to prevent full-screen quota error on startup
      console.warn("Nearby places error:", error);
      setLocationStatus('error');
    } finally { setIsNearbyLoading(false); }
  }, []);

  useEffect(()=>{
    if(!cachedLocation){setNearbyWeather(null);setWeatherStatus('idle');return;}
    const controller=new AbortController();
    setNearbyWeather(null);setWeatherStatus('loading');
    fetchCurrentWeather(cachedLocation,controller.signal).then(weather=>{
      if(!controller.signal.aborted){setNearbyWeather(weather);setWeatherStatus('ready');}
    }).catch(()=>{if(!controller.signal.aborted)setWeatherStatus('error');});
    return()=>controller.abort();
  },[cachedLocation,weatherRevision]);

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
    setNearbyGems([]); setNearbyAreaName(''); setWeatherRevision(v=>v+1);
    const newLoc = await getCurrentCoords(true);
    if (newLoc) await loadNearbyGems(newLoc, language);
  };

  useEffect(() => {
    if (nearbyLanguageRef.current === language) return;
    nearbyLanguageRef.current = language;
    if (!cachedLocation) return;
    setNearbyGems([]);
    setNearbyAreaName('');
    void loadNearbyGems(cachedLocation, language);
  }, [cachedLocation, language, loadNearbyGems]);

  useEffect(() => {
    return () => {
      currentRequestIdRef.current = null;
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      isAnalyzingRef.current = false;
    };
  }, []);

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
      try { await localPhotoService.clearUser(user.id); } catch (e) { console.warn('[SlapTrip] Local photo cleanup failed:', e); }
    }

    setHistory([]);
  };

  const handleStartGuide = (landmarkName: string) => {
    setGuideLandmark(landmarkName);
    setGuideLocationHint(nearbyAreaName);
    setAppState('guide');
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  const handleFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) void handleStartAnalysis(file);
  };

  const handleDeleteResult = async (id: string) => {
    if (!window.confirm(t('confirmDelete'))) return;
    if (user) {
      const deleted = await historyService.deleteResult(user.id, id);
      if (!deleted) {
        window.alert(t('error'));
        return;
      }
      try { await localPhotoService.remove(user.id, id); } catch (e) { console.warn('[SlapTrip] Local photo cleanup failed:', e); }
    }
    setHistory(prev => prev.filter(item => item.id !== id));
    setAppState('welcome');
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
            <Icon name="warning" />
            <p className="text-sm font-black text-white">{t('quotaExceeded')}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setIsQuotaExceeded(false)} className="px-4 bg-black/20 text-white text-[10px] font-black py-2 rounded-xl transition-all">{t('cancel')}</button>
          </div>
        </div>
      )}

      {isApiRateLimited && (
        <div className="fixed top-20 left-4 right-4 z-[100] bg-red-500 rounded-2xl p-4 shadow-2xl border border-white/20">
          <div className="flex items-center gap-3 mb-2">
            <Icon name="hourglass_empty" />
            <p className="text-sm font-black text-white">[{t('error')}] API 서버 접속량이 많습니다.</p>
          </div>
          <p className="text-xs text-white/90 font-bold mb-3">{language === 'ko' ? '잠시 후 다시 시도해 주세요.' : 'Please try again shortly.'}</p>
          <div className="flex gap-2">
            <button onClick={() => setIsApiRateLimited(false)} className="px-4 bg-black/20 text-white text-[10px] font-black py-2 rounded-xl transition-all">{t('cancel')}</button>
          </div>
        </div>
      )}

      {analysisError && (
        <div role="alert" className="fixed top-20 left-4 right-4 z-[100] bg-rose-600 rounded-2xl p-4 shadow-2xl border border-white/20">
          <div className="flex items-center gap-3 mb-2">
            <Icon name="error" />
            <p className="text-sm font-black text-white">{analysisError}</p>
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            {retryFile && (
              <button onClick={() => { const file = pendingFileRef.current; setAnalysisError(null); if (file) void handleStartAnalysis(file); }} className="min-h-11 px-3 py-1.5 bg-white text-rose-700 text-xs font-bold rounded-xl shadow transition-all">
                {language === 'ko' ? '같은 사진 다시 시도' : 'Retry Same Photo'}
              </button>
            )}
            <button onClick={() => { setAnalysisError(null); fileInputRef.current?.click(); }} className="min-h-11 px-3 py-1.5 bg-white/20 text-white text-xs font-bold rounded-xl transition-all">
              {language === 'ko' ? '새 사진 선택' : 'Choose New Photo'}
            </button>
            <button onClick={() => { setAnalysisError(null); pendingFileRef.current = null; setRetryFile(null); }} className="min-h-11 px-3 py-1.5 bg-black/20 text-white text-xs font-bold rounded-xl transition-all">
              {t('cancel')}
            </button>
          </div>
        </div>
      )}

      {activeAnalysisRequestId && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[90] flex items-center gap-3 px-4 py-2 bg-slate-900/90 border border-white/20 rounded-full shadow-2xl backdrop-blur-md">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
          <span className="text-xs font-bold text-white">{language === 'ko' ? '분석 중...' : 'Analyzing...'}</span>
          <button onClick={handleCancelAnalysis} className="min-h-11 px-3 py-1 bg-white/20 hover:bg-white/30 text-white text-xs font-semibold rounded-full transition-all">
            {language === 'ko' ? '취소' : 'Cancel'}
          </button>
        </div>
      )}

      <input type="file" ref={fileInputRef} accept="image/*" onChange={handleFileInputChange} className="hidden" />
      <input type="file" ref={cameraInputRef} accept="image/*" capture="environment" onChange={handleFileInputChange} className="hidden" />
      
      <main className="flex-1 relative">
        <Suspense fallback={<div role="status" className="flex-1 flex items-center justify-center min-h-[300px] text-slate-400 text-sm">{language === 'ko' ? '불러오는 중…' : 'Loading…'}</div>}>
          <div key={appState} className="flex flex-col flex-1 t-screen">
            {appState === 'welcome' && (
              <WelcomeScreen
                onUploadClick={() => fileInputRef.current?.click()}
                onCameraClick={() => cameraInputRef.current?.click()}
                language={language} user={user} onLogin={() => setLoginModalOpen(true)}
                recentHistory={history} onSelectHistory={handleHistorySelection}
                credits={credits} onReload={handleReload} isSyncing={isSyncing}
                nearbyGems={nearbyGems} nearbyAreaName={nearbyAreaName} nearbyWeather={nearbyWeather} weatherStatus={weatherStatus} onRetryWeather={()=>{if(cachedLocation)setWeatherRevision(v=>v+1);else void handleRefreshLocation();}}
                isNearbyLoading={isNearbyLoading} onRefreshLocation={handleRefreshLocation}
                locationStatus={locationStatus}
                tasteRecommendations={<TasteEntry key={user?.id || 'guest'} language={language} location={cachedLocation} onRequestLocation={() => getCurrentCoords()} onLogin={() => setLoginModalOpen(true)} userId={user?.id} />}
                onStartGuide={handleStartGuide} onShowMoreNearby={handleLoadMoreNearby} isMoreNearbyLoading={isMoreNearbyLoading}
              />
            )}
            {appState === 'result' && history.find(i => i.id === currentResultId) && (
              <ResultScreen
                result={history.find(i => i.id === currentResultId)!}
                onReset={() => { if (activeAnalysisRequestId) handleCancelAnalysis(); else { setAppState('welcome'); setCurrentResultId(null); } }}
                onNewPhoto={() => { if (activeAnalysisRequestId) handleCancelAnalysis(); setAppState('welcome'); setCurrentResultId(null); setTimeout(() => cameraInputRef.current?.click(), 300); }}
                language={language} credits={credits}
                onDelete={handleDeleteResult}
              />
            )}
            {appState === 'guide' && guideLandmark && (
              <GuideScreen landmarkName={guideLandmark} language={language} onBack={() => { setAppState('welcome'); setGuideLandmark(null); }} locationHint={guideLocationHint} />
            )}
            {appState === 'about' && (
              <AboutScreen language={language} onBack={() => setAppState('welcome')} />
            )}
          </div>
        </Suspense>
      </main>
      <footer className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 px-4 py-3 text-center text-[11px] text-slate-400">
        <a href="mailto:contact@slaptrip.com?subject=%5BSlapTrip%20Support%5D%20Inquiry" className="underline underline-offset-4 hover:text-white">{t('contactDev')}</a>
        <a href="/identify-landmark-from-photo.html" className="underline underline-offset-4 hover:text-white">{t('howToIdentify')}</a>
        <a href="/privacy.html" className="underline underline-offset-4 hover:text-white">Privacy · 개인정보처리방침</a>
        <span className="mx-2">·</span><a href="/terms.html" className="underline underline-offset-4 hover:text-white">Terms · 이용약관</a>
        <a href="mailto:contact@slaptrip.com" className="basis-full underline-offset-4 hover:text-white hover:underline">contact@slaptrip.com</a>
      </footer>
      {isSidebarOpen && (
        <Suspense fallback={null}>
          <HistorySidebar history={history} onSelect={handleHistorySelection} isOpen={isSidebarOpen} onClose={handleCloseHistory} language={language} onClearHistory={handleClearHistory} user={user} isSyncing={isSyncing} onRefresh={() => user && syncUserData(user.id)} />
        </Suspense>
      )}
      {isLoginModalOpen && (
        <Suspense fallback={null}>
          <LoginModal isOpen={isLoginModalOpen} onClose={() => setLoginModalOpen(false)} onLogin={() => {}} language={language} />
        </Suspense>
      )}
      </div>
    </div>
  );
};

export default App;
