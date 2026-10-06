import React from 'react';
import { createPortal } from 'react-dom';
import type { QlooPlace } from '../services/qlooService';
import type { Language, LocationData } from '../types';

type Props = {
  language: Language;
  isOpen: boolean;
  viewState: 'composer' | 'results';
  inputText: string;
  results: QlooPlace[];
  error: string | null;
  isBusy: boolean;
  isRecording: boolean;
  guestRemaining: number | null;
  userId?: string;
  voiceNotice: boolean;
  appliedSummary: string | null;
  origin: LocationData | null;
  canRecommend: boolean;
  dialogRef: React.RefObject<HTMLDivElement | null>;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  t: (key: string) => string;
  onOpen: () => void;
  onClose: () => void;
  onInput: (text: string) => void;
  onRecommend: () => void;
  onMicrophone: () => void;
  onDismissError: () => void;
  onBackResults: () => void;
  onRefine: () => void;
  onLogin: () => void;
  viewport?: { height: number; top: number } | null;
};

  const SparkleIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.912 5.813a2 2 0 0 0 1.275 1.275L21 12l-5.813 1.912a2 2 0 0 0-1.275 1.275L12 21l-1.912-5.813a2 2 0 0 0-1.275-1.275L3 12l5.813-1.912a2 2 0 0 0 1.275-1.275L12 3z" />
    </svg>
  );

  const CloseIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"></line>
      <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
  );

  const MicIcon = ({ active }: { active: boolean }) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill={active ? "#ef4444" : "none"} stroke={active ? "#ffffff" : "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
      <line x1="12" y1="19" x2="12" y2="23"></line>
      <line x1="8" y1="23" x2="16" y2="23"></line>
    </svg>
  );

  const ChevronRight = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6"></polyline>
    </svg>
  );

  const ExternalLinkIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
      <polyline points="15 3 21 3 21 9"></polyline>
      <line x1="10" y1="14" x2="21" y2="3"></line>
    </svg>
  );

export function TasteSheetView(props: Props) {
  const {
    language,
    isOpen,
    viewState,
    inputText,
    results,
    error,
    isBusy,
    isRecording,
    guestRemaining,
    userId,
    voiceNotice,
    appliedSummary,
    origin,
    canRecommend,
    dialogRef,
    textareaRef,
    t,
    onOpen,
    onClose,
    onInput,
    onRecommend,
    onMicrophone,
    onDismissError,
    onBackResults,
    onRefine,
    onLogin,
    viewport,
  } = props;

  const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number | null => {

    const R = 6371e3; // meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const d = R * c;
    return d;
  };

  const formatDistance = (meters: number | null): string => {
    if (meters === null || isNaN(meters)) return '';
    if (meters < 1000) return `${Math.round(meters)}m`;
    return `${(meters / 1000).toFixed(1)}km`;
  };

  const formatPrice = (priceLevel: number | undefined | null): string => {
    if (!Number.isInteger(priceLevel) || typeof priceLevel !== 'number' || priceLevel < 1 || priceLevel > 4) {
      return language === 'ko' ? '가격 미제공' : 'Price unavailable';
    }
    return '$'.repeat(priceLevel);
  };

  const formatRating = (rating: number | undefined | null, source: string | undefined, reviews: number | undefined): string => {
    if (source !== 'google') {
       if (typeof rating !== 'number' || !Number.isFinite(rating) || rating < 0 || rating > 5) {
         return language === 'ko' ? '평점 미제공' : 'No rating';
       }
       return `★ ${rating.toFixed(1)} (${language === 'ko' ? 'Qloo' : 'Qloo'})`;
    }

    if (typeof rating !== 'number' || !Number.isFinite(rating) || rating < 0 || rating > 5) {
        return language === 'ko' ? '평점 미제공' : 'No rating';
    }

    let str = `★ ${rating.toFixed(1)} Google`;
    if (typeof reviews === 'number' && Number.isInteger(reviews) && reviews >= 0) {
        str += language === 'ko' ? ` · 리뷰 ${reviews}개` : ` · ${reviews} reviews`;
    }
    return str;
  };

  const isValidGoogleMapUrl = (url: string | undefined): url is string => {
    if (!url) return false;
    return url.startsWith('https://www.google.com/maps/search/?api=1&query=');
  };

  const entryPillLabel = language === 'ko' ? '취향저격' : language === 'en' ? 'Taste match' : t('pill').replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '');

  const PillButton = (
    <button
      data-taste-entry
      type="button"
      aria-label={entryPillLabel}
      onClick={(e) => { e.stopPropagation(); onOpen(); }}
      className="inline-flex items-center justify-center h-[44px] px-2.5 rounded-full bg-emerald-500/[0.08] border border-emerald-400/20 text-white font-semibold text-[13px] gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 transition-colors hover:bg-emerald-500/15 touch-manipulation select-none"
      style={{ WebkitTapHighlightColor: 'transparent' }}
    >
      <SparkleIcon />
      <span style={{fontFamily:'"Noto Serif KR", "AppleMyungjo", serif',fontWeight:500,letterSpacing:"0.03em"}}>{entryPillLabel}</span>
    </button>
  );

  if (!isOpen) return PillButton;

  const modalContent = (
    <>
      
      <div
        className="fixed inset-0 bg-black/[0.55] z-[100]"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        style={viewport ? { top: viewport.top, height: viewport.height, bottom: 'auto' } : undefined}
      />

      
      <div
        className="fixed inset-0 z-[101] flex items-end md:items-center justify-center pointer-events-none"
        style={viewport ? { top: viewport.top, height: viewport.height, bottom: 'auto' } : undefined}
      >
        
        <div
          ref={dialogRef}
          role="dialog" data-taste-dialog
          aria-modal="true"
          aria-labelledby="taste-dialog-title"
          className="pointer-events-auto w-full max-w-[480px] bg-[#111b19] border border-white/10 text-white shadow-lg flex flex-col overflow-hidden rounded-t-[28px] md:rounded-[28px] mx-0 md:mx-4 mb-0 md:mb-0"
          style={{
            maxHeight: 'min(90dvh, 100%)',
            paddingBottom: 'env(safe-area-inset-bottom)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          
          <header className="p-6 pb-4 shrink-0 relative">
            <button
              onClick={onClose}
              aria-label={t('close')}
              className="absolute top-4 right-4 w-[44px] h-[44px] flex items-center justify-center text-white/60 hover:text-white transition-colors rounded-full hover:bg-white/5"
            >
              <CloseIcon />
            </button>

            <div className="pr-12">
              <p className="text-[11px] uppercase tracking-wider text-emerald-400 font-bold mb-1">
                {language === 'ko' ? '취향으로 찾기' : 'YOUR TASTE'}
              </p>
              <h2 id="taste-dialog-title" className="text-[22px] font-semibold leading-tight">
                {viewState === 'composer'
                  ? (language === 'ko' ? '어떤 곳이 끌리세요?' : 'What appeals to you?')
                  : (language === 'ko' ? `지금 가볼 곳 ${results.length}` : `Top ${results.length} Places Now`)
                }
              </h2>

              <p className="mt-2 text-[14px] text-white/[0.65] leading-relaxed">
                {viewState === 'composer'
                  ? (appliedSummary
                      ? (language === 'ko' ? '이전 취향에 더해 원하는 조건을 알려주세요.' : 'Add conditions to your previous taste.')
                      : (language === 'ko' ? '좋아하는 음식이나 가게를 편하게 알려주세요.' : 'Tell us about foods or places you like comfortably.'))
                  : (language === 'ko' ? '취향에 맞는 새로운 장소만 골랐어요.' : 'We selected new places that fit your taste.')
                }
              </p>
            </div>
          </header>

          
          <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-4 custom-scrollbar">
            {viewState === 'composer' ? (
              <div className="space-y-4 pt-2">

                
                {error && (
                  <div role="alert" className="bg-rose-900/30 border border-rose-500/30 text-rose-200 p-3 rounded-xl text-sm flex justify-between items-start gap-2">
                    <span className="leading-snug">{error}</span>
                    <button
                      onClick={onDismissError}
                      aria-label={language==='ko'?'오류 닫기':'Dismiss error'}
                      className="w-[44px] h-[44px] -mr-2 -mt-2 flex-shrink-0 flex items-center justify-center text-rose-300 hover:text-white opacity-70 hover:opacity-100"
                    >
                      <CloseIcon />
                    </button>
                  </div>
                )}

                
                {appliedSummary && (
                  <div className="bg-white/[0.03] border border-white/5 rounded-xl p-3">
                    <p className="text-[11px] uppercase tracking-wide text-white/40 mb-1 font-medium">
                      {language === 'ko' ? '이전 취향' : 'Previous Taste'}
                    </p>
                    <p className="text-[13px] text-white/70 line-clamp-2 leading-normal">
                      {appliedSummary}
                    </p>
                  </div>
                )}

                
                <div className="relative group">
                  <textarea
                    ref={textareaRef}
                    value={inputText}
                    onChange={(e) => onInput(e.target.value)}
                    maxLength={600}
                    rows={5}
                    disabled={isBusy || isRecording}
                    placeholder={language === 'ko'
                      ? '얼큰한 한식과 말차 라떼를 좋아해요.\n근처에서 새로운 곳을 가보고 싶어요.'
                      : 'I love spicy Korean food and matcha lattes.\nLooking for somewhere new nearby.'}
                    aria-label={language === 'ko' ? '취향 또는 추가 요청' : 'Taste or additional request'}
                    className="w-full min-h-[156px] bg-white/[0.03] border border-white/[0.15] rounded-[20px] p-4 pb-14 text-[16px] leading-[1.65] text-white placeholder:text-white/50 focus:outline-none focus:border-emerald-400/50 focus:bg-white/[0.05] transition-all resize-none disabled:opacity-50"
                    style={{ fontSize: '16px',backgroundColor:'rgba(255,255,255,0.03)',color:'inherit' }}
                  />

                  
                  <button
                    onClick={onMicrophone}
                    disabled={!isRecording && (!canRecommend || isBusy)}
                    aria-label={isRecording
                      ? (language === 'ko' ? '녹음 종료' : 'Stop Recording')
                      : (language === 'ko' ? '음성 입력' : 'Voice Input')}
                    className={`absolute bottom-3 right-3 w-[44px] h-[44px] rounded-full flex items-center justify-center transition-all duration-200
                      ${isRecording
                        ? 'bg-red-500 text-white animate-pulse'
                        : 'bg-white/[0.07] text-white/70 hover:bg-white/[0.15] hover:text-white'
                      }
                      disabled:opacity-30 disabled:cursor-not-allowed
                    `}
                  >
                    <MicIcon active={isRecording} />
                  </button>
                </div>

                
                {(voiceNotice || isRecording) && (
                  <div role="status" aria-live="polite" className="text-[12px] text-emerald-400/80 pl-1 py-1">
                     {isRecording
                       ? (language === 'ko' ? '말한 뒤 마이크를 다시 눌러주세요 · 최대 30초' : 'Tap the microphone to stop · 30 sec max')
                       : t('voiceNotice')
                     }
                  </div>
                )}

                
                {guestRemaining !== null && guestRemaining >= 0 && !userId && (
                   <p className="text-[12px] text-white/50 text-center mt-2">
                     {language === 'ko' ? `게스트 추천 기회 ${guestRemaining}회 남음` : `${guestRemaining} guest recommendations left`}
                   </p>
                )}

                {results.length>0 && <button type="button" onClick={onBackResults} className="min-h-11 text-sm text-emerald-300">← {t('backResults')}</button>}
                {isBusy && <p className="sr-only" role="status" aria-live="polite">{language==='ko'?'취향에 맞는 곳을 찾고 있어요…':'Finding places for your taste…'}</p>}
                
                
              </div>
            ) : (

              <div className="space-y-3 pt-2 pb-4">
                {results.map((place, index) => {
                  const dist = origin && Number.isFinite(place.latitude) && Number.isFinite(place.longitude)
                    ? getDistance(origin.latitude, origin.longitude, place.latitude!, place.longitude!)
                    : null;

                  const rankBadgeStyle = index === 0
                    ? "bg-[#D9B26A]/10 text-[#D9B26A] border-[#D9B26A]/20"
                    : "bg-transparent text-white/50 border-white/10";

                  const cardBgClass = index === 0
                    ? "bg-emerald-500/10 border-emerald-500/25"
                    : "bg-white/[0.04] border-white/[0.08]";

                  return (
                    <details key={`${place.id}-${index}`} className={`group open:bg-white/[0.06] transition-colors rounded-[18px] border ${cardBgClass}`}>
                      <summary className="list-none cursor-pointer p-4 flex items-start gap-3 [&::-webkit-details-marker]:hidden">
                        
                        <div className={`w-8 h-8 flex-shrink-0 rounded-full border flex items-center justify-center text-xs font-bold ${rankBadgeStyle}`}>
                          {index + 1}
                        </div>

                        <div className="flex-1 min-w-0">
                          <h3 className="text-[16px] font-semibold text-white leading-snug line-clamp-2 break-words">
                            {place.name}
                          </h3>

                          
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5 text-[13px] text-white/70">
                             {dist !== null && (
                               <span>{formatDistance(dist)}</span>
                             )}
                             {dist !== null && <span className="text-white/20">·</span>}

                             <span>{formatPrice(place.priceLevel)}</span>
                             <span className="text-white/20">·</span>

                             <span className="text-[#D9B26A]">
                                {formatRating(place.rating, place.ratingSource, place.reviewCount)}
                             </span>
                          </div>
                        </div>

                        <div className="self-center text-white/30 group-open:rotate-90 transition-transform duration-200">
                           <ChevronRight />
                        </div>
                      </summary>

                      
                      <div className="px-4 pb-4 pt-0 space-y-3">
                         {place.address && (
                           <p className="text-[14px] text-white/80 leading-relaxed">
                             {place.address}
                           </p>
                         )}

                         {place.description && (
                           <p className="text-[13px] text-white/60 leading-relaxed">
                             {place.description}
                           </p>
                         )}

                         {isValidGoogleMapUrl(place.url) && (
                           <a
                             href={place.url}
                             target="_blank"
                             rel="noopener noreferrer"
                             className="inline-flex items-center gap-1.5 text-[13px] text-emerald-400 hover:text-emerald-300 bg-white/[0.07] hover:bg-white/[0.12] px-3 py-2 rounded-lg transition-colors min-h-[44px]"
                           >
                             <ExternalLinkIcon />
                             <span>{language === 'ko' ? 'Google 리뷰 · 지도' : 'Google Reviews · Map'}</span>
                           </a>
                         )}
                      </div>
                    </details>
                  );
                })}

                
                {appliedSummary && (
                  <details className="group mt-4 border-t border-white/5 pt-3">
                    <summary className="text-[13px] text-white/50 cursor-pointer list-none flex items-center gap-1 hover:text-white/70 transition-colors">
                       <span className="transition-transform group-open:rotate-90"><ChevronRight /></span>
                       {language === 'ko' ? '반영한 취향' : 'Applied Taste'}
                    </summary>
                    <p className="mt-2 text-[13px] text-white/60 leading-relaxed pl-5">
                      {appliedSummary}
                    </p>
                  </details>
                )}

                <p className="text-[12px] text-white/50 text-center mt-4 italic">
                  {language === 'ko' ? '거리: 직선 기준 · 평점: 표시된 출처 기준' : 'Distance: Straight-line · Rating: Based on indicated source'}
                </p>
              </div>
            )}
          </div>

          
          <footer className={`shrink-0 px-6 pb-6 pt-4 border-t border-white/[0.08] bg-[#111b19]/95 backdrop-blur-sm ${viewState === 'results' ? '' : ''}`}>
             {viewState === 'composer' ? (
               <div className="flex gap-3">
                 
                 <button
                   onClick={onClose}
                   className="flex-[1] h-[48px] rounded-[14px] border border-white/[0.15] text-white/80 font-medium text-[15px] hover:bg-white/5 transition-colors"
                 >
                   {language === 'ko' ? '취소' : 'Cancel'}
                 </button>

                 
                 {guestRemaining === 0 && !userId ? (
                   <button
                     onClick={onLogin}
                     className="flex-[2] h-[48px] rounded-[14px] bg-[#33d5a4] text-[#0f1715] font-semibold text-[15px] hover:brightness-110 transition-all"
                   >
                     {language === 'ko' ? '로그인하고 계속하기' : 'Log in to continue'}
                   </button>
                 ) : (
                   <button
                     onClick={onRecommend}
                     disabled={isBusy || isRecording || (guestRemaining !== null && guestRemaining <= 0 && !userId)}
                     className="flex-[2] h-[48px] rounded-[14px] bg-[#33d5a4] text-[#0f1715] font-semibold text-[15px] hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                   >
                     {isBusy ? (
                       <>
                         <svg className="animate-spin h-4 w-4 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                           <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                           <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                         </svg>
                         <span>{language === 'ko' ? '찾는 중…' : 'Finding…'}</span>
                       </>
                     ) : (
                       <span>{language === 'ko' ? '추천받기' : 'Get Recommendations'}</span>
                     )}
                   </button>
                 )}
               </div>
             ) : (

               <button
                 onClick={onRefine}
                 className="w-full h-[48px] rounded-[14px] bg-[#33d5a4] text-[#0f1715] font-semibold text-[15px] hover:brightness-110 transition-all"
               >
                 {language === 'ko' ? '조건을 더해서 다시 추천' : 'Refine & Re-recommend'}
               </button>
             )}
          </footer>
        </div>
      </div>
    </>
  );

  return <>{PillButton}{createPortal(modalContent, document.body)}</>;
}
