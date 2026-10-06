import React from 'react';
import type { Language } from '../types';
import type { QlooOptions } from '../services/qlooService';

type Dict = { cat: string[]; mode: string[]; cuisines: string[]; price: string[]; radius: string[] };

const DICTS: Record<Language, Dict> = {
  en: { cat: ['Food', 'Shopping', 'Sights'], mode: ['Balanced', 'Well-known', 'New discoveries'], cuisines: ['Any', 'Korean', 'Japanese', 'Italian', 'Mexican', 'American', 'Vegetarian'], price: ['Any', '$', '$$', '$$$', '$$$$'], radius: ['Within 5 km', 'Within 15 km', 'Within 30 km'] },
  ko: { cat: ['먹을 곳', '쇼핑', '볼거리'], mode: ['골고루', '유명한 곳', '새로운 발견'], cuisines: ['선택 안 함', '한식', '일식', '이탈리아', '멕시칸', '미국', '채식'], price: ['전체', '$', '$$', '$$$', '$$$$'], radius: ['주변 5 km', '주변 15 km', '주변 30 km'] },
  ja: { cat: ['グルメ', 'ショッピング', '観光スポット'], mode: ['バランス', '人気順', '新発見'], cuisines: ['指定なし', '韓国料理', '日本料理', 'イタリアン', 'メキシカン', 'アメリカン', 'ベジタリアン'], price: ['すべて', '$', '$$', '$$$', '$$$$'], radius: ['半径5km以内', '半径15km以内', '半径30km以内'] },
  zh: { cat: ['美食', '购物', '景点'], mode: ['均衡', '热门', '探索'], cuisines: ['不限', '韩式', '日式', '意式', '墨西哥', '美式', '素食'], price: ['全部', '$', '$$', '$$$', '$$$$'], radius: ['5公里内', '15公里内', '30公里内'] },
  es: { cat: ['Comida', 'Compras', 'Atracciones'], mode: ['Equilibrado', 'Popular', 'Novedades'], cuisines: ['Cualquiera', 'Coreana', 'Japonesa', 'Italiana', 'Mexicana', 'Americana', 'Vegetariana'], price: ['Todo', '$', '$$', '$$$', '$$$$'], radius: ['Hasta 5 km', 'Hasta 15 km', 'Hasta 30 km'] },
  fr: { cat: ['Restaurants', 'Shopping', 'Visites'], mode: ['Équilibré', 'Populaire', 'Découvertes'], cuisines: ['Toutes', 'Coréenne', 'Japonaise', 'Italienne', 'Mexicaine', 'Américaine', 'Végétarienne'], price: ['Tout', '$', '$$', '$$$', '$$$$'], radius: ['Moins de 5 km', 'Moins de 15 km', 'Moins de 30 km'] },
  de: { cat: ['Essen', 'Einkaufen', 'Sehenswürdigkeiten'], mode: ['Ausgewogen', 'Beliebt', 'Neuentdeckungen'], cuisines: ['Alle', 'Koreanisch', 'Japanisch', 'Italienisch', 'Mexikanisch', 'Amerikanisch', 'Vegetarisch'], price: ['Alles', '$', '$$', '$$$', '$$$$'], radius: ['Bis 5 km', 'Bis 15 km', 'Bis 30 km'] },
  it: { cat: ['Ristoranti', 'Shopping', 'Attrazioni'], mode: ['Bilanciato', 'Popolare', 'Scoperte'], cuisines: ['Qualsiasi', 'Coreana', 'Giapponese', 'Italiana', 'Messicana', 'Americana', 'Vegetariana'], price: ['Tutto', '$', '$$', '$$$', '$$$$'], radius: ['Entro 5 km', 'Entro 15 km', 'Entro 30 km'] },
};

const LABELS: Record<Language, Record<string, string>> = {
  en: { title: 'Local recommendations', desc: 'Places within your current travel area. Favorites personalize results.', cuisine: 'Cuisine', price: 'Maximum price', style: 'Style', radius: 'Distance', hint: 'Explore places with lower popularity.' },
  ko: { title: '이 지역에서 어디 갈까', desc: '현재 위치 주변에서 좋아하는 식당·브랜드를 기준으로 추천합니다.', cuisine: '음식 종류', price: '최대 가격대', style: '스타일', radius: '이동 거리', hint: '상대적으로 인기도가 낮은 장소를 더 찾아봅니다.' },
  ja: { title: 'このエリアのおすすめ', desc: '現在の旅行エリア内の場所。お気に入りが結果を最適化します。', cuisine: 'ジャンル', price: '最高価格', style: 'スタイル', radius: '距離', hint: '人気度が比較的低い場所も探します。' },
  zh: { title: '本地推荐', desc: '当前旅行区域内的地点，收藏会个性化结果。', cuisine: '菜系', price: '最高价格', style: '风格', radius: '距离', hint: '探索相对不那么热门的地点。' },
  es: { title: 'Recomendaciones locales', desc: 'Lugares dentro del área actual. Tus favoritos personalizan los resultados.', cuisine: 'Tipo de cocina', price: 'Precio máximo', style: 'Estilo', radius: 'Distancia', hint: 'Explora lugares relativamente menos populares.' },
  fr: { title: 'Recommandations locales', desc: 'Lieux dans la zone actuelle. Vos favoris personnalisent les résultats.', cuisine: 'Type de cuisine', price: 'Prix maximum', style: 'Style', radius: 'Distance', hint: 'Explorez des lieux relativement moins populaires.' },
  de: { title: 'Lokale Empfehlungen', desc: 'Orte im aktuellen Reisegebiet. Favoriten personalisieren die Ergebnisse.', cuisine: 'Küchenart', price: 'Maximaler Preis', style: 'Stil', radius: 'Distanz', hint: 'Entdecke vergleichsweise weniger beliebte Orte.' },
  it: { title: 'Consigli locali', desc: 'Luoghi nell\'area di viaggio attuale. I preferiti personalizzano i risultati.', cuisine: 'Tipo di cucina', price: 'Prezzo massimo', style: 'Stile', radius: 'Distanza', hint: 'Esplora luoghi relativamente meno popolari.' },
};

interface Props { language: Language; value: QlooOptions; onChange: (value: QlooOptions) => void; disabled: boolean; }

export function LocalRecommendationControls({ language, value, onChange, disabled }: Props): React.ReactElement {
  const d = DICTS[language];
  const t = LABELS[language];
  const base = 'w-full min-h-[44px] rounded-lg bg-white/5 text-sm text-emerald-50 border border-white/10 px-3 py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:opacity-50 transition-colors hover:border-emerald-400/40';
  const lbl = 'block mb-1 text-xs font-medium uppercase tracking-wide text-emerald-300/80';

  return (
    <section className="rounded-xl border border-white/10 bg-white/5 p-4 sm:p-5" aria-label={t.title}>
      <header className="mb-4">
        <h3 className="text-base font-semibold text-emerald-50">{t.title}</h3>
        <p className="mt-1 text-xs leading-relaxed text-emerald-200/70">{t.desc}</p>
      </header>

      <div role="group" aria-label={d.cat.join(' / ')} className="grid grid-cols-3 gap-2">
        {(['food', 'shopping', 'visits'] as const).map((cat, i) => (
          <button key={cat} type="button" disabled={disabled} aria-pressed={value.category === cat}
            onClick={() => onChange({ ...value, category: cat, cuisine: 'any', drink:'any', priceMax: 0 })}
            className={`min-h-[44px] rounded-lg border px-2 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${value.category === cat ? 'border-emerald-400 bg-emerald-500/20 text-emerald-50' : 'border-white/10 bg-white/5 text-emerald-200/70 hover:border-emerald-400/40'} disabled:opacity-50`}>
            {d.cat[i]}
          </button>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
        {value.category === 'food' && (
          <>
            <label className="min-w-0 block">
              <span className={lbl}>{t.cuisine}</span>
              <select className={base} disabled={disabled} value={value.cuisine}
                onChange={(e) => onChange({ ...value, cuisine: e.target.value as QlooOptions['cuisine'] })}>
                {d.cuisines.map((n, i) => <option key={i} value={['any','korean','japanese','italian','mexican','american','vegetarian'][i]}>{n}</option>)}
              </select>
            </label>
            <label className="min-w-0 block">
              <span className={lbl}>{t.price}</span>
              <select className={base} disabled={disabled} value={String(value.priceMax)}
                onChange={(e) => onChange({ ...value, priceMax: Number(e.target.value) })}>
                {d.price.map((n, i) => <option key={i} value={i}>{n}</option>)}
              </select>
            </label>
          </>
        )}
        <label className="min-w-0 block">
          <span className={lbl}>{t.style}</span>
          <select className={base} disabled={disabled} value={value.mode}
            onChange={(e) => onChange({ ...value, mode: e.target.value as QlooOptions['mode'] })}>
            {d.mode.map((n, i) => <option key={i} value={['balanced','popular','discover'][i]}>{n}</option>)}
          </select>
        </label>
        <label className="min-w-0 block">
          <span className={lbl}>{t.radius}</span>
          <select className={base} disabled={disabled} value={String(value.radius)}
            onChange={(e) => onChange({ ...value, radius: Number(e.target.value) })}>
            {[5000, 15000, 30000].map((r, i) => <option key={r} value={r}>{d.radius[i]}</option>)}
          </select>
        </label>
      </div>

      {value.category === 'food' && <label className="block mt-3 text-sm text-emerald-200">
        {language==='ko'?'음식 탐색 방식':'Food exploration'}
        <select className={base} disabled={disabled} value={value.foodApproach ?? 'familiar'} onChange={e=>onChange({...value,foodApproach:e.target.value as QlooOptions['foodApproach']})}>
          <option value="familiar">{language==='ko'?'익숙한 음식':'Familiar food'}</option><option value="local">{language==='ko'?'현지 음식 둘러보기':'Explore food here'}</option><option value="both">{language==='ko'?'둘 다':'A mix of both'}</option>
        </select>
        <span className="block mt-1 text-xs opacity-70">{language==='ko'?(value.foodApproach==='local'?'음식 종류의 제한을 풀고 지금 지역에서 다양한 곳을 찾습니다.':value.foodApproach==='both'?'취향을 참고하되 다양한 음식도 함께 둘러봅니다.':'선택한 음식 종류와 취향을 우선합니다.'):'Choose whether to keep your cuisine filter or explore more food in this area.'}</span>
      </label>}
      {value.category === 'food' && <label className="block mt-3 text-sm text-emerald-200">
        {language==='ko'?'함께 추천받을 음료':'Include a drink preference'}
        <select className={base} disabled={disabled} value={value.drink ?? 'any'} onChange={e=>onChange({...value,drink:e.target.value as 'any'|'matcha'})}>
          <option value="any">{language==='ko'?'선택 안 함':'None'}</option><option value="matcha">{language==='ko'?'말차 라떼 · 카페':'Matcha latte · cafés'}</option>
        </select>
      </label>}
      {value.mode === 'discover' && (
        <p className="mt-3 rounded-lg border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-xs leading-relaxed text-emerald-200/90">{t.hint}</p>
      )}
    </section>
  );
}
