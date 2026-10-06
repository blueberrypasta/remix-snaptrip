import { getGuestTasteRemaining } from '../services/guestTasteService';
import React, { useState, useEffect, useRef } from 'react';
import { qlooAvailable, searchQloo, recommendQloo } from '../services/qlooService';
import type { QlooInterest, QlooPlace, QlooOptions } from '../services/qlooService';
import { TasteOnboarding } from './TasteOnboarding';
import {normalizeTasteDraft, type TasteDraft} from '../services/tasteProfileService';
import { LocalRecommendationControls } from './LocalRecommendationControls';
import type { Language, LocationData } from '../types';

interface Props {
  language: Language;
  location: LocationData | null;
  onRequestLocation: () => Promise<LocationData | null>;
  onLogin: () => void;
  userId?: string;
}

const COPY: Record<Language, Partial<Record<string, string>>> & { en: Record<string, string> } = {
  en: {
    title: 'Eat, shop & explore nearby',
    poweredBy: 'Powered by Qloo',
    loginPrompt: 'Log in to discover personalized recommendations.',
    expand: 'Discover Places',
    collapse: 'Hide Recommendations',
    searchLabel: 'A restaurant, place or brand you like',
    categoryLabel: 'Category',
    placeholderArtist: 'e.g., Taylor Swift',
    placeholderMovie: 'e.g., Spirited Away',
    placeholderBook: 'e.g., The Little Prince',
    placeholderPlace: 'e.g., In-N-Out Burger',
    placeholderBrand: 'e.g., Muji',
    btnSearch: 'Search',
    btnGetRecs: 'Get Recommendations',
    disclosure: 'Your selected interests and approximate location are sent to Qloo.',
    maxChips: 'Max 3 selections',
    loading: 'Searching...',
    recLoading: 'Generating ideas...',
    noMatches: 'No matches found. Try different keywords.',
    zeroRecs: 'Could not find specific spots nearby. Try broadening your interests.',
    errNetwork: 'Connection issue. Please try again.',
    errTimeout: 'Request timed out.',
    errRateLimit: 'Too many requests. Wait a minute.',
    errAuth: 'Session expired. Please log in again.',
    errConfig: 'Service temporarily unavailable.',
    openMaps: 'View on Map',
    removeChip: 'Remove selection',
  },
  ko: { title: '이 지역에서 어디 갈까', poweredBy: 'Qloo 제공', loginPrompt: '개인화된 추천을 위해 로그인하세요.', expand: '장소 찾기', collapse: '추천 숨기기', searchLabel: '좋아하는 식당·장소·브랜드 찾기', categoryLabel: '카테고리', btnSearch: '검색', btnGetRecs: '추천 받기', disclosure: '선택한 관심사와 대략적인 위치가 Qloo로 전송됩니다.', maxChips: '최대 3개 선택', loading: '검색 중...', recLoading: '아이디어 생성 중...', noMatches: '일치하는 항목이 없습니다.', zeroRecs: '근처 장소를 찾지 못했습니다.', errNetwork: '연결 문제입니다.', errTimeout: '시간 초과됨.', errRateLimit: '요청이 많습니다. 잠시 후 다시 추천받아 주세요.', errAuth: '로그인이 필요합니다. 다시 로그인해 주세요.', errConfig: '서비스 일시 불가.', openMaps: '지도에서 보기', removeChip: '선택 해제' },
  ja: { title: 'このエリアのおすすめ', poweredBy: 'Qloo提供', loginPrompt: 'パーソナライズされたおすすめを見るにはログインしてください。', expand: '場所を探す', collapse: 'おすすめを隠す', searchLabel: 'インスピレーション検索', categoryLabel: 'カテゴリ', btnSearch: '検索', btnGetRecs: 'おすすめを取得', disclosure: '選択した興味と概算位置情報がQlooに送信されます。', maxChips: '最大3件まで', loading: '検索中...', recLoading: 'アイデア生成中...', noMatches: '一致する項目が見つかりません。', zeroRecs: '近くのスポットが見つかりませんでした。', errNetwork: '接続エラーです。', errTimeout: 'タイムアウトしました。', errRateLimit: 'リクエストが多すぎます。', errAuth: 'セッション期限切れ。', errConfig: 'サービス一時停止中。', openMaps: '地図で見る', removeChip: '削除' },
  zh: { title: '本地吃喝与探索', poweredBy: '由 Qloo 驱动', loginPrompt: '登录以获取个性化推荐。', expand: '发现地点', collapse: '隐藏推荐', searchLabel: '寻找灵感', categoryLabel: '类别', btnSearch: '搜索', btnGetRecs: '获取推荐', disclosure: '您选择的兴趣和大致位置将发送给 Qloo。', maxChips: '最多选择3个', loading: '搜索中...', recLoading: '生成建议中...', noMatches: '未找到匹配项。', zeroRecs: '附近未找到特定地点。', errNetwork: '连接问题，请重试。', errTimeout: '请求超时。', errRateLimit: '请求过多，请稍等。', errAuth: '会话过期，请重新登录。', errConfig: '服务暂时不可用。', openMaps: '在地图查看', removeChip: '移除选择' },
  es: { title: 'Tu próximo destino', poweredBy: 'Impulsado por Qloo', loginPrompt: 'Inicia sesión para ver recomendaciones personalizadas.', expand: 'Descubrir lugares', collapse: 'Ocultar recomendaciones', searchLabel: 'Buscar inspiración', categoryLabel: 'Categoría', btnSearch: 'Buscar', btnGetRecs: 'Obtener recomendaciones', disclosure: 'Tus intereses seleccionados y ubicación aproximada se envían a Qloo.', maxChips: 'Máximo 3 selecciones', loading: 'Buscando...', recLoading: 'Generando ideas...', noMatches: 'Sin coincidencias.', zeroRecs: 'No se encontraron lugares cercanos.', errNetwork: 'Problema de conexión.', errTimeout: 'Tiempo agotado.', errRateLimit: 'Demasiadas solicitudes.', errAuth: 'Sesión expirada.', errConfig: 'Servicio temporalmente no disponible.', openMaps: 'Ver en mapa', removeChip: 'Eliminar selección' },
  fr: { title: 'Votre prochain arrêt', poweredBy: 'Propulsé par Qloo', loginPrompt: 'Connectez-vous pour des recommandations personnalisées.', expand: 'Découvrir des lieux', collapse: 'Masquer les recommandations', searchLabel: 'Trouver de l\'inspiration', categoryLabel: 'Catégorie', btnSearch: 'Rechercher', btnGetRecs: 'Obtenir des recommandations', disclosure: 'Vos intérêts sélectionnés et votre position approximative sont envoyés à Qloo.', maxChips: 'Max 3 sélections', loading: 'Recherche...', recLoading: 'Génération d\'idées...', noMatches: 'Aucun résultat trouvé.', zeroRecs: 'Impossible de trouver des endroits proches.', errNetwork: 'Problème de connexion.', errTimeout: 'Délai dépassé.', errRateLimit: 'Trop de requêtes.', errAuth: 'Session expirée.', errConfig: 'Service temporairement indisponible.', openMaps: 'Voir sur la carte', removeChip: 'Retirer la sélection' },
  de: { title: 'Essen und Entdecken in der Nähe', poweredBy: 'Bereitgestellt von Qloo', loginPrompt: 'Melde dich an für personalisierte Empfehlungen.', expand: 'Orte entdecken', collapse: 'Empfehlungen ausblenden', searchLabel: 'Inspiration finden', categoryLabel: 'Kategorie', btnSearch: 'Suchen', btnGetRecs: 'Empfehlungen holen', disclosure: 'Deine ausgewählten Interessen und ungefähre Position werden an Qloo gesendet.', maxChips: 'Maximal 3 Auswahlen', loading: 'Suche...', recLoading: 'Ideen generieren...', noMatches: 'Keine Treffer gefunden.', zeroRecs: 'Konnte keine Orte in der Nähe finden.', errNetwork: 'Verbindungsproblem.', errTimeout: 'Zeitüberschreitung.', errRateLimit: 'Zu viele Anfragen.', errAuth: 'Sitzung abgelaufen.', errConfig: 'Dienst vorübergehend nicht verfügbar.', openMaps: 'Auf Karte anzeigen', removeChip: 'Auswahl entfernen' },
  it: { title: 'Mangiare ed esplorare nei dintorni', poweredBy: 'Offerto da Qloo', loginPrompt: 'Accedi per consigli personalizzati.', expand: 'Scopri luoghi', collapse: 'Nascondi consigli', searchLabel: 'Trova ispirazione', categoryLabel: 'Categoria', btnSearch: 'Cerca', btnGetRecs: 'Ottieni consigli', disclosure: 'I tuoi interessi selezionati e la posizione approssimativa vengono inviati a Qloo.', maxChips: 'Massimo 3 selezioni', loading: 'Ricerca...', recLoading: 'Generazione idee...', noMatches: 'Nessuna corrispondenza trovata.', zeroRecs: 'Impossibile trovare luoghi nelle vicinanze.', errNetwork: 'Problema di connessione.', errTimeout: 'Richiesta scaduta.', errRateLimit: 'Troppe richieste.', errAuth: 'Sessione scaduta.', errConfig: 'Servizio temporaneamente non disponibile.', openMaps: 'Vedi su mappa', removeChip: 'Rimuovi selezione' },
};

const CATEGORIES = ['place', 'brand', 'artist', 'movie', 'book'] as const;
type Category = typeof CATEGORIES[number];

const STORAGE_PREFIX = 'slaptrip_qloo_interests:';
const OPTIONS_PREFIX = 'slaptrip_qloo_options:';
const DEFAULT_OPTIONS:QlooOptions={category:'food',mode:'balanced',cuisine:'any',priceMax:0,radius:15000};

export const TasteRecommendations: React.FC<Props> = ({ language, location, onRequestLocation, onLogin, userId }) => {
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);
  const [guestRemaining,setGuestRemaining] = useState<number|null>(null);
  const storageUserId=userId || 'guest';
  const [profileReady,setProfileReady] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [category, setCategory] = useState<Category>('place');
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<QlooOptions>(DEFAULT_OPTIONS);
  const [results, setResults] = useState<QlooInterest[]>([]);
  const [editingTaste, setEditingTaste] = useState(false);
  const [selected, setSelected] = useState<QlooInterest[]>([]);
  const [recs, setRecs] = useState<QlooPlace[]>([]);
  const [loading, setLoading] = useState(false);
  const [recLoading, setRecLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestSeqRef = useRef(0);

  const entryTitles = {ko:'내 취향저격 장소',en:'Places for my taste',ja:'好みにぴったりの場所',zh:'符合我口味的地点',es:'Lugares para mis gustos',fr:'Lieux selon mes goûts',de:'Orte nach meinem Geschmack',it:'Luoghi per i miei gusti'};
  const localCopy = { ...COPY.en, ...(COPY[language] || {}),title:entryTitles[language] };
  const entryHint=language==='ko'?'좋아하는 음식·브랜드로 새로운 곳 찾기':'Find new places from your favorite food and brands';

  useEffect(() => {
    let mounted = true;
    qlooAvailable().then(avail => {
      if (mounted) setIsAvailable(avail);
    });
    return () => { mounted = false; };
  }, []);

  useEffect(()=>{
    if(userId || !isAvailable) return;
    let mounted=true;
    getGuestTasteRemaining().then(n=>{if(mounted)setGuestRemaining(n);}).catch(()=>{if(mounted)setError(language==='ko'?'무료 이용 횟수를 확인하지 못했어요. 다시 연결해 주세요.':'Could not check your free uses. Please retry.');});
    const listener=(e:Event)=>{if(mounted)setGuestRemaining((e as CustomEvent<number>).detail);};
    window.addEventListener('slaptrip-guest-taste-remaining',listener);
    return()=>{mounted=false;window.removeEventListener('slaptrip-guest-taste-remaining',listener);};
  },[userId,isAvailable,language]);

  // Clear state on user change
  useEffect(() => {
    const requests = requestSeqRef;
    setSelected([]);
    setEditingTaste(false);
    setOptions(DEFAULT_OPTIONS);
    setProfileReady(false);
    setQuery('');
    setLoading(false);
    setRecLoading(false);
    setResults([]);
    setRecs([]);
    setError(null);
    setExpanded(false);
    requestSeqRef.current++;
    return () => { requests.current++; };
  }, [userId]);

  // Load saved interests
  useEffect(() => {
    if (!isAvailable) return;
    try {
      const storedOptions = localStorage.getItem(OPTIONS_PREFIX+storageUserId);
      if(storedOptions) {const restored=normalizeTasteDraft({summary:'Saved preferences',favorites:[],options:JSON.parse(storedOptions)});setOptions({...DEFAULT_OPTIONS,...restored.options});setProfileReady(true);}
      const stored = localStorage.getItem(STORAGE_PREFIX + storageUserId);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length <= 3) {

           const restored = parsed.filter(p => p && typeof p.id === 'string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(p.id) && typeof p.name === 'string' && p.name.length <= 200 && CATEGORIES.includes(p.type)).filter((p, i, a) => a.findIndex(x => x.id === p.id) === i).slice(0, 3);
           setSelected(restored);
        }
      }
    } catch (e) {
      // Ignore storage errors
    }
  }, [storageUserId, isAvailable]);

  const saveSelected = (items: QlooInterest[]) => {
    try {
      const toSave = items.slice(0, 3).map(({ id, name, type }) => ({ id, name, type }));
      localStorage.setItem(STORAGE_PREFIX + storageUserId, JSON.stringify(toSave));
    } catch (e) {
      // Continue silently
    }
  };

  const changeOptions = (next:QlooOptions) => {
    setOptions(next);setProfileReady(true);setRecs([]);setError(null);
    try {localStorage.setItem(OPTIONS_PREFIX+storageUserId,JSON.stringify(next));} catch { /* Storage can be unavailable. */ }
  };

  const handleSearch = async () => {
    if (query.trim().length < 2 || loading || recLoading) return;
    setResults([]);
    setLoading(true);
    setError(null);
    const seq = ++requestSeqRef.current;
    try {
      const res = await searchQloo(query, category);
      if (seq === requestSeqRef.current) {
        setResults(res);
        if (res.length === 0) setError(localCopy.noMatches);
      }
    } catch (err: any) {
      if (seq === requestSeqRef.current) {
        handleError(err.message);
      }
    } finally {
      if (seq === requestSeqRef.current) setLoading(false);
    }
  };

  const toggleSelect = (item: QlooInterest) => {
    const exists = selected.find(s => s.id === item.id);
    let newSel;
    if (exists) {
      newSel = selected.filter(s => s.id !== item.id);
    } else {
      if (selected.length >= 3) return;
      newSel = [...selected, item];
    }
    setRecs([]);
    setSelected(newSel);
    saveSelected(newSel);
  };

  const requestPlaces = async (ids:string[],next:QlooOptions,seq:number,names:string[]=selected.map(s=>s.name)) => {
    let loc=location;
    if(!loc) try {loc=await onRequestLocation();} catch { /* Permission denied. */ }
    if(seq!==requestSeqRef.current) return;
    if(!loc) throw new Error('location_required');
    const places=await recommendQloo(ids,loc,next,names);
    if(seq!==requestSeqRef.current) return;
    setRecs(places);
    if(!places.length) setError(localCopy.zeroRecs);
  };

  const applyTaste = async (input:TasteDraft) => {
    const draft=normalizeTasteDraft(input);
    const seq=++requestSeqRef.current;
    setLoading(true);setEditingTaste(false);setError(null);setResults([]);setRecs([]);
    try {
      const matches=await Promise.all(draft.favorites.map(f=>searchQloo(f.name,f.type)));
      if(seq!==requestSeqRef.current) return;
      const entities=matches.flat().filter((e,i,a)=>a.findIndex(x=>x.id===e.id)===i);
      const next={...DEFAULT_OPTIONS,...draft.options};
      changeOptions(next);setSelected([]);saveSelected([]);setResults(entities);
      if(entities.length) {
        setCategory(draft.favorites[0]?.type ?? 'place');

      } else {
        // Cuisine and drink tags are valid preferences without named businesses.
        await requestPlaces([],next,seq,draft.favorites.map(f=>f.name));
      }
    } catch (err) {
      if(seq===requestSeqRef.current) handleError(err instanceof Error?err.message:'unknown');
      throw err;
    } finally {
      if(seq===requestSeqRef.current) setLoading(false);
    }
  };

  const handleRecommend = async () => {
    if((!selected.length && (!profileReady || results.length > 0)) || loading || recLoading) return;
    setRecLoading(true);setError(null);setRecs([]);
    const seq=++requestSeqRef.current;
    try {await requestPlaces(selected.map(s=>s.id),options,seq);}
    catch(err) {if(seq===requestSeqRef.current) handleError(err instanceof Error?err.message:'unknown');}
    finally {if(seq===requestSeqRef.current) setRecLoading(false);}
  };

  const handleError = (msg: string) => {
    if (msg === 'guest_limit_reached') {setGuestRemaining(0);setError(language==='ko'?'무료 10회를 모두 사용했어요. 로그인하고 계속 이용해 주세요.':'Your 10 free uses are complete. Log in to continue.');}
    else if (msg === 'location_required') setError(language==='ko'?'위치를 허용한 뒤 다시 추천받아 주세요.':'Allow location access and try again.');
    else if (msg === 'timeout') setError(localCopy.errTimeout);
    else if (msg === 'rate_limited') setError(localCopy.errRateLimit);
    else if (msg === 'login_required' || msg === 'unauthorized') setError(localCopy.errAuth);
    else if (msg === 'not_configured' || msg === 'config_error' || msg === 'auth_unavailable') setError(localCopy.errConfig);
    else setError(localCopy.errNetwork);
  };

  if (!userId && guestRemaining===0 && !recs.length) return (
    <div className="p-4 border border-emerald-500/25 rounded-2xl bg-emerald-500/10 text-white">
      <h3 className="text-lg font-semibold">{localCopy.title}</h3>
      <p className="my-3 text-sm text-slate-300">{language==='ko'?'무료 취향 추천 10회를 모두 사용했어요. 로그인하고 계속 이용해 주세요.':'You have used all 10 free taste recommendations. Log in to continue.'}</p>
      <button type="button" onClick={onLogin} className="min-h-[44px] px-4 rounded-xl bg-emerald-600">{language==='ko'?'로그인하고 계속하기':'Log in to continue'}</button>
    </div>
  );

  if (!isAvailable) return (
    <div className="p-4 border border-emerald-500/25 rounded-2xl bg-emerald-500/10 text-white">
      <h3 className="text-lg font-semibold">{localCopy.title}</h3>
      <p className="mt-1 text-sm text-slate-300">{entryHint}</p>
      <p role="status" className="mt-3 text-xs text-slate-300">{isAvailable===null ? (language==='ko'?'추천 연결을 확인하고 있어요.':'Checking recommendations…') : (language==='ko'?'추천 연결을 확인하지 못했어요. 다시 시도해 주세요.':'Could not connect. Please try again.')}</p>
      {isAvailable===false && <button type="button" className="mt-3 min-h-[44px] px-4 rounded-xl bg-emerald-600" onClick={()=>{setIsAvailable(null);void qlooAvailable().then(setIsAvailable);}}>{language==='ko'?'다시 연결':'Retry connection'}</button>}
    </div>
  );

  return (
    <section className="px-4 sm:px-5 border border-emerald-500/25 rounded-2xl bg-slate-900 text-white overflow-hidden">
      <button type="button" className="w-full text-left flex justify-between items-center py-4 min-h-[44px] group focus-visible:outline-emerald-400" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>
        <div>
          <h3 className="text-lg font-semibold group-hover:text-emerald-400 transition-colors">{localCopy.title}</h3>
          <span className="block mt-1 text-xs text-slate-300">{entryHint}</span>
          {!userId && <span className="block mt-2 text-xs text-emerald-300">{language==='ko'?`로그인 없이 10회 무료 · ${guestRemaining===null?'확인 중':`남은 ${guestRemaining}회`}`:`10 free uses without login · ${guestRemaining===null?'Checking':`${guestRemaining} left`}`}</span>}
        </div>
        <svg className={`w-5 h-5 transform transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </button>

      {expanded && (
        <div className="pb-6 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
        {/* Taste editor collapses once a profile is applied. */}
          <details open={!profileReady && !results.length && !recs.length} className="group/onboard [&_summary::-webkit-details-marker]:hidden">
            <summary
              className="flex items-center justify-between cursor-pointer min-h-[44px] py-2 list-none"
              aria-label={language === 'ko' ? '취향 입력·수정' : 'Edit my taste'}
            >
              <span className="font-medium text-sm flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-600 text-xs font-bold shrink-0">1</span>
                {language === 'ko' ? '취향 입력·수정' : 'Edit my taste'}
              </span>
              <svg className="w-5 h-5 transform transition-transform group-open/onboard:rotate-180 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </summary>
            <div key={userId} className="mt-2 pl-0 sm:pl-8 pr-1 pb-2 animate-in fade-in slide-in-from-top-2 duration-200">
              <TasteOnboarding language={language} disabled={loading || recLoading} onApply={applyTaste} />
            </div>
          </details>

        {/* Controls & Actions Section (Visible when ready or has data) */}
        {!editingTaste && (profileReady || selected.length > 0 || results.length > 0) && (
          <>
            {/* Adjust Recommendations Details */}
            <details className="group/controls [&_summary::-webkit-details-marker]:hidden">
              <summary
                className="flex items-center justify-between cursor-pointer min-h-[44px] py-2 px-3 -mx-3 rounded-xl hover:bg-slate-800/50 transition-colors list-none"
                aria-label={language === 'ko' ? '추천 조건 조정' : 'Adjust recommendations'}
              >
                <span className="font-medium text-sm text-slate-300">
                  {language === 'ko' ? '추천 조건 조정' : 'Adjust recommendations'}
                </span>
                <svg className="w-5 h-5 transform transition-transform group-open/controls:rotate-180 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </summary>
              <div className="pt-3 pb-2 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                <LocalRecommendationControls language={language} value={options} disabled={loading || recLoading} onChange={changeOptions} />


              </div>
            </details>

            {/* Selection Chips (Always visible when selected) */}
            {selected.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                  {language === 'ko' ? '추천에서 제외할 취향 기준' : 'Taste references excluded from results'}
                </p>
                <div className="flex flex-wrap gap-2">
                  {selected.map(item => (
                    <span key={item.id} className="inline-flex max-w-full items-center px-3 py-1.5 rounded-full text-xs bg-slate-800 border border-slate-600 text-slate-200 shadow-sm">
                      <span className="min-w-0 break-words">{item.name}</span>
                      <button onClick={() => toggleSelect(item)} disabled={loading || recLoading} className="ml-2 shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center hover:text-red-400 focus:outline-none focus-visible:ring-2 ring-red-500 rounded-full transition-colors" aria-label={`${localCopy.removeChip}: ${item.name}`}>&times;</button>
                    </span>
                  ))}
                </div>
              <p className="text-xs text-slate-300">{language === 'ko' ? '이 장소와 같은 상호의 지점은 빼고, 비슷한 취향의 새로운 곳을 찾아요.' : 'Discover similar places while excluding these favorites and outlets with the same name.'}</p>
              </div>
            )}

            {/* Manual Search Form */}
            <details className="group/search [&_summary::-webkit-details-marker]:hidden">
              <summary
                className="flex items-center justify-between cursor-pointer min-h-[44px] py-2 px-3 -mx-3 rounded-xl hover:bg-slate-800/50 transition-colors list-none"
                aria-label={language === 'ko' ? '좋아하는 곳 직접 검색' : 'Search a favorite'}
              >
                <span className="font-medium text-sm text-slate-300">
                  {language === 'ko' ? '좋아하는 곳 직접 검색' : 'Search a favorite'}
                </span>
                <svg className="w-5 h-5 transform transition-transform group-open/search:rotate-180 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </summary>

              <form className="mt-3 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200" onSubmit={e => {e.preventDefault(); void handleSearch();}}>
                <label htmlFor="qloo-query" className="block text-xs uppercase tracking-wider text-slate-400">{localCopy.searchLabel}</label>
                <div className="flex flex-wrap gap-2">
                  <select aria-label={localCopy.categoryLabel} disabled={loading || recLoading} value={category} onChange={(e) => setCategory(e.target.value as Category)} className="bg-slate-800 border border-slate-600 rounded-xl px-3 py-2 min-h-[44px] text-sm text-white focus:border-emerald-500 outline-none appearance-none cursor-pointer">
                    {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                  </select>
                  <input
                    id="qloo-query" minLength={2} maxLength={100} required type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={localCopy[`placeholder${category.charAt(0).toUpperCase() + category.slice(1)}` as keyof typeof localCopy] || 'Search...'}
                    className="min-w-0 flex-1 basis-32 bg-slate-800 border border-slate-600 rounded-xl px-3 py-2 min-h-[44px] text-sm text-white focus:border-emerald-500 outline-none placeholder:text-slate-500"
                  />
                  <button type="submit" disabled={loading || recLoading || query.trim().length < 2} className="min-h-[44px] px-4 bg-slate-700 hover:bg-slate-600 text-white disabled:opacity-50 rounded-xl font-medium text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400">
                    {loading ? localCopy.loading : localCopy.btnSearch}
                  </button>
                </div>
              </form>
            </details>
          </>
        )}

        {/* Search Results (Outside details) */}
        {results.length > 0 && (
          <details open={!recs.length} className="space-y-3 pt-2">
            <summary className="min-h-[44px] cursor-pointer text-sm font-semibold text-emerald-400">
              {language === 'ko' ? '2 · 취향 기준 확인' : '2 · Confirm taste references'}
            </summary>
            <div>
              <button type="button" disabled={loading || recLoading} onClick={()=>{setResults([]);setProfileReady(false);setEditingTaste(true);}} className="min-h-[44px] text-sm text-slate-300">{language==='ko'?'← 이전 · 취향 입력':'← Back · edit taste'}</button>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                {language === 'ko'
                  ? "입력한 식당·브랜드와 일치하는 항목을 골라주세요. 같은 체인은 한 곳만 선택하면 됩니다."
                  : "Choose the exact restaurants or brands. Select just one outlet per chain."}
              </p>
            </div>

            <ul className="space-y-2 max-h-60 overflow-y-auto pr-1 custom-scrollbar scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-transparent">
              {results.map(r => {
                const isSelected = selected.some(s => s.id === r.id);
                return (
                  <li key={r.id}>
                    <button
                      onClick={() => toggleSelect(r)}
                      aria-pressed={isSelected}
                      disabled={loading || recLoading || (!isSelected && selected.length >= 3)}
                      className={`w-full text-left p-3 rounded-xl border transition-all min-h-[44px] flex flex-col justify-center active:scale-[0.99] ${isSelected ? 'border-emerald-500 bg-emerald-900/20 ring-1 ring-emerald-500/50' : 'border-slate-700 bg-slate-800/50 hover:bg-slate-800 hover:border-slate-600'} disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      <span className="font-medium text-sm text-white break-words">{r.name} <span className="opacity-60 font-normal text-xs">· {r.type}</span></span>
                      {r.description && <span className="text-xs opacity-60 line-clamp-1 text-slate-300 mt-0.5">{r.description}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </details>
        )}

        {!editingTaste && (profileReady || selected.length > 0) && (
                <div className="pt-2 border-t border-slate-700/50">
                   <p className="text-xs text-slate-400 mb-2">{localCopy.disclosure}</p>
                   <p className="text-xs text-slate-400 mb-3">{localCopy.maxChips} · {options.radius / 1000} km</p>
                   <button
                     onClick={!userId && guestRemaining===0 ? onLogin : handleRecommend}
                     disabled={(selected.length === 0 && (!profileReady || results.length > 0)) || recLoading || loading}
                     className="w-full min-h-[44px] bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
                   >
                     {!userId && guestRemaining===0 ? (language==='ko'?'로그인하고 계속하기':'Log in to continue') : recLoading ? localCopy.recLoading : recs.length ? (language === 'ko' ? '다시 추천받기' : 'Refresh recommendations') : localCopy.btnGetRecs}
                   </button>
                </div>
        )}

        {/* Errors */}
        {error && (
          <div role="alert" className="p-3 bg-red-900/30 border border-red-800 text-red-200 text-sm rounded-xl">
            {error}
            {error === localCopy.errAuth && <button onClick={onLogin} className="block min-h-[44px] underline mt-2 text-red-300 hover:text-white">{language === 'ko' ? '로그인' : 'Log in'}</button>}
          </div>
        )}

        {/* Loading State Accessible */}
        {(loading || recLoading) && !results.length && !recs.length && (
           <div role="status" className="flex items-center justify-center py-8 text-slate-400">
             <svg className="animate-spin h-5 w-5 mr-3 text-emerald-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
               <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
               <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
             </svg>
             <span className="sr-only">Loading...</span>
           </div>
        )}

        {/* Recommendations */}
        {recs.length > 0 && (
          <div className="space-y-4 pt-4 border-t border-slate-700/50">
            <button type="button" onClick={()=>{setRecs([]);if(!results.length){setProfileReady(false);setEditingTaste(true);}}} className="min-h-[44px] text-sm text-slate-300">{language==='ko'?'← 이전 · 취향 기준 바꾸기':'← Back · change taste references'}</button>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-base font-bold text-white">{language === 'ko' ? '나에게 맞는 새로운 장소' : 'New places for you'}</h4>
              <span className="text-xs text-slate-400 bg-slate-800 px-2 py-1 rounded-md border border-slate-700">
                {language === 'ko' ? '주변' : 'Within'} {options.radius / 1000} km
              </span>
            </div>

            <div className="grid gap-3">
              {recs.map((place, index) => (
                <div key={place.id} className="p-4 bg-slate-800/80 border border-slate-700 rounded-xl relative group hover:border-slate-600 transition-colors shadow-sm">
                  <div className="absolute top-3 right-3 inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-700 text-xs font-bold text-slate-300 border border-slate-600">
                    {index + 1}
                  </div>
                  <h5 className="font-medium text-base leading-tight mb-1 pr-8 text-white break-words">{place.name}</h5>
                  <p className="text-xs opacity-70 mb-2 text-slate-400 line-clamp-1">{place.address}</p>
                  {place.description && <p className="text-sm opacity-90 line-clamp-2 mb-4 text-slate-300">{place.description}</p>}

                  <a
                    href={place.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex w-full min-h-[44px] items-center justify-center text-sm font-medium text-emerald-400 hover:text-emerald-300 hover:bg-emerald-900/20 rounded-lg transition-colors border border-transparent hover:border-emerald-900/50"
                  >
                    {localCopy.openMaps}
                    <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}
        </div>
      )}
    </section>
  );
}
