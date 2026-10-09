
import NearbyPlaceList from './NearbyPlaceList';
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslations } from '../translations';
import type { Language, User, HistoryItem } from '../types';

interface WelcomeScreenProps {
  tasteRecommendations?: React.ReactNode;
  onUploadClick: () => void;
  onCameraClick: () => void;
  language: Language;
  user: User | null;
  onLogin: () => void;
  recentHistory: HistoryItem[];
  onSelectHistory: (item: HistoryItem) => void;
  credits: number;
  onReload: () => void;
  isSyncing?: boolean;
  nearbyGems?: {name: string, type: string, rating: string | number, reviewCount: string | number, description: string, url: string}[];
  nearbyAreaName?: string;
  nearbyWeather?: {emoji: string, tempC: number} | null;
  weatherStatus?: 'idle'|'loading'|'ready'|'error';
  onRetryWeather?:()=>void;
  isNearbyLoading?: boolean;
  locationStatus?: 'idle' | 'loading' | 'ready' | 'denied' | 'unavailable' | 'error' | 'empty';
  onRefreshLocation?: () => void;
  onStartGuide?: (landmarkName: string) => void;
  onShowMoreNearby?: () => void;
  isMoreNearbyLoading?: boolean;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  onUploadClick, onCameraClick, language, user, onLogin, recentHistory, onSelectHistory, credits, onReload, isSyncing = false,
  nearbyGems = [], nearbyAreaName = '', nearbyWeather = null, isNearbyLoading = false, locationStatus = 'idle', onRefreshLocation, onStartGuide,
  onShowMoreNearby, isMoreNearbyLoading = false, tasteRecommendations, weatherStatus='idle', onRetryWeather
}) => {
  const t = useTranslations(language);
  const [displayLimit, setDisplayLimit] = useState(10);
  const [isNearbyExpanded, setIsNearbyExpanded] = useState(false);
  const [tempUnit, setTempUnit] = useState<'C' | 'F'>('C');
  const [activeGuide, setActiveGuide] = useState<{landmarkName: string} | null>(null);
  const observer = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('snaptrip_active_guide');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Date.now() - parsed.lastUpdated < 24 * 60 * 60 * 1000) {
          setActiveGuide({ landmarkName: parsed.landmarkName });
        }
      } catch (e) {}
    }
  }, []);

  const lastElementRef = useCallback((node: HTMLDivElement | null) => {
    if (isSyncing) return;
    if (observer.current) observer.current.disconnect();
    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && recentHistory.length > displayLimit) {
        setDisplayLimit(prev => prev + 10);
      }
    });
    if (node) observer.current.observe(node);
  }, [recentHistory.length, displayLimit, isSyncing]);

  const visibleHistory = recentHistory.slice(0, displayLimit);

  const getDisplayTemp = () => {
    if (!nearbyWeather) return "";
    const { tempC } = nearbyWeather;
    if (tempUnit === 'C') return `${Math.round(tempC)}°C`;
    const tempF = (tempC * 9/5) + 32;
    return `${Math.round(tempF)}°F`;
  };

  return (
    <div className="flex flex-col w-full max-w-xl mx-auto pb-32 animate-fade-in min-h-[500px]">

      <section className="p-4 w-full">
        <div className="relative w-full overflow-hidden rounded-[2.25rem] sm:rounded-[2.5rem] shadow-2xl h-[390px] sm:h-auto sm:aspect-video flex flex-col items-center justify-center p-5 sm:p-6 text-center group min-h-[300px] border border-white/5">
          <div className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&q=80&w=1000')" }}></div>
          <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/40 to-black/90"></div>

          {/* Corner Reticles */}
          <div className="absolute top-6 left-6 w-5 h-5 border-t-[1.5px] border-l-[1.5px] border-[#D9B26A]/60 rounded-tl-sm pointer-events-none" />
          <div className="absolute top-6 right-6 w-5 h-5 border-t-[1.5px] border-r-[1.5px] border-[#D9B26A]/60 rounded-tr-sm pointer-events-none" />
          <div className="absolute bottom-6 left-6 w-5 h-5 border-b-[1.5px] border-l-[1.5px] border-[#D9B26A]/60 rounded-bl-sm pointer-events-none" />
          <div className="absolute bottom-6 right-6 w-5 h-5 border-b-[1.5px] border-r-[1.5px] border-[#D9B26A]/60 rounded-br-sm pointer-events-none" />

          {/* Docent Ready Overlay */}
          <div className="absolute top-8 left-1/2 -translate-x-1/2 flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-black/40 backdrop-blur-md border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="w-1.5 h-1.5 rounded-full bg-[#D9B26A] animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#D9B26A]">{t('docentReady') || 'Docent Ready'}</span>
          </div>

          <div className="relative z-10 flex flex-col items-center gap-3 mt-auto w-full mb-2 sm:mb-4">
            <h2 className="text-[28px] sm:text-5xl font-serif italic text-[#F4EFE6] leading-tight break-keep drop-shadow-2xl">{t('welcomeMessage')}</h2>
            <p className="text-[#D5DCE3] text-[11px] sm:text-xs font-semibold max-w-[340px] mx-auto leading-relaxed mb-2 sm:mb-4 break-keep font-sans tracking-wide">{t('welcomeSub')}</p>

            <div className="flex w-full gap-3 px-2">
              <button
                onClick={onCameraClick}
                disabled={isSyncing}
                className="flex-1 flex items-center justify-center gap-2.5 rounded-full bg-gradient-to-b from-[#E6C079] to-[#C99A4F] h-14 text-[#1B130A] text-sm font-black shadow-[0_10px_30px_-10px_rgba(217,178,106,0.5),0_0_40px_-10px_rgba(217,178,106,0.3)] active:scale-95 disabled:opacity-50 transition-all font-sans ring-1 ring-white/20 ring-inset"
              >
                {isSyncing ? (
                  <div className="w-5 h-5 border-2 border-black/20 border-t-black rounded-full animate-spin"></div>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[20px]">photo_camera</span>
                    {t('identifyCamera')}
                  </>
                )}
              </button>
              <button
                onClick={onUploadClick}
                disabled={isSyncing}
                className="flex-1 flex items-center justify-center gap-2.5 rounded-full bg-white/5 backdrop-blur-xl border border-white/10 h-14 text-white text-sm font-black active:scale-95 disabled:opacity-50 transition-all font-sans hover:bg-white/10"
              >
                {isSyncing ? (
                  <span className="text-[10px] animate-pulse uppercase tracking-widest">{t('syncing')}</span>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[20px]">upload_file</span>
                    {t('choosePhoto')}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </section>

      {activeGuide && (
        <section className="px-5 mt-2 animate-fade-in-up">
           <button
             onClick={() => onStartGuide?.(activeGuide.landmarkName)}
             className="w-full p-4 bg-primary/20 border border-primary/30 rounded-2xl flex items-center justify-between group active:scale-[0.98] transition-all"
           >
              <div className="flex items-center gap-3">
                 <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary animate-pulse">
                    <span className="material-symbols-outlined">record_voice_over</span>
                 </div>
                 <div className="text-left">
                    <p className="text-[10px] font-black text-primary uppercase tracking-widest">{t('resumeGuide')}</p>
                    <h4 className="text-sm font-black text-white truncate max-w-[200px]">{activeGuide.landmarkName}</h4>
                 </div>
              </div>
              <span className="material-symbols-outlined text-primary group-hover:translate-x-1 transition-transform">arrow_forward</span>
           </button>
        </section>
      )}



      {tasteRecommendations && (
        <section className="px-4 mt-3 mb-3" onClick={e=>e.stopPropagation()}>{tasteRecommendations}</section>
      )}

      <section className="px-4 mt-1">
        <div className={`bg-[#111b19]/80 rounded-[1.5rem] shadow-[0_10px_30px_-18px_rgba(0,0,0,0.9)] border border-white/[0.08] overflow-hidden transition-all duration-300 `}>
            <div className="px-3 py-2.5 sm:px-4 flex flex-col gap-0">
                <div className="flex items-center justify-between gap-2">
                    <button type="button" aria-expanded={isNearbyExpanded} aria-controls="nearby-popular-list" onClick={() => setIsNearbyExpanded(!isNearbyExpanded)} className="min-h-11 min-w-0 flex items-center gap-1.5 text-left text-[14px] font-semibold text-white focus-visible:outline-emerald-300 rounded-lg">
                        <span>{language==='ko'?'주변 유명 장소':t('nearbyGems')}</span>
                        <svg aria-hidden="true" className={`w-3.5 h-3.5 shrink-0 text-white/50 transition-transform ${isNearbyExpanded?'rotate-180':''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg>
                    </button>
                    <button aria-label={t('retryLocation')} onClick={()=>onRefreshLocation?.()} className="w-11 h-11 text-white/60 flex items-center justify-center rounded-full hover:bg-white/5"><svg aria-hidden="true" className={`w-3.5 h-3.5 ${isNearbyLoading?'animate-spin':''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 12-1l2 6M4 12l2 6a7 7 0 0 0 12-1"/></svg></button>
                </div>
                <div className="flex items-center gap-1.5 min-h-11" data-nearby-context>
                    <div className="min-w-0 flex-1 text-[11px] text-white/55 truncate" title={nearbyAreaName}>
                      {nearbyAreaName ? `📍 ${nearbyAreaName}` : language==='ko' ? (locationStatus==='denied'?'위치 권한 필요':isNearbyLoading?'주변 찾는 중…':'내 주변') : (locationStatus==='denied'?'Location needed':isNearbyLoading?'Finding nearby…':'Nearby')}
                    </div>
                    {nearbyWeather && Number.isFinite(nearbyWeather.tempC) ? (
                        <button data-weather-display title={language==='ko'?'현재 날씨 · °C/°F 전환':'Current weather · switch °C/°F'} onClick={()=>setTempUnit(prev=>prev==='C'?'F':'C')} className="shrink-0 min-h-11 px-1.5 inline-flex items-center gap-1 text-[12px] text-white/85 rounded-lg hover:bg-white/5">
                          <span aria-hidden="true">{nearbyWeather.emoji}</span><span>{getDisplayTemp()}</span>
                        </button>
                    ) : (
                        <button data-weather-status disabled={weatherStatus==='loading'} onClick={()=>onRetryWeather?.()} className="shrink-0 min-h-11 px-1 text-[11px] text-white/55 rounded-lg hover:bg-white/5" aria-label={language==='ko'?'날씨 다시 불러오기':'Retry weather'}>
                          {language==='ko'?(weatherStatus==='loading'?'날씨 확인 중…':weatherStatus==='error'?'날씨 재시도':'날씨 · 위치 필요'):(weatherStatus==='loading'?'Weather…':weatherStatus==='error'?'Retry weather':'Weather · location')}
                        </button>
                    )}
                </div>
                {nearbyWeather && <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer" className="self-start text-[9px] leading-3 text-white/40 hover:text-white/70">Weather: Open-Meteo</a>}
            </div>


            <div id="nearby-popular-list" hidden={!isNearbyExpanded} className={`overflow-hidden transition-all duration-300 ${isNearbyExpanded ? 'max-h-[3000px] opacity-100 mb-3' : 'max-h-0 opacity-0'}`}>
                <div className="px-4 sm:px-5 pt-0">
                    <div className="w-full h-px bg-white/5 mb-3"></div>
                    {isNearbyLoading && nearbyGems.length === 0 ? (
                        <div className="py-16 flex flex-col items-center gap-4">
                            <div className="w-8 h-8 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin"></div>
                            <p className="text-[10px] font-black text-emerald-500/60 uppercase tracking-widest animate-pulse">{t('findingGems')}</p>
                        </div>
                    ) : nearbyGems.length > 0 ? (
                        <div className="flex flex-col gap-3">
                            <NearbyPlaceList places={nearbyGems} language={language} onStartGuide={onStartGuide} />

                            {nearbyGems.length < 20 && (
                              <button
                                onClick={(e) => { e.stopPropagation(); onShowMoreNearby?.(); }}
                                disabled={isMoreNearbyLoading}
                                className="mt-2 w-full h-12 rounded-full bg-white/5 border border-white/[0.08] text-[13px] font-semibold text-emerald-300 flex items-center justify-center gap-2 hover:bg-white/10 active:scale-[0.98] transition-all disabled:opacity-50"
                              >
                                {isMoreNearbyLoading ? (
                                  <div className="w-4 h-4 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin"></div>
                                ) : (
                                  <>
                                    <span className="material-symbols-outlined text-[18px]">add_circle</span>
                                    {t('findMore')}
                                  </>
                                )}
                              </button>
                            )}
                        </div>
                    ) : (
                        <div className="py-12 flex flex-col items-center justify-center text-center px-6 gap-4">
                            <span className="material-symbols-outlined text-emerald-400 text-4xl opacity-70">{locationStatus === 'denied' ? 'location_off' : locationStatus === 'empty' ? 'explore_off' : 'wifi_off'}</span>
                            <div className="flex flex-col gap-1">
                                <p className="text-sm font-black text-white">{locationStatus === 'denied' ? t('locationDenied') : locationStatus === 'empty' ? t('noGemsFound') : t('locationUnavailable')}</p>
                                <p className="text-[11px] text-slate-300 font-bold leading-relaxed">{locationStatus === 'empty' ? t('emptyNearbyGuide') : t('locationPermissionGuide')}</p>
                            </div>
                            <div className="flex flex-wrap justify-center gap-2">
                              <button onClick={onRefreshLocation} className="min-h-11 px-5 rounded-full border border-emerald-400/30 text-emerald-300 text-xs font-black hover:bg-emerald-400/10">{t('retryLocation')}</button>
                              <button onClick={onCameraClick} className="min-h-11 px-5 rounded-full bg-[#D9B26A] text-[#1B130A] text-xs font-black">{t('identifyCamera')}</button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
      </section>

      <div className="px-6 pt-10 pb-2 flex justify-between items-center">
        <h3 className="text-[19px] font-bold tracking-[-0.01em] text-white flex items-center gap-2"><span className="material-symbols-outlined text-primary text-[20px]">history</span>{t('recentActivity')}</h3>
        {isSyncing && <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 tracking-widest uppercase"><span className="material-symbols-outlined text-sm animate-spin">sync</span>{t('syncing')}</div>}
      </div>

      <section className="flex flex-col gap-6 px-4 pt-4 flex-1">
        {visibleHistory.length > 0 ? (
          visibleHistory.map((item, index) => (
            <article key={item.id} ref={index === visibleHistory.length - 1 ? lastElementRef : null} onClick={() => (item.status === 'success' || item.status === 'processing') && onSelectHistory(item)} className="rounded-[1.75rem] bg-card-dark overflow-hidden border border-white/[0.06] shadow-[0_14px_34px_-20px_rgba(0,0,0,0.9)] cursor-pointer active:scale-[0.98] transition-all">
                <div className="relative h-48 sm:h-56">
                    {item.imageData ? <img src={item.imageData} alt="" className={`w-full h-full object-cover ${item.status === 'processing' ? 'blur-sm opacity-50' : ''}`} /> : <span className="material-symbols-outlined text-slate-500">image_not_supported</span>}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"></div>
                    {item.status === 'processing' && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-black/40 backdrop-blur-[2px]">
                            <div className="w-14 h-14 border-4 border-white/10 rounded-full animate-spin border-t-primary mb-4"></div>
                            <span className="text-xs font-black text-white">{Math.round(item.progress || 0)}%</span>
                        </div>
                    )}
                    <div className="absolute bottom-4 left-4 right-4"><h4 className="text-lg font-bold text-white truncate">{item.title || (item.status === 'processing' ? t('exploring') : '')}</h4></div>
                </div>
                <div className="p-4 flex justify-between items-center text-[10px] font-bold text-slate-400">
                    <div className="flex items-center gap-1.5"><span className="material-symbols-outlined text-[14px] text-primary/60">schedule</span><span>{new Date(item.timestamp).toLocaleDateString()}</span></div>
                    <span className="text-primary font-semibold">{item.status === 'processing' ? t('processing') : t('viewResult')}</span>
                </div>
            </article>
          ))
        ) : (
          <div className="py-14 text-center flex flex-col items-center gap-4 text-slate-300"><span className="material-symbols-outlined text-5xl text-[#D9B26A]/70">travel_explore</span><div><p className="font-black text-sm text-white">{isSyncing ? t('loadingHistory') : t('noHistory')}</p>{!isSyncing && <p className="mt-1 text-xs text-slate-300">{t('historyEmptyGuide')}</p>}</div>{!isSyncing && <button onClick={onCameraClick} className="min-h-11 px-6 rounded-full bg-[#D9B26A] text-[#1B130A] text-xs font-black shadow-lg">{t('scanFirstLandmark')}</button>}</div>
        )}
      </section>
    </div>
  );
};
