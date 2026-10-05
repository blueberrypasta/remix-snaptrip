import React, { useState, useEffect, useRef } from 'react';
import { qlooAvailable, searchQloo, recommendQloo } from '../services/qlooService';
import type { QlooInterest, QlooPlace } from '../services/qlooService';
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
    title: 'Your next stop',
    poweredBy: 'Powered by Qloo',
    loginPrompt: 'Log in to discover personalized recommendations.',
    expand: 'Discover Places',
    collapse: 'Hide Recommendations',
    searchLabel: 'Find inspiration',
    categoryLabel: 'Category',
    placeholderArtist: 'e.g., Taylor Swift',
    placeholderMovie: 'e.g., Spirited Away',
    placeholderBook: 'e.g., The Little Prince',
    placeholderPlace: 'e.g., Kyoto Station',
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
  ko: { title: '다음 여행지', poweredBy: 'Qloo 제공', loginPrompt: '개인화된 추천을 위해 로그인하세요.', expand: '장소 찾기', collapse: '추천 숨기기', searchLabel: '영감 검색', categoryLabel: '카테고리', btnSearch: '검색', btnGetRecs: '추천 받기', disclosure: '선택한 관심사와 대략적인 위치가 Qloo로 전송됩니다.', maxChips: '최대 3개 선택', loading: '검색 중...', recLoading: '아이디어 생성 중...', noMatches: '일치하는 항목이 없습니다.', zeroRecs: '근처 장소를 찾지 못했습니다.', errNetwork: '연결 문제입니다.', errTimeout: '시간 초과됨.', errRateLimit: '요청이 너무 많습니다.', errAuth: '세션 만료됨.', errConfig: '서비스 일시 불가.', openMaps: '지도에서 보기', removeChip: '선택 해제' },
  ja: { title: '次の目的地', poweredBy: 'Qloo提供', loginPrompt: 'パーソナライズされたおすすめを見るにはログインしてください。', expand: '場所を探す', collapse: 'おすすめを隠す', searchLabel: 'インスピレーション検索', categoryLabel: 'カテゴリ', btnSearch: '検索', btnGetRecs: 'おすすめを取得', disclosure: '選択した興味と概算位置情報がQlooに送信されます。', maxChips: '最大3件まで', loading: '検索中...', recLoading: 'アイデア生成中...', noMatches: '一致する項目が見つかりません。', zeroRecs: '近くのスポットが見つかりませんでした。', errNetwork: '接続エラーです。', errTimeout: 'タイムアウトしました。', errRateLimit: 'リクエストが多すぎます。', errAuth: 'セッション期限切れ。', errConfig: 'サービス一時停止中。', openMaps: '地図で見る', removeChip: '削除' },
  zh: { title: '下一站', poweredBy: '由 Qloo 驱动', loginPrompt: '登录以获取个性化推荐。', expand: '发现地点', collapse: '隐藏推荐', searchLabel: '寻找灵感', categoryLabel: '类别', btnSearch: '搜索', btnGetRecs: '获取推荐', disclosure: '您选择的兴趣和大致位置将发送给 Qloo。', maxChips: '最多选择3个', loading: '搜索中...', recLoading: '生成建议中...', noMatches: '未找到匹配项。', zeroRecs: '附近未找到特定地点。', errNetwork: '连接问题，请重试。', errTimeout: '请求超时。', errRateLimit: '请求过多，请稍等。', errAuth: '会话过期，请重新登录。', errConfig: '服务暂时不可用。', openMaps: '在地图查看', removeChip: '移除选择' },
  es: { title: 'Tu próximo destino', poweredBy: 'Impulsado por Qloo', loginPrompt: 'Inicia sesión para ver recomendaciones personalizadas.', expand: 'Descubrir lugares', collapse: 'Ocultar recomendaciones', searchLabel: 'Buscar inspiración', categoryLabel: 'Categoría', btnSearch: 'Buscar', btnGetRecs: 'Obtener recomendaciones', disclosure: 'Tus intereses seleccionados y ubicación aproximada se envían a Qloo.', maxChips: 'Máximo 3 selecciones', loading: 'Buscando...', recLoading: 'Generando ideas...', noMatches: 'Sin coincidencias.', zeroRecs: 'No se encontraron lugares cercanos.', errNetwork: 'Problema de conexión.', errTimeout: 'Tiempo agotado.', errRateLimit: 'Demasiadas solicitudes.', errAuth: 'Sesión expirada.', errConfig: 'Servicio temporalmente no disponible.', openMaps: 'Ver en mapa', removeChip: 'Eliminar selección' },
  fr: { title: 'Votre prochain arrêt', poweredBy: 'Propulsé par Qloo', loginPrompt: 'Connectez-vous pour des recommandations personnalisées.', expand: 'Découvrir des lieux', collapse: 'Masquer les recommandations', searchLabel: 'Trouver de l\'inspiration', categoryLabel: 'Catégorie', btnSearch: 'Rechercher', btnGetRecs: 'Obtenir des recommandations', disclosure: 'Vos intérêts sélectionnés et votre position approximative sont envoyés à Qloo.', maxChips: 'Max 3 sélections', loading: 'Recherche...', recLoading: 'Génération d\'idées...', noMatches: 'Aucun résultat trouvé.', zeroRecs: 'Impossible de trouver des endroits proches.', errNetwork: 'Problème de connexion.', errTimeout: 'Délai dépassé.', errRateLimit: 'Trop de requêtes.', errAuth: 'Session expirée.', errConfig: 'Service temporairement indisponible.', openMaps: 'Voir sur la carte', removeChip: 'Retirer la sélection' },
  de: { title: 'Dein nächster Halt', poweredBy: 'Bereitgestellt von Qloo', loginPrompt: 'Melde dich an für personalisierte Empfehlungen.', expand: 'Orte entdecken', collapse: 'Empfehlungen ausblenden', searchLabel: 'Inspiration finden', categoryLabel: 'Kategorie', btnSearch: 'Suchen', btnGetRecs: 'Empfehlungen holen', disclosure: 'Deine ausgewählten Interessen und ungefähre Position werden an Qloo gesendet.', maxChips: 'Maximal 3 Auswahlen', loading: 'Suche...', recLoading: 'Ideen generieren...', noMatches: 'Keine Treffer gefunden.', zeroRecs: 'Konnte keine Orte in der Nähe finden.', errNetwork: 'Verbindungsproblem.', errTimeout: 'Zeitüberschreitung.', errRateLimit: 'Zu viele Anfragen.', errAuth: 'Sitzung abgelaufen.', errConfig: 'Dienst vorübergehend nicht verfügbar.', openMaps: 'Auf Karte anzeigen', removeChip: 'Auswahl entfernen' },
  it: { title: 'La tua prossima tappa', poweredBy: 'Offerto da Qloo', loginPrompt: 'Accedi per consigli personalizzati.', expand: 'Scopri luoghi', collapse: 'Nascondi consigli', searchLabel: 'Trova ispirazione', categoryLabel: 'Categoria', btnSearch: 'Cerca', btnGetRecs: 'Ottieni consigli', disclosure: 'I tuoi interessi selezionati e la posizione approssimativa vengono inviati a Qloo.', maxChips: 'Massimo 3 selezioni', loading: 'Ricerca...', recLoading: 'Generazione idee...', noMatches: 'Nessuna corrispondenza trovata.', zeroRecs: 'Impossibile trovare luoghi nelle vicinanze.', errNetwork: 'Problema di connessione.', errTimeout: 'Richiesta scaduta.', errRateLimit: 'Troppe richieste.', errAuth: 'Sessione scaduta.', errConfig: 'Servizio temporaneamente non disponibile.', openMaps: 'Vedi su mappa', removeChip: 'Rimuovi selezione' },
};

const CATEGORIES = ['artist', 'movie', 'book', 'place', 'brand'] as const;
type Category = typeof CATEGORIES[number];

const STORAGE_PREFIX = 'slaptrip_qloo_interests:';

export const TasteRecommendations: React.FC<Props> = ({ language, location, onRequestLocation, onLogin, userId }) => {
  const [isAvailable, setIsAvailable] = useState<boolean>(false);
  const [expanded, setExpanded] = useState(false);
  const [category, setCategory] = useState<Category>('artist');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<QlooInterest[]>([]);
  const [selected, setSelected] = useState<QlooInterest[]>([]);
  const [recs, setRecs] = useState<QlooPlace[]>([]);
  const [loading, setLoading] = useState(false);
  const [recLoading, setRecLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestSeqRef = useRef(0);

  const localCopy = { ...COPY.en, ...(COPY[language] || {}) };

  useEffect(() => {
    let mounted = true;
    qlooAvailable().then(avail => {
      if (mounted) setIsAvailable(avail);
    });
    return () => { mounted = false; };
  }, []);

  // Clear state on user change
  useEffect(() => {
    const requests = requestSeqRef;
    setSelected([]);
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
    if (!userId || !isAvailable) return;
    try {
      const stored = localStorage.getItem(STORAGE_PREFIX + userId);
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
  }, [userId, isAvailable]);

  const saveSelected = (items: QlooInterest[]) => {
    if (!userId) return;
    try {
      const toSave = items.slice(0, 3).map(({ id, name, type }) => ({ id, name, type }));
      localStorage.setItem(STORAGE_PREFIX + userId, JSON.stringify(toSave));
    } catch (e) {
      // Continue silently
    }
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

  const handleRecommend = async () => {
    if (selected.length === 0 || loading || recLoading) return;
    setRecLoading(true);
    setError(null);
    setRecs([]);
    const seq = ++requestSeqRef.current;

    let loc = location;
    if (!loc) {
      try {
        loc = await onRequestLocation();
      } catch (e) {
        // Permission denied or fail
      }
    }

    if (seq !== requestSeqRef.current) return;
    if (!loc) {
       if (seq === requestSeqRef.current) {
         setRecLoading(false);
         setError(language === 'ko' ? '추천을 받으려면 위치를 허용해주세요.' : 'Allow location access to get nearby recommendations.');
       }
       return;
    }

    try {
      const ids = selected.map(s => s.id);
      const res = await recommendQloo(ids, loc);
      if (seq === requestSeqRef.current) {
        setRecs(res);
        if (res.length === 0) setError(localCopy.zeroRecs);
      }
    } catch (err: any) {
      if (seq === requestSeqRef.current) {
        handleError(err.message);
      }
    } finally {
      if (seq === requestSeqRef.current) setRecLoading(false);
    }
  };

  const handleError = (msg: string) => {
    if (msg === 'timeout') setError(localCopy.errTimeout);
    else if (msg === 'rate_limited') setError(localCopy.errRateLimit);
    else if (msg === 'login_required' || msg === 'unauthorized') setError(localCopy.errAuth);
    else if (msg === 'not_configured' || msg === 'config_error' || msg === 'auth_unavailable') setError(localCopy.errConfig);
    else setError(localCopy.errNetwork);
  };

  if (!isAvailable) return null;
  if (!userId) {
    return (
      <div className="px-5 mt-4 border-white/10 rounded-[2rem] bg-white/5 text-white">
        <h3 className="text-lg font-semibold mb-2">{localCopy.title}</h3>
        <p className="text-sm opacity-70 mb-4">{localCopy.loginPrompt}</p>
        <button onClick={onLogin} className="min-h-[44px] px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-xl font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400">
          {language === 'ko' ? '로그인' : 'Log in'}
        </button>
      </div>
    );
  }

  return (
    <section className="px-5 mt-4 border-white/10 rounded-[2rem] bg-white/5 text-white overflow-hidden">
      <button type="button" className="w-full text-left flex justify-between items-center py-4 min-h-[44px] group focus-visible:outline-emerald-400" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>
        <div>
          <h3 className="text-lg font-semibold group-hover:text-emerald-400 transition-colors">{localCopy.title}</h3>
          <span className="text-xs opacity-50">{localCopy.poweredBy}</span>
        </div>
        <svg className={`w-5 h-5 transform transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </button>

      {expanded && (
        <div className="pb-6 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
          {/* Selection Chips */}
          {selected.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {selected.map(item => (
                <span key={item.id} className="inline-flex items-center px-3 py-1 rounded-full text-xs bg-emerald-900/50 border border-emerald-700/50 text-emerald-100">
                  {item.name}
                  <button onClick={() => toggleSelect(item)} disabled={loading || recLoading} className="ml-2 min-h-[44px] min-w-[44px] hover:text-white focus:outline-none focus-visible:ring-1 ring-white rounded-full" aria-label={`${localCopy.removeChip}: ${item.name}`}>&times;</button>
                </span>
              ))}
            </div>
          )}

          {/* Search Form */}
          <form className="space-y-3" onSubmit={e => {e.preventDefault(); void handleSearch();}}>
            <label htmlFor="qloo-query" className="block text-xs uppercase tracking-wider opacity-60">{localCopy.searchLabel}</label>
            <div className="flex flex-wrap gap-2">
              <select aria-label={localCopy.categoryLabel} disabled={loading || recLoading} value={category} onChange={(e) => setCategory(e.target.value as Category)} className="bg-black/20 border border-white/10 rounded-xl px-3 py-2 min-h-[44px] text-sm focus:border-emerald-500 outline-none">
                {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
              </select>
              <input
                id="qloo-query" minLength={2} maxLength={100} required type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={localCopy[`placeholder${category.charAt(0).toUpperCase() + category.slice(1)}` as keyof typeof localCopy] || 'Search...'}
                className="min-w-0 flex-1 basis-32 bg-black/20 border border-white/10 rounded-xl px-3 py-2 min-h-[44px] text-sm focus:border-emerald-500 outline-none placeholder:text-white/30"
              />
              <button type="submit" disabled={loading || recLoading || query.trim().length < 2} className="min-h-[44px] px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-xl font-medium text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400">
                {loading ? localCopy.loading : localCopy.btnSearch}
              </button>
            </div>
          </form>

          {/* Results List */}
          {results.length > 0 && (
            <ul className="space-y-2 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
              {results.map(r => {
                const isSelected = selected.some(s => s.id === r.id);
                return (
                  <li key={r.id}>
                    <button
                      onClick={() => toggleSelect(r)}
                      aria-pressed={isSelected} disabled={loading || recLoading || (!isSelected && selected.length >= 3)}
                      className={`w-full text-left p-3 rounded-xl border transition-all min-h-[44px] flex flex-col justify-center ${isSelected ? 'border-emerald-500 bg-emerald-900/30' : 'border-white/10 bg-white/5 hover:bg-white/10'} disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      <span className="font-medium text-sm">{r.name} <span className="opacity-60">· {r.type}</span></span>
                      {r.description && <span className="text-xs opacity-60 line-clamp-1">{r.description}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Action Button */}
          <div className="pt-2 border-t border-white/10">
             <p className="text-xs text-slate-300 mb-2">{localCopy.disclosure}</p>
             <p className="text-xs text-slate-300 mb-3">{localCopy.maxChips} · 15 km</p>
             <button
               onClick={handleRecommend}
               disabled={selected.length === 0 || recLoading || loading}
               className="w-full min-h-[44px] bg-white text-black font-bold rounded-xl hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
             >
               {recLoading ? localCopy.recLoading : localCopy.btnGetRecs}
             </button>
          </div>

          {/* Errors */}
          {error && (
            <div role="alert" className="p-3 bg-red-900/30 border border-red-800 text-red-200 text-sm rounded-xl">
              {error}
              {error === localCopy.errAuth && <button onClick={onLogin} className="block min-h-[44px] underline">{language === 'ko' ? '로그인' : 'Log in'}</button>}
            </div>
          )}

          {/* Recommendations */}
          {recs.length > 0 && (
            <div className="space-y-3 pt-4">
              <h4 className="text-sm font-semibold opacity-80">{localCopy.title}</h4>
              <div className="grid gap-3">
                {recs.map(place => (
                  <div key={place.id} className="p-4 bg-black/20 border border-white/10 rounded-xl relative group">
                    <h5 className="font-medium text-base leading-tight mb-1">{place.name}</h5>
                    <p className="text-xs opacity-60 mb-2">{place.address}</p>
                    {place.description && <p className="text-sm opacity-80 line-clamp-2 mb-3">{place.description}</p>}
                    <a href={place.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[44px] items-center text-xs font-medium text-emerald-400 hover:text-emerald-300 transition-colors">
                      {localCopy.openMaps} <svg className="w-3 h-3 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
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
};
