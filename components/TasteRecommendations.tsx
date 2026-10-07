import React, { useState, useRef, useEffect, useCallback } from 'react';
import { TasteSheetView } from './TasteSheetView';
import { qlooAvailable, searchQloo, recommendQloo } from '../services/qlooService';
import type { QlooPlace, QlooOptions } from '../services/qlooService';
import { localizePlaceDescriptions } from '../services/placePresentationService';
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
  const [viewport,setViewport]=useState<{height:number;top:number}|null>(null);
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

  useEffect(()=>{
    if(!isOpen || !window.visualViewport)return;
    const vv=window.visualViewport;
    const update=()=>setViewport({height:vv.height,top:vv.offsetTop});
    update();vv.addEventListener('resize',update);vv.addEventListener('scroll',update);
    return()=>{vv.removeEventListener('resize',update);vv.removeEventListener('scroll',update);};
  },[isOpen]);
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
      unsupported_preference:['이 음식의 검색 조건을 확인하지 못했어요. 다른 음식명을 알려주세요.','We could not verify filters for that food. Try another food name.'],
      no_preferences:['좋아하는 음식이나 장소를 조금 더 알려주세요.','Tell us a little more about what you like.'],
      empty_results:['조건에 맞는 근처 장소가 없어요. 검색 반경을 넓혀보세요.','No nearby matches for these preferences. Try a wider radius.'],
      location_required:['위치 권한을 허용하고 다시 시도해주세요.','Allow location access and try again.'],
      unavailable:['연결이 원활하지 않아요. 잠시 후 다시 시도해주세요.','Connection unavailable. Please try again.'],
      microphone:['마이크를 사용할 수 없어요. 글로 입력해주세요.','Microphone unavailable. Please type instead.']};
    return (messages[code]||messages.unavailable)[language==='ko'?0:1];
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
      if(draft.options.cuisine && draft.options.cuisine!=='any' && draft.options.foodQuery===undefined)mergedOptions.foodQuery='';
      if(draft.options.foodQuery){
        mergedOptions.category='food';mergedOptions.shoppingKind='any';
        if(!draft.options.cuisine)mergedOptions.cuisine='any';
        if(!draft.options.drink)mergedOptions.drink='any';
      }
      const uniqueExcluded=Array.from(new Set([...(previous?.excludedNames||[]),...draft.favorites.map(f=>f.name)])).slice(0,MAX_EXCLUSIONS);
      const idsToExclude:string[]=[];
      for(const fav of draft.favorites){
        try{
          const matches=await searchQloo(fav.englishName||fav.name,fav.type);
          if(currentGen!==generationSeq.current)return;
          const key=normalizeName(fav.englishName||fav.name);
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

      const localized=await localizePlaceDescriptions(recommendedPlaces.slice(0,3),language);
      if(currentGen!==generationSeq.current)return;
      setOrigin(loc);
      setResults(localized);
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

  const canRecommend = !isBusy && (!!userId || guestRemaining === null || guestRemaining > 0);
  return <TasteSheetView language={language} isOpen={isOpen} viewState={viewState} inputText={inputText} results={results} error={error} isBusy={isBusy} isRecording={isRecording} guestRemaining={guestRemaining} userId={userId} voiceNotice={voiceNotice} appliedSummary={appliedContext?.summary||null} origin={origin} canRecommend={canRecommend} dialogRef={dialogRef} textareaRef={textareaRef} t={t} viewport={viewport} onOpen={()=>setIsOpen(true)} onClose={handleClose} onInput={setInputText} onRecommend={handleSubmit} onMicrophone={isRecording?stopRecordingManually:startRecording} onDismissError={()=>setError(null)} onBackResults={()=>setViewState('results')} onRefine={()=>{setViewState('composer');setInputText('');setVoiceNotice(false);setError(null);}} onLogin={()=>{handleClose();onLogin();}} />;
};
