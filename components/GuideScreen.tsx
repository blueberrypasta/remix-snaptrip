
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslations } from '../translations';
import { fetchGuidePointList, streamGuideDetail } from '../services/geminiService';
import { fetchPointImage, clearImageCache } from '../services/imageService';
import type { Language, GuidePoint } from '../types';

interface GuideScreenProps {
  landmarkName: string;
  language: Language;
  onBack: () => void;
  locationHint?: string;
}

const STORAGE_KEY = 'snaptrip_active_guide';
const PREGEN_COUNT = 1;

interface ExtendedGuidePoint extends GuidePoint {
  isOverview?: boolean;
}

export const GuideScreen: React.FC<GuideScreenProps> = ({ landmarkName, language, onBack, locationHint }) => {
  const t = useTranslations(language);
  const [points, setPoints] = useState<ExtendedGuidePoint[]>([]);
  const [isInitializing, setIsInitializing] = useState(true);
  const [currentStep, setCurrentStep] = useState(0);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [loadedImages, setLoadedImages] = useState<Record<number, boolean>>({});
  const [imageResults, setImageResults] = useState<Record<number, { checked: boolean, url: string | null }>>({});
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const generatingRefs = useRef<Set<number>>(new Set());

  const scrollToStep = (step: number, smooth: boolean = true) => {
    if (step < 0 || step >= points.length || !scrollRef.current) return;
    const container = scrollRef.current;
    const targetChild = container.children[step] as HTMLElement;
    
    if (targetChild) {
      container.scrollTo({
        left: targetChild.offsetLeft,
        behavior: smooth ? 'smooth' : 'auto'
      });
      setCurrentStep(step);
      saveToStorage(landmarkName, language, points, step);
    }
  };

  const generateStepContent = async (stepIdx: number) => {
    if (generatingRefs.current.has(stepIdx)) return;
    generatingRefs.current.add(stepIdx);
    
    // 중복 방지를 위해 전체 포인트 제목들을 전달
    const allPointTitles = points.map(p => p.title);
    
    try {
        await streamGuideDetail(
          points[stepIdx].title, 
          landmarkName, 
          language, 
          (text) => {
            setPoints(prev => prev.map((p, idx) => idx === stepIdx ? { ...p, content: text } : p));
          }, 
          points[stepIdx].isOverview, 
          locationHint,
          allPointTitles
        );
        
        setPoints(prev => {
            const next = prev.map((p, idx) => idx === stepIdx ? { ...p, isLoading: false } : p);
            generatingRefs.current.delete(stepIdx);
            saveToStorage(landmarkName, language, next, currentStep);
            return next;
        });
    } catch (e: any) {
        generatingRefs.current.delete(stepIdx);
    }
  };

  const saveToStorage = (name: string, lang: string, pts: ExtendedGuidePoint[], step: number) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      landmarkName: name, language: lang, points: pts, currentStep: step, lastUpdated: Date.now()
    }));
  };

  // 초기 데이터 로드
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.landmarkName === landmarkName && parsed.language === language) {
          setPoints(parsed.points);
          setCurrentStep(parsed.currentStep);
          setIsInitializing(false);
          setTimeout(() => scrollToStep(parsed.currentStep, false), 100);
          return;
        }
      } catch (e) {}
    }

    const init = async () => {
      setIsInitializing(true);
      setErrorStatus(null);
      clearImageCache();
      try {
        const list = await fetchGuidePointList(landmarkName, language, locationHint);
        const initialPoints: ExtendedGuidePoint[] = list.map(item => ({ 
          title: language === 'ko' ? item.ko : item.en, 
          searchQueryEn: item.en,
          wikiTitle: item.wikiTitle,
          isOverview: item.isOverview,
          isLoading: true 
        }));
        setPoints(initialPoints);
        setIsInitializing(false);

        // 이미지 로딩 병렬 처리
        list.forEach((item, i) => {
          fetchPointImage(item.ko, item.en, landmarkName, i, item.wikiTitle)
            .then(result => {
                setImageResults(prev => ({ ...prev, [i]: { checked: true, url: result.url } }));
                setPoints(prev => prev.map((p, idx) => idx === i ? { ...p, imageUrl: result.url || undefined } : p));
            })
            .catch(() => {
                setImageResults(prev => ({ ...prev, [i]: { checked: true, url: null } }));
            });
        });
      } catch (e: any) {
        if (e?.message?.includes('429')) setErrorStatus(429);
        setIsInitializing(false);
      }
    };
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [landmarkName, language, locationHint]);

  // 자동 가이드 내용 생성
  useEffect(() => {
    if (isInitializing || points.length === 0 || errorStatus) return;

    for (let i = currentStep; i <= Math.min(currentStep + PREGEN_COUNT, points.length - 1); i++) {
        if (!points[i].content && !generatingRefs.current.has(i)) {
            generateStepContent(i);
        }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, points, isInitializing]);



  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const scrollLeft = e.currentTarget.scrollLeft;
    const width = e.currentTarget.offsetWidth;
    const newStep = Math.round(scrollLeft / width);
    if (newStep !== currentStep && newStep < points.length && newStep >= 0) {
      setCurrentStep(newStep);
      saveToStorage(landmarkName, language, points, newStep);
    }
  };

  if (errorStatus === 429) {
    return (
      <div className="fixed inset-0 bg-background-dark flex flex-col items-center justify-center text-center p-10 z-[100]">
        <span className="material-symbols-outlined text-6xl text-red-500 mb-4">hourglass_empty</span>
        <h3 className="text-xl font-black text-white mb-2">API 서버 접속량이 많습니다.<br/>(Server Busy)</h3>
        <p className="text-sm text-white/70 mb-8">잠시 후 다시 시도해주시거나,<br/>API 키를 직접 설정해주세요.</p>
        <button onClick={onBack} className="px-6 py-3 bg-white/10 rounded-2xl text-white font-bold inline-flex items-center gap-2 active:bg-white/20 transition-all">
          <span className="material-symbols-outlined">arrow_back</span>
          뒤로가기
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-background-dark flex flex-col overflow-hidden">
      {/* Top Bar */}
      <nav className="z-50 pt-[env(safe-area-inset-top,20px)] pb-4 flex items-center justify-between px-6 bg-gradient-to-b from-black/80 to-transparent">
        <button onClick={onBack} className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center text-white active:scale-90 transition-all">
          <span className="material-symbols-outlined">close</span>
        </button>
        
        <div className="flex flex-col items-center flex-1">
            <div className="flex gap-1.5 mb-2">
                {points.map((_, i) => (
                    <button key={i} onClick={() => scrollToStep(i)} className={`h-1 rounded-full transition-all duration-300 ${i === currentStep ? 'w-8 bg-primary shadow-lg shadow-primary/40' : 'w-1.5 bg-white/20'}`}></button>
                ))}
            </div>
            <h2 className="text-[10px] font-black text-white/40 uppercase tracking-[0.4em] truncate max-w-[150px]">{landmarkName}</h2>
        </div>

        <div className="flex gap-2">
            <button onClick={() => scrollToStep(currentStep - 1)} disabled={currentStep === 0} className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${currentStep === 0 ? 'bg-white/5 text-white/10' : 'bg-white/10 text-white active:scale-90'}`}>
                <span className="material-symbols-outlined">chevron_left</span>
            </button>
            <button onClick={() => scrollToStep(currentStep + 1)} disabled={currentStep === points.length - 1} className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${currentStep === points.length - 1 ? 'bg-white/5 text-white/10' : 'bg-primary text-white active:scale-90'}`}>
                <span className="material-symbols-outlined">chevron_right</span>
            </button>
        </div>
      </nav>

      {isInitializing ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-6">
          <div className="w-14 h-14 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
          <div className="flex flex-col items-center gap-1 animate-pulse">
            <p className="text-[10px] font-black text-primary uppercase tracking-[0.5em]">Initializing Guide...</p>
            {locationHint && <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Searching in {locationHint}</p>}
          </div>
        </div>
      ) : (
        <div 
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 flex overflow-x-auto snap-x snap-mandatory no-scrollbar h-full"
        >
          {points.map((point, idx) => (
            <div 
                key={idx} 
                className="flex-shrink-0 w-full h-full snap-center flex flex-col items-center justify-center p-4 sm:p-8"
            >
              <div className={`relative w-full max-w-2xl h-full bg-[#16202a] rounded-[3rem] overflow-hidden border border-white/5 transition-all duration-500 flex flex-col shadow-2xl ${idx === currentStep ? 'opacity-100 scale-100' : 'opacity-20 scale-90 grayscale'}`}>
                
                {/* Image Section */}
                <div className="relative h-[40%] sm:h-[45%] w-full bg-slate-900">
                  {imageResults[idx]?.checked ? (
                    imageResults[idx].url ? (
                      <img 
                        src={imageResults[idx].url!} 
                        className={`w-full h-full object-cover transition-opacity duration-1000 ${loadedImages[idx] ? 'opacity-100' : 'opacity-0'}`}
                        onLoad={() => setLoadedImages(prev => ({ ...prev, [idx]: true }))}
                      />
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-800/50">
                        <span className="material-symbols-outlined text-slate-600 text-5xl mb-2">photo_off</span>
                        <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">{language === 'ko' ? '사진 정보 없음' : 'No Image Available'}</p>
                      </div>
                    )
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                         <div className="w-8 h-8 border-2 border-primary/20 border-t-primary rounded-full animate-spin"></div>
                    </div>
                  )}
                  {/* 그라데이션 레이어 보강: 상단 텍스트 보호를 위해 상단에도 어두운 레이어 추가 */}
                  <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/60 to-transparent"></div>
                  <div className="absolute inset-0 bg-gradient-to-t from-[#16202a] via-transparent to-transparent"></div>
                  
                  <div className="absolute top-8 left-8 flex flex-col gap-2 z-20">
                    <div className="w-fit px-3 py-1 bg-primary text-white text-[9px] font-black rounded-lg uppercase tracking-widest shadow-lg">POINT {idx + 1}</div>
                    <h3 className="text-2xl sm:text-3xl font-black text-white leading-tight break-keep drop-shadow-[0_2px_12px_rgba(0,0,0,0.85)]">
                        {point.title}
                    </h3>
                  </div>
                </div>

                {/* Text Content */}
                <div className="flex-1 p-8 sm:p-12 overflow-y-auto no-scrollbar">
                  {point.content ? (
                    <div className="text-[17px] sm:text-[20px] font-medium text-slate-200 leading-[1.8] text-justify break-keep tracking-tight animate-fade-in-up">
                      {point.content.split('\n').map((line, i) => <p key={i} className="mb-4">{line}</p>)}
                    </div>
                  ) : (
                    <div className="h-full flex flex-col justify-center items-center opacity-20 gap-4">
                        <div className="w-12 h-0.5 bg-primary animate-pulse"></div>
                        <p className="text-[10px] font-black text-primary uppercase tracking-widest animate-pulse">Consulting Expert Guide...</p>
                    </div>
                  )}
                </div>

                {/* Mobile Navigation Area */}
                <div className="absolute inset-y-0 left-0 w-20 cursor-pointer z-10" onClick={() => scrollToStep(currentStep - 1)}></div>
                <div className="absolute inset-y-0 right-0 w-20 cursor-pointer z-10" onClick={() => scrollToStep(currentStep + 1)}></div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Decorative Background */}
      <div className="fixed -bottom-40 -left-40 w-96 h-96 bg-primary/10 rounded-full blur-[120px] -z-10"></div>
    </div>
  );
};
