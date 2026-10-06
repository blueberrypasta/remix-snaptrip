import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { qlooAvailable, searchQloo, recommendQloo } from '../services/qlooService';
import type { QlooPlace, QlooOptions } from '../services/qlooService';
import { interpretTaste } from '../services/tasteProfileService';
import { getGuestTasteRemaining } from '../services/guestTasteService';
import type { Language, LocationData } from '../types';

interface Props {
  language: Language;
  location: null | LocationData;
  onRequestLocation: () => Promise<LocationData | null>;
  onLogin: () => void;
  userId?: string;
}

const DEFAULT_OPTIONS: QlooOptions = { category: 'food', mode: 'balanced', cuisine: 'any', priceMax: 0, radius: 15000 };
const MAX_EXCLUSIONS = 10;
const LABELS: Record<string, Partial<Record<Language, string>>> = {
  pill: { ko: '✨ 취향저격', en: '✨ Taste Match',ja:'✨ 好みに合う場所',zh:'✨ 我的口味',es:'✨ A mi gusto',fr:'✨ À mon goût',de:'✨ Mein Geschmack',it:'✨ I miei gusti' },
  close: { ko: '닫기', en: 'Close' },
  placeholder: { ko: 'BCD와 In-N-Out을 좋아해요. 오늘은 근처에서 새로운 식당을 가보고 싶어요.', en: "I like BCD and In-N-Out. I want to try a new restaurant nearby today." },
  cancel: { ko: '취소', en: 'Cancel' },
  recommend: { ko: '추천받기', en: 'Recommend' },
  refine: { ko: '다시 추천 받기', en: 'Refine' },
  backResults: { ko: '결과로 돌아가기', en: 'Back to results' },
  voiceNotice: { ko: '음성을 취향 문장으로 정리했어요', en: 'Voice summarized into preference text' },
  guestLimit: { ko: '게스트 제한 도달', en: 'Guest limit reached' },
  loginCta: { ko: '로그인하고 계속하기', en: 'Log in to continue' },
  unavailable: { ko: '서비스 일시 불가', en: 'Temporarily unavailable' },
  retry: { ko: '재시도', en: 'Retry' },
  errorGeneric: { ko: '오류가 발생했습니다.', en: 'An error occurred.' },
  errorNoPrefs: { ko: '선호도를 입력해주세요.', en: 'Please enter preferences.' },
  errorLocReq: { ko: '위치 정보가 필요합니다.', en: 'Location required.' },
  footer: { ko: '거리: 직선 기준 · Qloo 추천', en: 'Distance: Straight line · Powered by Qloo' },
};

export const TasteRecommendations: React.FC<Props> = ({ language, location, onRequestLocation, onLogin, userId }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [viewState, setViewState] = useState<'composer' | 'results'>('composer');
  const [inputText, setInputText] = useState('');
  const [results, setResults] = useState<QlooPlace[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [voiceNotice,setVoiceNotice]=useState(false);
  const [guestRemaining, setGuestRemaining] = useState<number | null>(null);

  const prevContextRef = useRef<{ summary: string; options: QlooOptions; excludedNames: string[]; interestIds:string[] } | null>(null);
  const [origin,setOrigin] = useState<LocationData | null>(location);
  const [appliedContext,setAppliedContext]=useState<{summary:string;options:QlooOptions;excludedNames:string[];interestIds:string[]}|null>(null);
  const generationSeq = useRef(0);
  const busyRef = useRef(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const dialogRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const t = (key: keyof typeof LABELS) => LABELS[key]?.[language] || LABELS[key]?.en || key;

  const stopCapture=useCallback(()=>{
    if(timerRef.current){clearTimeout(timerRef.current);timerRef.current=null;}
    if(recorderRef.current?.state==='recording')recorderRef.current.stop();
    streamRef.current?.getTracks().forEach(track=>track.stop());streamRef.current=null;
  },[]);
  const invalidateAndCleanup=useCallback(()=>{generationSeq.current++;stopCapture();recorderRef.current=null;chunksRef.current=[];busyRef.current=false;setIsBusy(false);setIsRecording(false);},[stopCapture]);
  const handleClose=useCallback(()=>{invalidateAndCleanup();setIsOpen(false);},[invalidateAndCleanup]);

  useEffect(() => {
    let active=true;
    if (!userId && isOpen) getGuestTasteRemaining().then(n=>{if(active)setGuestRemaining(n);}).catch(()=>{});
    const listener=(e:Event)=>{const n=(e as CustomEvent<number>).detail;if(!userId && Number.isInteger(n))setGuestRemaining(n);};
    window.addEventListener('slaptrip-guest-taste-remaining',listener);
    return()=>{active=false;window.removeEventListener('slaptrip-guest-taste-remaining',listener);};
  },[userId,isOpen]);
  useEffect(()=>{
    if(!isOpen)return;
    const oldOverflow=document.body.style.overflow,previous=document.activeElement as HTMLElement|null;
    document.body.style.overflow='hidden';
    const timer=setTimeout(()=>{(textareaRef.current || dialogRef.current?.querySelector<HTMLElement>('button'))?.focus();},50);
    const keys=(e:KeyboardEvent)=>{
      if(e.key==='Escape')handleClose();
      if(e.key==='Tab'){
        const nodes=Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),textarea:not(:disabled),a[href],summary')||[]) as HTMLElement[];
        const first=nodes[0],last=nodes[nodes.length-1];
        if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
        else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
      }
    };
    window.addEventListener('keydown',keys);
    return()=>{clearTimeout(timer);document.body.style.overflow=oldOverflow;window.removeEventListener('keydown',keys);previous?.focus();};
  },[isOpen,handleClose]);
  useEffect(()=>{
    invalidateAndCleanup();prevContextRef.current=null;setAppliedContext(null);setResults([]);setInputText('');setError(null);setGuestRemaining(null);setViewState('composer');
    const sequence=generationSeq;return()=>{sequence.current++;stopCapture();};
  },[userId,invalidateAndCleanup,stopCapture]);
  useEffect(()=>{if(isOpen&&viewState==='composer')textareaRef.current?.focus();},[isOpen,viewState]);
  const normalizeName=(name:string)=>name.toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
  const errorMessage=(err:unknown)=>{
    const code=err instanceof Error?err.message:'unavailable';
    if(code==='guest_limit_reached')setGuestRemaining(0);
    const messages:Record<string,[string,string]>={
      guest_limit_reached:['무료 10회를 모두 사용했어요. 로그인하고 계속하세요.','Your 10 free recommendations are used. Log in to continue.'],
      login_required:['로그인이 만료됐어요. 다시 로그인해주세요.','Please log in again.'],
      rate_limited:['요청이 많아요. 잠시 후 다시 시도해주세요.','Please wait a minute and try again.'],
      timeout:['응답이 늦어지고 있어요. 다시 시도해주세요.','The request timed out. Try again.'],
      no_preferences:['좋아하는 음식이나 장소를 조금 더 알려주세요.','Tell us a little more about what you like.'],
      empty_results:['근처에서 결과를 찾지 못했어요. 취향을 조금 바꿔 알려주세요.','No nearby matches. Try changing your request.'],
      location_required:['위치 권한을 허용하고 다시 시도해주세요.','Allow location access and try again.'],
      unavailable:['연결이 원활하지 않아요. 잠시 후 다시 시도해주세요.','Connection unavailable. Please try again.'],
      microphone:['마이크를 사용할 수 없어요. 글로 입력해주세요.','Microphone unavailable. Please type instead.']};
    return (messages[code]||messages.unavailable)[language==='ko'?0:1];
  };

  const haversineDist = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371e3;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  };

  const startRecording=async()=>{
    if(busyRef.current || isRecording)return;
    const seq=++generationSeq.current;busyRef.current=true;setIsBusy(true);setError(null);setVoiceNotice(false);
    try{
      if(!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder==='undefined')throw Error('microphone');
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});
      if(seq!==generationSeq.current){stream.getTracks().forEach(t=>t.stop());return;}
      streamRef.current=stream;
      const mime=['audio/webm','audio/mp4'].find(m=>MediaRecorder.isTypeSupported(m));
      if(!mime)throw Error('microphone');
      const recorder=new MediaRecorder(stream,{mimeType:mime});recorderRef.current=recorder;
      const chunks:Blob[]=[];chunksRef.current=chunks;
      recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
      recorder.onerror=()=>{if(seq===generationSeq.current){invalidateAndCleanup();setError(errorMessage(Error('microphone')));}};
      recorder.onstop=async()=>{
        if(seq!==generationSeq.current)return;
        stopCapture();setIsRecording(false);busyRef.current=true;setIsBusy(true);
        try{
          const blob=new Blob(chunks,{type:mime});if(!blob.size||blob.size>1.5*1024*1024)throw Error('microphone');
          const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(Error('microphone'));reader.readAsDataURL(blob);});
          if(seq!==generationSeq.current)return;
          const draft=await interpretTaste({audio:{data,mimeType:mime}},language);
          if(seq!==generationSeq.current)return;
          setInputText(prev=>[prev,draft.summary].filter(Boolean).join('\n').slice(0,600));setVoiceNotice(true);
        }catch(err){if(seq===generationSeq.current)setError(errorMessage(err));}
        finally{if(seq===generationSeq.current){busyRef.current=false;setIsBusy(false);chunksRef.current=[];}}
      };
      recorder.start();setIsRecording(true);busyRef.current=false;setIsBusy(false);
      timerRef.current=setTimeout(()=>stopCapture(),30000);
    }catch(err){if(seq===generationSeq.current){stopCapture();busyRef.current=false;setIsBusy(false);setError(errorMessage(Error('microphone')));}}
  };
  const stopRecordingManually=()=>{busyRef.current=true;setIsBusy(true);stopCapture();};

  const handleSubmit = async () => {
    if (busyRef.current || isRecording || (!userId && guestRemaining===0)) return;

    const trimmedInput = inputText.trim();
    if (trimmedInput.length < 3) {
       setError(t('errorNoPrefs'));
       return;
    }

    busyRef.current = true;
    setIsBusy(true);
    setError(null);
    const currentGen = ++generationSeq.current;

    try {
      const available = await qlooAvailable();
      if (currentGen !== generationSeq.current) return;
      if (!available) throw new Error(t('unavailable'));

      const previous=prevContextRef.current;
      const text=previous?`${previous.summary.slice(0,500)}\nAdditional request (takes precedence): ${trimmedInput.slice(0,600)}`:trimmedInput;
      const draft=await interpretTaste({text},language);
      if(currentGen!==generationSeq.current)return;
      const finalSummary=draft.summary;
      const mergedOptions={...DEFAULT_OPTIONS,...previous?.options,...draft.options};
      const uniqueExcluded=Array.from(new Set([...(previous?.excludedNames||[]),...draft.favorites.map(f=>f.name)])).slice(0,MAX_EXCLUSIONS);
      const idsToExclude:string[]=[];
      for(const fav of draft.favorites){
        try{
          const matches=await searchQloo(fav.name,fav.type);
          if(currentGen!==generationSeq.current)return;
          const key=normalizeName(fav.name);
          const match=matches.find(p=>key && normalizeName(p.name)===key)||matches.find(p=>key.length>=3 && normalizeName(p.name).startsWith(key));
          if(match&&!idsToExclude.includes(match.id))idsToExclude.push(match.id);
        }catch(err){if(currentGen!==generationSeq.current)return;if(err instanceof Error&&['guest_limit_reached','login_required'].includes(err.message))throw err;}
      }
      if(currentGen!==generationSeq.current)return;

      let loc = location;
      if (!loc) {
        loc = await onRequestLocation();
        if (currentGen !== generationSeq.current) return;
        if (!loc) throw new Error('location_required');
      }


      const recommendedPlaces = await recommendQloo(Array.from(new Set([...idsToExclude,...(previous?.interestIds||[])])).slice(0,3), loc, mergedOptions, uniqueExcluded);
      if (currentGen !== generationSeq.current) return;

      if (!recommendedPlaces || recommendedPlaces.length === 0) {
         throw new Error('empty_results'); // Or specific empty msg
      }

      setOrigin(loc);
      setResults(recommendedPlaces.slice(0, 3));
      setViewState('results');
      prevContextRef.current = {
        summary: finalSummary,
        options: mergedOptions,
        excludedNames: uniqueExcluded,
        interestIds:Array.from(new Set([...idsToExclude,...(previous?.interestIds||[])])).slice(0,3)
      };

      setAppliedContext(prevContextRef.current);

    } catch (err: any) {
      if (currentGen !== generationSeq.current) return;

      setError(errorMessage(err));
    } finally {
      if (currentGen === generationSeq.current) {
        busyRef.current = false;
        setIsBusy(false);
      }
    }
  };

  const renderCard = (p: QlooPlace, index: number) => {
    const dist = Number.isFinite(p.latitude) && Number.isFinite(p.longitude) && origin
      ? Math.round(haversineDist(origin.latitude, origin.longitude, p.latitude!, p.longitude!))
      : null;

    const priceStr = p.priceLevel && Number.isInteger(p.priceLevel) && p.priceLevel>=1 && p.priceLevel<=4 ? '$'.repeat(p.priceLevel) : (language==='ko'?'가격 정보 없음':'Price unavailable');
    const ratingVal = Number.isFinite(p.rating) && p.rating!>=0 && p.rating!<=5 ? p.rating!.toFixed(1) : null;
    const isGoogle = p.ratingSource === 'google';
    const reviewTxt = isGoogle && Number.isInteger(p.reviewCount) && p.reviewCount!>=0 ? `(${p.reviewCount})` : '';

    return (
      <details key={p.id} className="group bg-slate-800 rounded-lg border border-slate-700 overflow-hidden mb-2">
        <summary className="flex items-center justify-between p-3 cursor-pointer hover:bg-slate-750 transition-colors list-none [&::-webkit-details-marker]:hidden">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <span className="font-bold text-emerald-400 w-4">{index + 1}</span>
            <div className="min-w-0 flex-1">
              <h4 className="text-sm font-semibold text-white truncate">{p.name}</h4>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400 mt-1">
                {dist !== null ? <span>{dist >= 1000 ? (dist/1000).toFixed(1)+'km' : dist+'m'}</span> : <span>{language==='ko'?'거리 정보 없음':'Distance unavailable'}</span>}
                <span>{priceStr}</span>
                <span className={`flex items-center gap-1 ${isGoogle ? 'text-yellow-400' : 'text-blue-400'}`}>
                  {ratingVal ? `★ ${ratingVal} ${isGoogle?'Google':'Qloo'} ${reviewTxt}` : (language==='ko'?'평점 정보 없음':'Rating unavailable')}
                </span>
              </div>
            </div>
          </div>
          <svg className="w-4 h-4 text-slate-500 group-open:rotate-180 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
        </summary>
        <div className="px-3 pb-3 pt-1 border-t border-slate-700 bg-slate-800/50">
          <p className="text-xs text-slate-300 mb-2 line-clamp-2">{p.description || (language==='ko'?'':'No description available.')}</p>
          <p className="text-xs text-slate-400 mb-2 break-all">{p.address}</p>
          <div className="flex gap-2">
             {p.url && (
               <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-xs px-2 py-1 bg-slate-700 hover:bg-slate-600 text-white rounded">
                 {language==='ko'?'Google 리뷰 · 지도':'Google reviews · map'}
               </a>
             )}
          </div>
        </div>
      </details>
    );
  };

  const showEntryPill = true;
  const canRecommend = !isBusy && (!!userId || guestRemaining === null || guestRemaining > 0);

  return (
    <>
      {/* Entry Pill */}
      {showEntryPill && (
        <button
          onClick={() => setIsOpen(true)}
          className="inline-flex items-center justify-center h-[44px] min-h-[44px] px-3 rounded-full whitespace-nowrap bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-sm font-medium shadow-lg active:scale-95 transition-transform"
          aria-label={t('pill')} data-taste-entry
        >
          {t('pill')}
        </button>
      )}

      {/* Portal Modal */}
      {isOpen && createPortal(
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && handleClose()}>
          <div
            ref={dialogRef}
            role="dialog" data-taste-dialog
            aria-modal="true"
            aria-labelledby="taste-dialog-title"
            className="bg-slate-900 w-full sm:max-w-[480px] max-h-[85dvh] sm:max-h-[85dvh] rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col animate-in slide-in-from-bottom-4 duration-200"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-800 shrink-0">
              <h2 id="taste-dialog-title" className="text-base font-semibold text-white">
                {viewState === 'results' ? (language==='ko'?'추천 TOP 3':'Your top 3') : t('pill')}
              </h2>
              <button onClick={handleClose} className="w-11 h-11 flex items-center justify-center rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition-colors" aria-label={t('close')}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>

            {/* Content Area */}
            <div className="min-h-0 overflow-y-auto p-4 relative">

              {viewState === 'composer' && (
                <div className="space-y-4">
                  {error && (
                    <div className="p-3 bg-red-900/30 border border-red-800 text-red-200 text-sm rounded-lg flex justify-between items-start">
                      <span>{error}</span>
                      {!isBusy && <button onClick={() => setError(null)} className="ml-2 underline">✕</button>}
                    </div>
                  )}

                  <div className="relative">
                    <textarea aria-label={language==='ko'?'취향 또는 추가 요청':'Preferences or additional request'}
                      ref={textareaRef}
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      disabled={isBusy || isRecording}
                      maxLength={600}
                      rows={4}
                      placeholder={t('placeholder')}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 pb-14 text-white placeholder-slate-500 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none resize-none text-base leading-relaxed"
                    />

                    {/* Mic Button */}
                    <button
                      onClick={isRecording ? stopRecordingManually : startRecording}
                      disabled={!isRecording && (!canRecommend || isBusy)}
                      className={`absolute bottom-3 right-3 w-11 h-11 flex items-center justify-center rounded-full transition-colors ${
                        isRecording ? 'bg-red-500 text-white animate-pulse' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      }`}
                      aria-label={isRecording ? (language==='ko'?'녹음 종료':'Stop recording') : (language==='ko'?'음성 입력':'Start recording')}
                    >
                      {isRecording ? (
                         <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12"/></svg>
                      ) : (
                         <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
                      )}
                    </button>
                  </div>

                  {isRecording && <p className="text-xs text-emerald-400 text-center animate-pulse">{language==='ko'?'🎤 말한 뒤 마이크를 다시 누르세요 (최대 30초)':'🎤 Tap the microphone to stop (up to 30 sec)'}</p>}
                  {!isRecording && inputText && !appliedContext && <p className="text-xs text-slate-500 text-right">{inputText.length}/600</p>}

                  {voiceNotice && <p className="text-xs text-slate-400">{t('voiceNotice')}</p>}
                  {appliedContext && <p className="text-xs text-slate-400 line-clamp-2">{appliedContext.summary}</p>}
                  {results.length>0 && <button onClick={()=>setViewState('results')} className="min-h-11 text-sm text-emerald-400">← {t('backResults')}</button>}
                  <p role="status" aria-live="polite" className="text-xs text-slate-400">{isBusy?(language==='ko'?'처리 중…':'Processing…'):!userId&&guestRemaining!==null?(language==='ko'?`로그인 없이 ${guestRemaining}회 남음`:`${guestRemaining} free uses remaining`):''}</p>
                  {/* Actions */}
                  <div className="flex gap-2 pt-2">
                     <button
                       onClick={handleClose}
                       className="flex-1 py-3 px-4 rounded-xl bg-slate-800 text-slate-300 font-medium hover:bg-slate-700 transition-colors disabled:opacity-50"
                       disabled={false} // Always enabled
                     >
                       {t('cancel')}
                     </button>
                     <button
                       onClick={handleSubmit}
                       disabled={!canRecommend || isBusy || isRecording}
                       className="flex-[2] py-3 px-4 rounded-xl bg-emerald-600 text-white font-medium hover:bg-emerald-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                     >
                       {isBusy ? (
                         <>
                           <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                           {language==='ko'?'처리 중…':'Processing…'}
                         </>
                       ) : t('recommend')}
                     </button>
                  </div>

                  {/* Guest Info */}
                  {guestRemaining === 0 && !userId && (
                    <div className="mt-4 p-3 bg-amber-900/20 border border-amber-800/50 rounded-lg text-center">
                      <p className="text-amber-200 text-sm mb-2">{t('guestLimit')}</p>
                      <button onClick={()=>{handleClose();onLogin();}} className="text-xs font-bold text-amber-400 underline hover:text-amber-300">{t('loginCta')}</button>
                    </div>
                  )}
                </div>
              )}

              {viewState === 'results' && (
                <div className="space-y-4">
                   {results.map((p, i) => renderCard(p, i))}

                   {appliedContext && (
                     <details className="mt-2">
                       <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-400 select-none">{language==='ko'?'반영한 취향':'Applied preferences'}</summary>
                       <div className="mt-2 p-2 bg-slate-800/50 rounded text-xs text-slate-400 whitespace-pre-wrap">
                         {appliedContext.summary}
                       </div>
                     </details>
                   )}

                   <div className="pt-2 space-y-2">
                     <button
                       onClick={() => {
                         setViewState('composer');
                         setInputText('');setVoiceNotice(false);
                         setError(null);
                       }}
                       className="w-full py-2 text-sm text-emerald-400 hover:text-emerald-300 font-medium"
                     >
                       {t('refine')}
                     </button>
                     <p className="text-[10px] text-slate-600 text-center uppercase tracking-wide">{t('footer')}</p>
                   </div>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};
