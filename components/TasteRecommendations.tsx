import React, { useState, useRef, useEffect, useCallback } from 'react';
import { TasteSheetView } from './TasteSheetView';
import { qlooAvailable, searchQloo, recommendQlooDetailed } from '../services/qlooService';
import type { QlooPlace, QlooOptions } from '../services/qlooService';
import { localizePlaceDescriptions } from '../services/placePresentationService';
import { interpretTaste } from '../services/tasteProfileService';
import {mergeTasteOptions,tasteContextInput} from '../services/tasteContextService';
import {useTasteVoice} from '../hooks/useTasteVoice';
import { getGuestTasteRemaining } from '../services/guestTasteService';
import type { Language, LocationData } from '../types';

interface Props {
  language: Language;
  location: null | LocationData;
  onRequestLocation: () => Promise<LocationData | null>;
  onLogin: () => void;
  userId?: string;
}

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
  const [michelinNearby, setMichelinNearby] = useState<QlooPlace[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [history,setHistory]=useState<string[]>([]);
  const [voiceNotice,setVoiceNotice]=useState(false);
  const [guestRemaining, setGuestRemaining] = useState<number | null>(null);

  const prevContextRef = useRef<{ summary: string; stablePreferences?:string[]; options: QlooOptions; excludedNames: string[]; interestIds:string[] } | null>(null);
  const [origin,setOrigin] = useState<LocationData | null>(location);
  const [appliedContext,setAppliedContext]=useState<{summary:string;stablePreferences?:string[];options:QlooOptions;excludedNames:string[];interestIds:string[]}|null>(null);
  const generationSeq = useRef(0);
  const busyRef = useRef(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const t = (key: keyof typeof LABELS) => LABELS[key]?.[language] || LABELS[key]?.en || key;

  const normalizeName=(name:string)=>name.toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
  const errorMessage=(err:unknown)=>{
    const code=err instanceof Error?err.message:'unavailable';
    if(code==='guest_limit_reached')setGuestRemaining(0);
    const messages:Record<string,[string,string]>={
      guest_limit_reached:['무료 10회를 모두 사용했어요. 로그인하고 계속하세요.','Your 10 free recommendations are used. Log in to continue.'],
      login_required:['로그인이 만료됐어요. 다시 로그인해주세요.','Please log in again.'],
      rate_limited:['요청이 많아요. 잠시 후 다시 시도해주세요.','Please wait a minute and try again.'],
      timeout:['응답이 늦어지고 있어요. 다시 시도해주세요.','The request timed out. Try again.'],
      michelin_green_unavailable:['현재 이 지역의 그린스타 데이터를 확인할 수 없어요. 빕 구르망이나 1스타로 찾아주세요.','Green Star data is unavailable here. Try Bib Gourmand or one star.'],
      michelin_unavailable:['미쉐린 등급을 확인할 수 없어요. 잠시 후 다시 시도해주세요.','Michelin distinctions could not be verified. Try again later.'],
      michelin_quota:['미쉐린 조회 한도를 다 사용했어요. 미쉐린 조건을 빼고 다시 찾아주세요.','Michelin lookup quota is exhausted. Try without the Michelin requirement.'],
      unsupported_preference:['이 음식의 검색 조건을 확인하지 못했어요. 다른 음식명을 알려주세요.','We could not verify filters for that food. Try another food name.'],
      no_preferences:['좋아하는 음식이나 장소를 조금 더 알려주세요.','Tell us a little more about what you like.'],
      empty_results:['조건에 맞는 근처 장소가 없어요. 검색 반경을 넓혀보세요.','No nearby matches for these preferences. Try a wider radius.'],
      location_required:['위치 권한을 허용하고 다시 시도해주세요.','Allow location access and try again.'],
      places_unavailable:['장소 검색 연결이 원활하지 않아요. 잠시 후 다시 시도해주세요.','Place search is unavailable. Please try again.'],
      unavailable:['연결이 원활하지 않아요. 잠시 후 다시 시도해주세요.','Connection unavailable. Please try again.'],
      microphone:['마이크를 사용할 수 없어요. 글로 입력해주세요.','Microphone unavailable. Please type instead.']};
    return (messages[code]||messages.unavailable)[language==='ko'?0:1];
  };

  const voice=useTasteVoice(language,(summary)=>{setInputText(prev=>[prev,summary].filter(Boolean).join('\n').slice(-600));setVoiceNotice(true);},err=>setError(errorMessage(err)));
  const isRecording=voice.state!=='idle';
  const cancelVoice=voice.cancel;
  const invalidateAndCleanup=useCallback(()=>{generationSeq.current++;cancelVoice();busyRef.current=false;setIsBusy(false);},[cancelVoice]);
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
    invalidateAndCleanup();prevContextRef.current=null;setAppliedContext(null);setResults([]);setMichelinNearby([]);setInputText('');setError(null);setGuestRemaining(null);setViewState('composer');setHistory([]);
    const sequence=generationSeq;return()=>{sequence.current++;cancelVoice();};
  },[userId,invalidateAndCleanup,cancelVoice]);
  useEffect(()=>{if(isOpen&&viewState==='composer')textareaRef.current?.focus();},[isOpen,viewState]);
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
      const text=tasteContextInput(previous,trimmedInput);
      const draft=await interpretTaste({text},language);
      if(currentGen!==generationSeq.current)return;
      const finalSummary=draft.summary;
      const mergedOptions=mergeTasteOptions(previous?.options,draft.options);
      const uniqueExcluded=Array.from(new Set([...(previous?.excludedNames||[]),...draft.favorites.flatMap(f=>f.englishName?[f.name,f.englishName]:[f.name])])).slice(0,MAX_EXCLUSIONS);
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


      const interestIds=Array.from(new Set([...idsToExclude,...(previous?.interestIds||[])])).slice(0,3);
      let recommendedPlaces:QlooPlace[]=[];
      let nearbyMichelin:QlooPlace[]=[];
      const fetchPlaces=async(opts:QlooOptions)=>{const r=await recommendQlooDetailed(interestIds, loc!, opts, uniqueExcluded);if(r.michelinNearby.length)nearbyMichelin=r.michelinNearby;return r.places;};
      try{recommendedPlaces = await fetchPlaces({...mergedOptions,language});}
      catch(err){if(!(err instanceof Error && err.message==='unsupported_preference' && mergedOptions.foodQuery))throw err;}
      if (currentGen !== generationSeq.current) return;
      // A specific dish tag (e.g. "pasta") is often missing from Qloo's place tags, so an exact
      // dish filter can come back empty even in dense areas. Relax step by step instead of failing:
      // keep the cuisine but drop the dish, then widen the radius. Empty guest calls are refunded.
      if (!recommendedPlaces.length && !mergedOptions.michelin && mergedOptions.foodQuery) {
        recommendedPlaces = await fetchPlaces({...mergedOptions,foodQuery:'',language});
        if (currentGen !== generationSeq.current) return;
      }
      if (!recommendedPlaces.length && !mergedOptions.michelin && mergedOptions.radius < 30000) {
        recommendedPlaces = await fetchPlaces({...mergedOptions,foodQuery:'',radius:30000,language});
        if (currentGen !== generationSeq.current) return;
      }

      if (!recommendedPlaces || recommendedPlaces.length === 0) {
         throw new Error('empty_results'); // Or specific empty msg
      }

      const localized=await localizePlaceDescriptions(recommendedPlaces.slice(0,3),language);
      if(currentGen!==generationSeq.current)return;
      setOrigin(loc);
      setResults(localized);
      setMichelinNearby(nearbyMichelin.slice(0,3));
      setViewState('results');
      prevContextRef.current = {
        summary: finalSummary,
        stablePreferences:draft.stablePreferences ?? previous?.stablePreferences,
        options: mergedOptions,
        excludedNames: uniqueExcluded,
        interestIds
      };

      setAppliedContext(prevContextRef.current);
      setHistory(prev=>[...prev,trimmedInput].slice(-5));

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
  return <TasteSheetView language={language} isOpen={isOpen} viewState={viewState} inputText={inputText} results={results} michelinNearby={michelinNearby} error={error} isBusy={isBusy} isRecording={isRecording} guestRemaining={guestRemaining} userId={userId} voiceNotice={voiceNotice} appliedSummary={appliedContext?.summary||null} origin={origin} canRecommend={canRecommend} dialogRef={dialogRef} textareaRef={textareaRef} t={t} viewport={viewport} onOpen={()=>setIsOpen(true)} onClose={handleClose} onInput={setInputText} onRecommend={handleSubmit} onMicrophone={()=>{setError(null);setVoiceNotice(false);void voice.start();}} voiceState={voice.state} voiceSeconds={voice.seconds} onVoiceStop={voice.stop} onVoiceSend={()=>void voice.send()} onVoiceCancel={voice.cancel} history={history} stablePreferences={appliedContext?.stablePreferences||[]} onReset={()=>{invalidateAndCleanup();prevContextRef.current=null;setAppliedContext(null);setHistory([]);setResults([]);setMichelinNearby([]);setInputText('');setError(null);setViewState('composer');}} onDismissError={()=>setError(null)} onBackResults={()=>setViewState('results')} onRefine={()=>{setViewState('composer');setInputText('');setVoiceNotice(false);setError(null);}} onLogin={()=>{handleClose();onLogin();}} />;
};
