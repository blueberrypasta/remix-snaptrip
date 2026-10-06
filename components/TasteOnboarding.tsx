import React, { useState, useEffect, useRef } from 'react';
import type { Language } from '../types';
import type { QlooOptions } from '../services/qlooService';
import { interpretTaste, type TasteDraft } from '../services/tasteProfileService';

interface Props {
  language: Language;
  disabled: boolean;
  onApply: (draft: TasteDraft) => Promise<void>;
}

type Mode = 'choose' | 'write' | 'speak';
type Price = '$' | '$$' | '$$$' | '$$$$';
type Cuisine = QlooOptions['cuisine'];

const COPIES: Record<'ko' | 'en', Record<string, string>> = {
  ko: {
    heading: '내 취향에 맞는 장소 찾기',
    desc: '아래 중 하나를 선택해 시작하세요.',
    modeChoose: '선택하기',
    modeWrite: '타이핑하기',
    modeSpeak: '말로 설명',
    prompt: '취향에 가까운 예시를 골라주세요',
    seedHint: '방문한 적 없어도 취향에 가까운 예시를 골라주세요. 최대 3개.',
    priceLabel: '가격대',
    cuisineLabel: '음식 종류',
    anyCuisine: '전체',
    korean: '한식',
    japanese: '일식',
    vegetarian: '채식',
    unrestrictedPrice: '제한 없음',
    selectBtn: '선택 완료',
    needSeed: '최소 1개 이상을 선택해주세요.',
    analyze: '분석하기',
    writePlaceholder: '평소 좋아하는 음식이나 스타일을 자유롭게 적어주세요...',
    speakUnsupported: '이 브라우저는 녹음을 지원하지 않습니다. 직접 입력 탭을 사용하세요.',
    startRecord: '녹음 시작',
    stopRecord: '녹음 중지',
    recording: '녹음 중...',
    processing: '처리 중...',
    micDenied: '마이크 권한이 거부되었습니다.',
    loginRequired: '로그인이 필요합니다.',
    noPreferences: '취향을 찾지 못했습니다. 더 자세히 설명하거나 다시 시도해주세요.',
    timeoutError: '요청 시간이 초과되었습니다.',
    genericError: '오류가 발생했습니다.',
    emptyAudio: '오디오가 너무 짧거나 비어 있습니다.',
    aiSummaryNoteType: '설명을 AI로 정리합니다.',
    aiSummaryNoteVoice: '녹음은 음성 인식과 취향 정리를 위해 전송되며 이 앱에는 저장하지 않습니다.',
    summaryTitle: '취향 요약',
    summaryDesc: '맞게 정리됐는지 확인하고 식당·브랜드, 음식 종류와 가격대를 수정해주세요.',
    editSummary: '요약 내용 수정',
    favNamesLabel: '좋아하는 식당/브랜드 이름',
    favNamesHint: '쉼표 또는 줄바꿈으로 구분 (최대 3개). 각 항목 최대 100자.',
    explainFavMatch: '다음 단계의 검색 결과에서 정확한 식당·브랜드를 선택해주세요.',
    needFavName: '최소 1개의 이름을 입력해야 적용할 수 있습니다.',
    applyBtn: '이 취향으로 장소 찾기',
    backEdit: '다시 편집',
    smallDisclaimer: '추천에는 확인한 식당·브랜드와 음식 종류·가격대를 반영합니다.',
    detectedSettings: '감지된 설정 (수정 가능):',
  },
  en: {
    heading: 'Find places that match your taste',
    desc: 'Select one option below to get started.',
    modeChoose: 'Choose',
    modeWrite: 'Write',
    modeSpeak: 'Speak',
    prompt: 'Pick examples closest to your taste',
    seedHint: '(Flavor reference only — does not imply you visited these)',
    priceLabel: 'Price range',
    cuisineLabel: 'Cuisine',
    anyCuisine: 'Any',
    korean: 'Korean',
    japanese: 'Japanese',
    vegetarian: 'Vegetarian',
    unrestrictedPrice: 'Unrestricted',
    selectBtn: 'Done selecting',
    needSeed: 'Please select at least 1 item.',
    analyze: 'Analyze',
    writePlaceholder: 'Describe foods or styles you usually enjoy...',
    speakUnsupported: "This browser doesn't support audio recording. Please use the Write tab.",
    startRecord: 'Start Recording',
    stopRecord: 'Stop Recording',
    recording: 'Recording...',
    processing: 'Processing...',
    micDenied: 'Microphone permission was denied.',
    loginRequired: 'Login required.',
    noPreferences: 'Could not extract preferences. Try describing more clearly.',
    timeoutError: 'Request timed out.',
    genericError: 'Something went wrong.',
    emptyAudio: 'Audio is too short or empty.',
    aiSummaryNoteType: 'AI will summarize this description.',
    aiSummaryNoteVoice: 'Your recording is sent for speech-to-text and preference extraction; it is never stored in this app.',
    summaryTitle: 'Taste Summary',
    summaryDesc: "The Check your summary and adjust the restaurant/brand names, cuisine and price range below.",
    editSummary: 'Edit summary',
    favNamesLabel: 'Favorite restaurants / brands',
    favNamesHint: 'Separate by commas or newlines (max 3 items, max 100 chars each).',
    explainFavMatch: 'These names will be matched to actual locations in the next step.',
    needFavName: 'At least 1 name is required before applying.',
    applyBtn: 'Find places with this taste',
    backEdit: 'Back to edit',
    smallDisclaimer: 'Recommendations reflect confirmed venues/brands along with cuisine & price settings.',
    detectedSettings: 'Detected settings (editable):',
  },
};

function t(lang: Language, key: keyof typeof COPIES['ko']): string {
  const c = lang === 'ko' ? COPIES.ko : COPIES.en;
  return c[key];
}

export function TasteOnboarding({ language, disabled, onApply }: Props): React.ReactElement {
  const [mode, setMode] = useState<Mode>('choose');
  const [target, setTarget] = useState<QlooOptions['category']>('food');
  const [selectedSeeds, setSelectedSeeds] = useState<string[]>([]);
  const [price, setPrice] = useState<Price | ''>('');
  const [cuisine, setCuisine] = useState<Cuisine>('any');
  const [textInput, setTextInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recTimeLeft, setRecTimeLeft] = useState(30);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [showSummary, setShowSummary] = useState(false);
  const [summaryText, setSummaryText] = useState('');
  const [favInput, setFavInput] = useState('');
  const [applyError, setApplyError] = useState('');
  const [mediaSupported, setMediaSupported] = useState(true);

  const draftRef = useRef<TasteDraft | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const requestVersionRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    const versions = requestVersionRef;
    return () => {
      mountedRef.current = false;
      versions.current++;
      cleanupRecording();
    };
  }, []);

  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setMediaSupported(false);
    }
  }, []);

  function cleanupRecording() {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((tr) => tr.stop());
      streamRef.current = null;
    }
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try { recorderRef.current.stop(); } catch {}
    }
    recorderRef.current = null;
  }

  function switchMode(next: Mode) {
    if (busy || isRecording) return;
    requestVersionRef.current++;
    cleanupRecording();
    setIsRecording(false);
    setErrorMsg('');
    setShowSummary(false);
    setMode(next);
  }

  async function handleStartRecording() {
    if (disabled || busy || isRecording || !mediaSupported) return;
    setErrorMsg('');
    const version = ++requestVersionRef.current;
    setBusy(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mountedRef.current || version !== requestVersionRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      let mime = '';
      if (MediaRecorder.isTypeSupported('audio/webm')) mime = 'audio/webm';
      else if (MediaRecorder.isTypeSupported('audio/mp4')) mime = 'audio/mp4';
      const chunks: Blob[] = [];
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recorderRef.current = rec;
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      rec.onstop = async () => {
        if (!mountedRef.current || version !== requestVersionRef.current) return;
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        const blob = new Blob(chunks, { type: rec.mimeType || mime || 'audio/webm' });
        setIsRecording(false);
        setBusy(true);
        if (timerRef.current !== null) {clearInterval(timerRef.current); timerRef.current = null;}
        if (blob.size < 500) {
          setBusy(false);
          setErrorMsg(t(language, 'emptyAudio'));
          return;
        }
        if (blob.size > 1.5 * 1024 * 1024) {
          setBusy(false);
          setErrorMsg(t(language, 'genericError'));
          return;
        }
        const reader = new FileReader();
        reader.onloadend = async () => {
          if (!mountedRef.current || version !== requestVersionRef.current) return;
          const base64 = (reader.result as string)?.split(',')[1];
          if (!base64) { setBusy(false); return; }
          try {
            const draft = await interpretTaste({ audio: {data:base64,mimeType:blob.type} }, language);
            if (!mountedRef.current || version !== requestVersionRef.current) return;
            finalizeFromInterpretation(draft);
          } catch (err: unknown) {
            if (!mountedRef.current || version !== requestVersionRef.current) return;
            handleError(err);
          } finally {
            if (mountedRef.current && version === requestVersionRef.current) setBusy(false);
          }
        };
        reader.onerror = () => {
          if (mountedRef.current && version === requestVersionRef.current) {
            setBusy(false);
            setErrorMsg(t(language, 'genericError'));
          }
        };
        reader.readAsDataURL(blob);
      };
      rec.onerror = () => {
        requestVersionRef.current++; cleanupRecording();
        if (mountedRef.current) {setIsRecording(false);setBusy(false);setErrorMsg(t(language,'genericError'));}
      };
      rec.start();
      setIsRecording(true);
      setBusy(false);
      setRecTimeLeft(30);
      let remaining = 30;
      timerRef.current = window.setInterval(() => {
        remaining--; setRecTimeLeft(remaining);
        if (remaining <= 0) stopRecording();
      }, 1000);
    } catch (err: unknown) {
      cleanupRecording();
      if (mountedRef.current && version === requestVersionRef.current) {
        setBusy(false);
        handleError(err);
      }
    }
  }

  function stopRecording() {
    if (timerRef.current !== null) { clearInterval(timerRef.current); timerRef.current = null; }
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      setBusy(true);
      recorderRef.current.stop();
    }
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    setIsRecording(false);
  }

  function handleError(err: unknown) {
    const msg = err instanceof Error ? err.message.toLowerCase() : '';
    if ((err instanceof Error && err.name === 'NotAllowedError') || msg.includes('denied') || msg.includes('permission')) setErrorMsg(t(language, 'micDenied'));
    else if (msg.includes('login') || msg.includes('auth')) setErrorMsg(t(language, 'loginRequired'));
    else if (msg.includes('no_pref') || msg.includes('preference')) setErrorMsg(t(language, 'noPreferences'));
    else if (msg.includes('timeout') || msg.includes('abort')) setErrorMsg(t(language, 'timeoutError'));
    else setErrorMsg(t(language, 'genericError'));
  }

  function toggleSeed(name: string) {
    setSelectedSeeds((prev) => {
      if (prev.includes(name)) return prev.filter((n) => n !== name);
      if (prev.length >= 3) return prev;
      return [...prev, name];
    });
  }

  function buildSelectionDraft(): TasteDraft {
    return {summary: selectedSeeds.join(' · '),favorites:selectedSeeds.map(name=>({name,type:target==='shopping'?'brand' as const:'place' as const})),options:{cuisine:target==='food'?cuisine:'any',priceMax:target==='food'?price.length:0,category:target}};
  }

  function finalizeFromInterpretation(draft: TasteDraft) {
    draftRef.current = draft;
    setSummaryText(draft.summary);
    setFavInput(draft.favorites.map(f=>f.name).join(', '));
    setTarget(draft.options.category ?? 'food');
    setCuisine(draft.options.cuisine ?? 'any');
    setPrice(draft.options.priceMax ? PRICES[draft.options.priceMax-1] : '');
    setShowSummary(true);setErrorMsg('');setApplyError('');
  }

  async function runAnalysis(modeUsed: Mode) {
    if (busy || disabled) return;
    setErrorMsg('');
    setBusy(true);
    const version = ++requestVersionRef.current;
    try {
      let draft: TasteDraft;
      if (modeUsed === 'choose') {
        draft = buildSelectionDraft();
      } else if (modeUsed === 'write') {
        draft = await interpretTaste({ text: textInput.slice(0, 1200) }, language);
      } else {
        // shouldn't reach here directly; handled in onstop
        throw new Error('invalid-mode');
      }
      if (!mountedRef.current || version !== requestVersionRef.current) return;
      finalizeFromInterpretation(draft);
    } catch (err: unknown) {
      if (mountedRef.current && version === requestVersionRef.current) handleError(err);
    } finally {
      if (mountedRef.current && version === requestVersionRef.current) setBusy(false);
    }
  }

  function parseFavorites(raw: string): string[] {
    return raw
      .split(/[,\n]/)
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 3)
      .map((x) => x.slice(0, 100));
  }

  async function handleApply() {
    const favs = parseFavorites(favInput);
    if (favs.length === 0) {
      setApplyError(t(language, 'needFavName'));
      return;
    }
    setApplyError('');
    setBusy(true);
    const version = ++requestVersionRef.current;
    try {
      const previous = draftRef.current;
      const draft: TasteDraft = {
        summary:summaryText.trim().slice(0,600),
        favorites:favs.map(name=>({name,type:previous?.favorites.find(f=>f.name.toLowerCase()===name.toLowerCase())?.type ?? 'place'})),
        options:{...previous?.options,category:target,cuisine:target==='food'?cuisine:'any',priceMax:target==='food'?price.length:0},
      };
      await onApply(draft);
      if (!mountedRef.current || version !== requestVersionRef.current) return;
      setShowSummary(false);
    } catch (err: unknown) {
      if (mountedRef.current && version === requestVersionRef.current) {
        setApplyError(t(language, 'genericError'));
      }
    } finally {
      if (mountedRef.current && version === requestVersionRef.current) setBusy(false);
    }
  }

  const SEEDS = target==='food' ? ['In-N-Out Burger','BCD Tofu House','Ichiran','Sweetgreen'] : target==='shopping' ? ['Muji','Uniqlo','Patagonia',"Levi's"] : ['The Getty','Griffith Observatory','LACMA','Natural History Museum'];
  const categoryName = (c:QlooOptions['category']) => ({food:language==='ko'?'먹을 곳':'Food',shopping:language==='ko'?'쇼핑':'Shopping',visits:language==='ko'?'볼거리':'Sights'}[c]);
  const PRICES: Price[] = ['$', '$$', '$$$', '$$$$'];
  const CUISINES: Cuisine[] = ['any', 'korean', 'japanese', 'vegetarian'];
  const ALL_CUISINES: Cuisine[] = [...CUISINES,'italian','mexican','american'];
  const cuisineName = (c:Cuisine) => ({any:language==='ko'?'전체':'Any',korean:language==='ko'?'한식':'Korean',japanese:language==='ko'?'일식':'Japanese',vegetarian:language==='ko'?'채식':'Vegetarian',italian:language==='ko'?'이탈리아':'Italian',mexican:language==='ko'?'멕시칸':'Mexican',american:language==='ko'?'미국':'American'}[c]);
  const MODES: Mode[] = ['choose', 'write', 'speak'];
  const lockActions = busy || isRecording;

  return (
    <div className="rounded-xl border border-emerald-900/60 bg-[#0b1f17] p-4 sm:p-6 shadow-lg">
      <h2 className="text-xl font-semibold text-emerald-50">{t(language, 'heading')}</h2>
      <p className="mt-1 text-sm text-emerald-200/80">{t(language, 'desc')}</p>

      {!showSummary && (
        <>
          <div className="mt-4 flex gap-2" role="group" aria-label="input-method">
            {MODES.map((m) => (
              <button
                key={m}
                type="button"
                disabled={lockActions || disabled}
                onClick={() => switchMode(m)}
                aria-pressed={mode === m}
                className={`min-h-[44px] rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                  mode === m
                    ? 'bg-emerald-500 text-black'
                    : 'border border-emerald-800 text-emerald-100 hover:bg-emerald-900/40'
                }`}
              >
                {t(language, {choose:'modeChoose',write:'modeWrite',speak:'modeSpeak'}[m])}
              </button>
            ))}
          </div>

          {mode === 'choose' && (
            <section className="mt-5 space-y-4">
              <label className="block text-sm">{language==='ko'?'무엇을 찾고 있나요?':'What would you like to find?'}
                <select className="block w-full min-h-[44px] bg-[#0a1812] border border-emerald-800 rounded-md mt-2 px-3" value={target} disabled={lockActions || disabled} onChange={e=>{setTarget(e.target.value as QlooOptions['category']);setSelectedSeeds([]);}}>
                  {(['food','shopping','visits'] as const).map(c=><option key={c} value={c}>{categoryName(c)}</option>)}
                </select>
              </label>
              <div>
                <p className="text-sm text-emerald-100">{t(language, 'prompt')}</p>
                <p className="text-xs text-emerald-300/70">{t(language, 'seedHint')}</p>
                <ul className="mt-2 grid grid-cols-2 gap-2">
                  {SEEDS.map((name) => {
                    const active = selectedSeeds.includes(name);
                    return (
                      <li key={name}>
                        <button
                          type="button"
                          disabled={lockActions || disabled}
                          aria-pressed={active} onClick={() => toggleSeed(name)}
                          className={`w-full min-h-[44px] rounded-md border px-3 py-3 text-left text-sm transition-colors ${
                            active
                              ? 'border-emerald-400 bg-emerald-900/50 text-emerald-50'
                              : 'border-emerald-800 text-emerald-100 hover:bg-emerald-900/30'
                          }`}
                        >
                          <span className="block font-medium">{name}</span>
                          <span className="block text-xs text-emerald-300/80">
                            {name === 'In-N-Out Burger' && (language==='ko'?'캐주얼 버거':'Casual burgers')}
                            {name === 'BCD Tofu House' && (language==='ko'?'한식':'Korean')}
                            {name === 'Ichiran' && (language==='ko'?'일식·라멘':'Japanese ramen')}
                            {name === 'Sweetgreen' && (language==='ko'?'샐러드':'Salads')}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
              <div>
                <p className="mb-1 text-sm text-emerald-100">{t(language, 'priceLabel')}</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={lockActions || disabled}
                    onClick={() => setPrice('')}
                    className={`min-h-[44px] rounded-md border px-3 text-sm ${
                      price === '' ? 'border-emerald-400 bg-emerald-900/50 text-emerald-50' : 'border-emerald-800 text-emerald-100'
                    }`}
                  >
                    {t(language, 'unrestrictedPrice')}
                  </button>
                  {PRICES.map((p) => (
                    <button
                      key={p}
                      type="button"
                      disabled={lockActions || disabled}
                      onClick={() => setPrice(p)}
                      className={`min-h-[44px] w-14 rounded-md border text-sm ${
                        price === p ? 'border-emerald-400 bg-emerald-900/50 text-emerald-50' : 'border-emerald-800 text-emerald-100'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-1 text-sm text-emerald-100">{t(language, 'cuisineLabel')}</p>
                <div className="flex flex-wrap gap-2">
                  {CUISINES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      disabled={lockActions || disabled}
                      onClick={() => setCuisine(c)}
                      className={`min-h-[44px] rounded-md border px-3 text-sm capitalize ${
                        cuisine === c ? 'border-emerald-400 bg-emerald-900/50 text-emerald-50' : 'border-emerald-800 text-emerald-100'
                      }`}
                    >
                      {cuisineName(c)}
                    </button>
                  ))}
                </div>
              </div>
              {errorMsg && <p className="text-sm text-red-300">{errorMsg}</p>}
              <button
                type="button"
                disabled={lockActions || disabled || selectedSeeds.length === 0}
                onClick={() => runAnalysis('choose')}
                className="w-full min-h-[44px] rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-black hover:bg-emerald-400 disabled:opacity-50"
              >
                {selectedSeeds.length === 0 ? t(language, 'needSeed') : t(language, 'selectBtn')}
              </button>
            </section>
          )}

          {mode === 'write' && (
            <section className="mt-5 space-y-3">
              <textarea
                aria-label={t(language,'modeWrite')} value={textInput}
                onChange={(e) => setTextInput(e.target.value.slice(0, 1200))}
                placeholder={t(language, 'writePlaceholder')}
                rows={5}
                maxLength={1200}
                disabled={lockActions || disabled}
                className="w-full resize-none rounded-md border border-emerald-800 bg-[#0a1812] p-3 text-sm text-emerald-50 focus:border-emerald-400 focus:outline-none"
              />
              <p className="text-xs text-emerald-300/80">{t(language, 'aiSummaryNoteType')}</p>
              {errorMsg && <p className="text-sm text-red-300">{errorMsg}</p>}
              <button
                type="button"
                disabled={lockActions || disabled || textInput.trim().length < 3}
                onClick={() => runAnalysis('write')}
                className="w-full min-h-[44px] rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-black hover:bg-emerald-400 disabled:opacity-50"
              >
                {busy ? t(language, 'processing') : t(language, 'analyze')}
              </button>
            </section>
          )}

          {mode === 'speak' && (
            <section className="mt-5 space-y-3">
              {!mediaSupported ? (
                <div><p className="text-sm text-amber-200">{t(language, 'speakUnsupported')}</p><button className="min-h-[44px] underline" onClick={()=>switchMode('write')}>{t(language,'modeWrite')}</button></div>
              ) : (
                <>
                  <p className="text-xs text-emerald-300/80">{t(language, 'aiSummaryNoteVoice')}</p>
                  <div aria-live="polite" role="status" className="text-sm text-emerald-100">
                    {isRecording
                      ? `${t(language, 'recording')} (${recTimeLeft}s)`
                      : busy
                      ? t(language, 'processing')
                      : ''}
                  </div>
                  {!isRecording ? (
                    <button
                      type="button"
                      disabled={lockActions || disabled}
                      onClick={handleStartRecording}
                      className="w-full min-h-[44px] rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-black hover:bg-emerald-400 disabled:opacity-50"
                    >
                      {t(language, 'startRecord')}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={stopRecording}
                      className="w-full min-h-[44px] rounded-md border border-red-400 bg-red-900/40 px-4 py-2 text-sm font-semibold text-red-100 hover:bg-red-900/60"
                    >
                      {t(language, 'stopRecord')}
                    </button>
                  )}
                  {errorMsg && <p className="text-sm text-red-300">{errorMsg}</p>}
                </>
              )}
            </section>
          )}
        </>
      )}

      {showSummary && (
        <section className="mt-5 space-y-4">
          <h3 className="text-base font-semibold text-emerald-50">{t(language, 'summaryTitle')}</h3>
          <p className="text-xs text-emerald-200/80">{t(language, 'summaryDesc')}</p>
          <label className="block text-sm text-emerald-100">
            {t(language, 'editSummary')}
            <textarea
              value={summaryText}
              onChange={(e) => setSummaryText(e.target.value.slice(0, 1200))}
              rows={4}
              maxLength={1200}
              disabled={busy || disabled}
              className="mt-1 w-full resize-none rounded-md border border-emerald-800 bg-[#0a1812] p-3 text-sm text-emerald-50 focus:border-emerald-400 focus:outline-none"
            />
          </label>
          <label className="block text-sm text-emerald-100">
            {t(language, 'favNamesLabel')}
            <input
              type="text"
              value={favInput}
              maxLength={304} onChange={(e) => setFavInput(e.target.value)}
              disabled={busy || disabled}
              className="mt-1 w-full rounded-md border border-emerald-800 bg-[#0a1812] p-2 text-sm text-emerald-50 focus:border-emerald-400 focus:outline-none"
            />
            <span className="mt-1 block text-xs text-emerald-300/70">{t(language, 'favNamesHint')}</span>
            <span className="mt-1 block text-xs text-emerald-300/70">{t(language, 'explainFavMatch')}</span>
          </label>
          {parseFavorites(favInput).length === 0 && <div>
            <p className="text-sm mb-2">{language==='ko'?'추천 기준으로 쓸 예시를 하나 골라주세요.':'Choose a taste reference to start your recommendations.'}</p>
            <div className="grid grid-cols-2 gap-2">{SEEDS.map(name=><button key={name} type="button" disabled={busy || disabled} className="min-h-[44px] text-left rounded-md border border-emerald-800 px-3 py-2 text-sm" onClick={()=>{setFavInput(name);if(draftRef.current) draftRef.current={...draftRef.current,favorites:[{name,type:target==='shopping'?'brand':'place'}]};}}>{name}</button>)}</div>
          </div>}
          <details className="rounded-md border border-emerald-800 bg-[#0a1812] p-3 text-sm text-emerald-100">
            <summary className="cursor-pointer">{t(language, 'detectedSettings')}</summary>
            <div className="mt-2 space-y-2">
              <label className="flex items-center gap-2">{language==='ko'?'찾을 장소':'Places'}
                <select className="min-h-[44px] rounded bg-[#0b1f17] border border-emerald-800 px-2" value={target} disabled={busy || disabled} onChange={e=>setTarget(e.target.value as QlooOptions['category'])}>
                  {(['food','shopping','visits'] as const).map(c=><option key={c} value={c}>{categoryName(c)}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-2">
                <span>{t(language, 'cuisineLabel')}</span>
                <select
                  value={cuisine}
                  disabled={busy || disabled}
                  onChange={(e) => setCuisine(e.target.value as Cuisine)}
                  className="min-h-[44px] rounded border border-emerald-800 bg-[#0b1f17] px-2 py-1 text-sm"
                >
                  {ALL_CUISINES.map((c) => (
                    <option key={c} value={c}>{cuisineName(c)}</option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2">
                <span>{t(language, 'priceLabel')}</span>
                <select
                  value={price}
                  disabled={busy || disabled}
                  onChange={(e) => setPrice(e.target.value as Price | '')}
                  className="min-h-[44px] rounded border border-emerald-800 bg-[#0b1f17] px-2 py-1 text-sm"
                >
                  <option value="">{t(language, 'unrestrictedPrice')}</option>
                  {PRICES.map((p) => (<option key={p} value={p}>{p}</option>))}
                </select>
              </label>
            </div>
          </details>
          <p className="text-xs text-emerald-300/70">{t(language, 'smallDisclaimer')}</p>
          {(applyError || errorMsg) && <p className="text-sm text-red-300">{applyError || errorMsg}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy || disabled}
              onClick={() => setShowSummary(false)}
              className="min-h-[44px] rounded-md border border-emerald-800 px-4 py-2 text-sm text-emerald-100 hover:bg-emerald-900/40"
            >
              {t(language, 'backEdit')}
            </button>
            <button
              type="button"
              disabled={busy || disabled || parseFavorites(favInput).length === 0}
              onClick={handleApply}
              className="flex-1 min-h-[44px] rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-black hover:bg-emerald-400 disabled:opacity-50"
            >
              {busy ? t(language, 'processing') : t(language, 'applyBtn')}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
