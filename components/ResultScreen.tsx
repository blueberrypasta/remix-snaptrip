
import React, { useRef, useState, useEffect } from 'react';
import { useTranslations } from '../translations';
import type { HistoryItem, Language } from '../types';

declare const html2canvas: any;

interface ResultScreenProps {
  result: HistoryItem;
  onReset: () => void;
  onNewPhoto: () => void;
  language: Language;
  credits: number;
  onDelete: (id: string) => void;
}

export const ResultScreen: React.FC<ResultScreenProps> = ({ 
    result, onReset, onNewPhoto, language, onDelete
}) => {
  const t = useTranslations(language);
  const resultRef = useRef<HTMLDivElement>(null);
  const funFactRef = useRef<HTMLDivElement>(null);
  const [notification, setNotification] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isFunFactVisible, setIsFunFactVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (funFactRef.current && isFunFactVisible) {
        funFactRef.current.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center' 
        });
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [result.id, isFunFactVisible]);

  const generateBlob = async (): Promise<Blob | null> => {
    if (!resultRef.current) return null;
    try {
        const canvas = await html2canvas(resultRef.current, { 
            useCORS: true, scale: 3, backgroundColor: '#101922', logging: false,
            width: resultRef.current.offsetWidth, height: resultRef.current.offsetHeight
        });
        return new Promise((resolve) => canvas.toBlob((blob: Blob | null) => resolve(blob), 'image/png', 1.0));
    } catch (e) { return null; }
  };

  const handleAction = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
        const blob = await generateBlob();
        if (!blob) throw new Error();
        const file = new File([blob], `SnapTrip_${result.title}.png`, { type: 'image/png' });
        
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({ 
              files: [file], 
              title: 'SnapTrip Discovery', 
              text: `[SnapTrip] ${result.title}` 
            });
        } else {
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `SnapTrip_${result.title}.png`;
            link.click();
            URL.revokeObjectURL(url);
            setNotification(t('savedSuccess'));
            setTimeout(() => setNotification(''), 3000);
        }
    } catch (e) {
      console.error("Share error:", e);
    }
    setIsProcessing(false);
  };

  const isStreaming = result.status === 'processing';

  const clean = (txt: string | undefined) => {
    if (!txt) return "";
    return txt.replace(/\[TITLE\]:?/gi, '')
              .replace(/\[FACT\]:?/gi, '')
              .replace(/\[STORY\]:?/gi, '')
              .replace(/(\*\*|\*|#|_)/g, '')
              .trim();
  };

  const cleanTitle = clean(result.title) || (isStreaming ? t('analyzing') : '');
  const cleanFact = clean(result.fact);

  // 위치 출처에 따른 배지 정보 설정
  const getLocationBadge = () => {
    if (result.locationSource === 'exif') {
        return { 
            text: language === 'ko' ? '사진 속 위치 확인됨' : 'Location found in photo', 
            icon: 'gps_fixed', 
            color: 'bg-emerald-500/90' 
        };
    } else if (result.locationSource === 'device') {
        return { 
            text: language === 'ko' ? '현재 위치 주변 탐색' : 'Searching near you', 
            icon: 'my_location', 
            color: 'bg-blue-500/90' 
        };
    }
    return null;
  };

  const locationBadge = getLocationBadge();

  return (
    <div className="w-full max-w-xl mx-auto animate-fade-in pb-48 px-0 relative">
      {/* Top Bar — Cinematic Glass */}
      <nav className="fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-xl z-50 flex items-center justify-between px-5 py-4 pt-[env(safe-area-inset-top,20px)] pointer-events-none">
        <button 
          onClick={onReset} 
          className="pointer-events-auto flex items-center justify-center w-10 h-10 bg-black/40 backdrop-blur-xl rounded-full text-white border border-white/10 active:scale-95 transition-all shadow-xl"
        >
          <span className="material-symbols-outlined text-[18px]">arrow_back_ios_new</span>
        </button>
        
        <div className="pointer-events-auto flex items-center gap-2.5 px-4 py-2 bg-black/40 backdrop-blur-xl rounded-full border border-white/10 shadow-xl">
           <span className="material-symbols-outlined text-[#D9B26A] text-[16px] animate-pulse">spark</span>
           <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#D9B26A]">Docent</span>
        </div>

        <div className="pointer-events-auto flex items-center gap-2">
           <button 
            onClick={handleAction} 
            disabled={isProcessing || isStreaming}
            className="w-10 h-10 bg-black/40 backdrop-blur-xl rounded-full text-white border border-white/10 active:scale-95 transition-all shadow-xl flex items-center justify-center disabled:opacity-30"
          >
            {isProcessing ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            ) : (
                <span className="material-symbols-outlined text-[20px]">ios_share</span>
            )}
          </button>
          
          <button 
            onClick={() => onDelete(result.id)}
            className="w-10 h-10 bg-black/40 backdrop-blur-xl rounded-full text-[#F4EFE6]/60 border border-white/10 active:scale-95 transition-all shadow-xl flex items-center justify-center"
          >
            <span className="material-symbols-outlined text-[20px]">delete</span>
          </button>
        </div>
      </nav>

      {/* Hero Header Area */}
      <div className="relative w-full h-[460px] overflow-hidden">
        <img src={result.imageData} alt={cleanTitle} className="w-full h-full object-cover" crossOrigin="anonymous" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/0 via-black/40 to-[#0B0F14]"></div>
        
        {isStreaming && (
          <>
            <div className="st-beam" />
            <div className="st-beam-glow" />
          </>
        )}

        <div className="absolute bottom-10 left-8 right-8 animate-fade-in-up">
           <div className="inline-flex items-center gap-2 px-3 py-1 bg-black/40 backdrop-blur-md rounded-full border border-[#D9B26A]/30 mb-4">
              <span className="material-symbols-outlined text-[#D9B26A] text-[12px]">location_on</span>
              <span className="text-[10px] font-black uppercase tracking-widest text-[#F4EFE6]/70 font-sans">
                {result.locationData ? `${result.locationData.latitude.toFixed(4)}°, ${result.locationData.longitude.toFixed(4)}°` : 'Discovery'}
              </span>
           </div>
           <h1 className="text-4xl sm:text-5xl font-serif font-medium text-[#F4EFE6] leading-[1.05] tracking-tight mb-4 drop-shadow-2xl">{cleanTitle}</h1>
           <p className="text-xl font-serif italic text-[#F4EFE6]/70 leading-relaxed pr-6">{cleanFact ? `"${cleanFact}"` : ""}</p>
        </div>
      </div>

      {/* Metadata Strip */}
      <div className="flex items-center gap-6 px-8 py-6 border-b border-white/5 font-sans">
        <div className="flex items-center gap-2 text-[11px] font-bold text-[#F4EFE6]/40 uppercase tracking-widest">
           <span className="material-symbols-outlined text-[14px]">schedule</span>
           3 {t('minutesRead')}
        </div>
        <div className="w-px h-3 bg-white/10" />
        <div className="flex items-center gap-2 text-[11px] font-bold text-[#F4EFE6]/40 uppercase tracking-widest">
           <span className="material-symbols-outlined text-[14px]">history_edu</span>
           {t('docentNote')}
        </div>
      </div>

      {/* Content Area */}
      <div className="px-8 pt-10 flex flex-col gap-10">
          <div className="flex flex-col gap-6">
              <div className="text-[10px] font-black uppercase tracking-[0.3em] text-[#D9B26A] mb-2 antialiased">{t('theStory')}</div>
              <div className="text-lg sm:text-[21px] font-serif font-regular text-[#F4EFE6]/90 leading-[1.65] break-keep tracking-[-0.01em]">
                  {result.story ? result.story.split('\n').map((l, i) => {
                    const cleanedLine = clean(l);
                    if (!cleanedLine) return null;
                    return (
                      <p key={i} className="mb-8">
                        {i === 0 ? (
                          <span className="float-left text-6xl font-serif leading-[0.8] mr-3 mt-1 text-[#D9B26A] font-medium">{cleanedLine.charAt(0)}</span>
                        ) : null}
                        {i === 0 ? cleanedLine.slice(1) : cleanedLine}
                      </p>
                    );
                  }) : (isStreaming && (
                    <div className="space-y-4 animate-pulse">
                      <div className="h-4 bg-white/5 rounded-full w-full"></div>
                      <div className="h-4 bg-white/5 rounded-full w-5/6"></div>
                      <div className="h-4 bg-white/5 rounded-full w-4/6"></div>
                    </div>
                  ))}
              </div>
          </div>

          {!isStreaming && (
            <div className="grid grid-cols-2 gap-3 mt-4">
               <div className="col-span-2 p-6 rounded-[1.8rem] bg-white/5 border border-white/10 backdrop-blur-md">
                  <div className="text-[9px] font-black uppercase tracking-[0.2em] text-[#D9B26A] mb-3">{t('atAGlance')}</div>
                  <div className="text-2xl font-serif text-[#F4EFE6] leading-tight mb-2 tracking-tight">Historically significant site</div>
                  <p className="text-sm text-[#F4EFE6]/50 font-sans leading-relaxed">{t('atAGlanceDesc')}</p>
               </div>
               
               <div className="p-5 rounded-2xl bg-[#5EC9C2]/5 border border-[#5EC9C2]/20">
                  <div className="text-[9px] font-black uppercase tracking-[0.2em] text-[#5EC9C2] mb-2">{t('bestLight')}</div>
                  <div className="text-xl font-serif text-[#F4EFE6] italic">{t('bestLightTitle')}</div>
               </div>
               
               <div className="p-5 rounded-2xl bg-white/5 border border-white/10">
                  <div className="text-[9px] font-black uppercase tracking-[0.2em] text-[#F4EFE6]/40 mb-2">{t('crowds')}</div>
                  <div className="text-xl font-serif text-[#F4EFE6] italic">{t('crowdsDesc')}</div>
               </div>
            </div>
          )}

          {!isStreaming && result.sources && result.sources.length > 0 && (
            <div className="mt-8 pt-8 border-t border-white/5">
              <h5 className="text-[10px] font-black text-[#F4EFE6]/30 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px]">verified</span>
                {t('verifiedSources')}
              </h5>
              <div className="flex flex-col gap-2">
                {result.sources.map((source, idx) => (
                  <a 
                    key={idx} 
                    href={source.uri} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex justify-between items-center px-5 py-4 bg-white/5 border border-white/5 rounded-2xl text-[13px] text-[#F4EFE6]/70 hover:text-[#D9B26A] hover:bg-white/10 transition-all font-medium"
                  >
                    <span className="truncate pr-4">{source.title}</span>
                    <span className="material-symbols-outlined text-[18px] opacity-40">open_in_new</span>
                  </a>
                ))}
              </div>
            </div>
          )}
      </div>

      {/* Primary Action Button */}
      <div className="fixed bottom-10 left-1/2 -translate-x-1/2 w-full max-w-xl px-8 z-40">
        <button 
          onClick={onNewPhoto} 
          className="w-full h-16 rounded-full bg-gradient-to-b from-[#E6C079] to-[#C99A4F] text-[#1B130A] font-black text-base shadow-[0_10px_30px_-10px_rgba(217,178,106,0.6),0_0_50px_-10px_rgba(217,178,106,0.4)] active:scale-95 transition-all flex items-center justify-center gap-3 ring-1 ring-white/30 ring-inset"
        >
          <span className="material-symbols-outlined text-[24px]">photo_camera</span>
          {t('captureNewStory')}
        </button>
      </div>

      {notification && (
        <div className="fixed top-32 left-1/2 transform -translate-x-1/2 bg-[#F4EFE6] text-[#0B0F14] px-6 py-3 rounded-full shadow-2xl z-[60] text-xs font-black flex items-center gap-2 animate-fade-in-up">
          <span className="material-symbols-outlined text-[#5EC9C2] text-sm">check_circle</span>
          {notification}
        </div>
      )}
    </div>
  );
};
