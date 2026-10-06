import React from 'react';
import type { QlooOptions } from '../services/qlooService';

type Category = QlooOptions['category'];
type Cuisine = QlooOptions['cuisine'];

interface GuidedTasteStepsProps {
  language: string;
  disabled: boolean;
  step: number;
  onStep: (n: number) => void;
  target: Category;
  onTarget: (c: Category) => void;
  selected: string[];
  onToggle: (name: string) => void;
  cuisine: Cuisine;
  onCuisine: (c: Cuisine) => void;
  price: string;
  onPrice: (p: string) => void;
  onComplete: (price: string) => void;
  onBackToMethods: () => void;
}

const FAVORITES: Record<Category, string[]> = {
  food: ['In-N-Out Burger', 'BCD Tofu House', 'Ichiran', 'Sweetgreen'],
  shopping: ['Muji', 'Uniqlo', 'Patagonia', "Levi's"],
  visits: ['The Getty', 'Griffith Observatory', 'LACMA', 'Natural History Museum'],
};

const CUISINE_LABELS: Partial<Record<Cuisine, { en: string; ko: string }>> = {
  any: { en: 'Any / Surprise me', ko: '전체' },
  korean: { en: 'Korean', ko: '한식' },
  japanese: { en: 'Japanese', ko: '일식' },
  vegetarian: { en: 'Vegetarian', ko: '채식' },
};

export function GuidedTasteSteps(props: GuidedTasteStepsProps) {
  const { language, disabled, step, onStep, target, onTarget, selected, onToggle, cuisine, onCuisine, price, onPrice, onComplete, onBackToMethods } = props;
  const isKO = language === 'ko';
  const t = (en: string, ko: string) => (isKO ? ko : en);
  const categoryName = (c:Category) => ({food:t('Food','먹을 곳'),shopping:t('Shopping','쇼핑'),visits:t('Sights','볼거리')}[c]);
  const question = [t('What would you like to find?','무엇을 찾고 있나요?'),t('Which places match your taste?','좋아하는 곳을 골라주세요'),t('What food do you enjoy?','어떤 음식을 좋아하나요?'),t('What is your price range?','가격대는 어느 정도가 좋나요?')][step];
  const total = target === 'food' ? 4 : 2;

  const handleBack = () => {
    if (step === 0) onBackToMethods();
    else onStep(step - 1);
  };

  const pickCategory = (c: Category) => {
    onTarget(c);
    onStep(1);
  };

  const toggleFav = (name: string) => {
    if (!selected.includes(name) && selected.length >= 3) return;
    onToggle(name);
  };

  const pickCuisine = (c: Cuisine) => {
    onCuisine(c);
    onStep(3);
  };

  const pickPrice = (p: string) => {
    onPrice(p);
    onComplete(p);
  };

  const cardBase = `w-full min-h-[44px] min-w-0 p-4 rounded-xl border text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 disabled:opacity-50`;
  const activeCls = `bg-emerald-950/40 border-emerald-500 text-emerald-100`;
  const idleCls = `bg-slate-800/60 border-slate-700 text-slate-200 hover:border-slate-500`;
  const grid = `grid grid-cols-2 gap-3`;

  let body: React.ReactNode = null;
  if (step === 0) {
    body = (
      <div className={grid}>
        {(['food', 'shopping', 'visits'] as Category[]).map((c) => (
          <button key={c} disabled={disabled} onClick={() => pickCategory(c)} aria-label={categoryName(c)} aria-pressed={target===c} className={`${cardBase} ${target === c ? activeCls : idleCls}`}>
            <span className="text-lg font-semibold capitalize">{categoryName(c)}</span>
          </button>
        ))}
      </div>
    );
  } else if (step === 1) {
    body = (
      <>
        <p className="text-sm text-slate-400 mb-3">{t('Pick up to 3 favorites. Selecting multiple requires Next.', '최대 3개를 고른 뒤 다음을 눌러주세요.' )}</p>
        <div className={grid}>
          {FAVORITES[target].map((f) => {
            const on = selected.includes(f);
            return (
              <button key={f} disabled={disabled || (!on && selected.length >= 3)} onClick={() => toggleFav(f)} aria-pressed={on} aria-label={f} className={`${cardBase} ${on ? activeCls : idleCls}`}>
                <span className="block break-words text-base font-medium">{f}</span>
              </button>
            );
          })}
        </div>
      </>
    );
  } else if (step === 2) {
    body = (
      <div className={grid}>
        {(Object.keys(CUISINE_LABELS) as Cuisine[]).map((c) => (
          <button key={c} disabled={disabled} onClick={() => pickCuisine(c)} aria-pressed={cuisine === c} aria-label={CUISINE_LABELS[c]![isKO ? 'ko' : 'en']} className={`${cardBase} ${cuisine === c ? activeCls : idleCls}`}>
            <span className="block text-base font-medium">{CUISINE_LABELS[c]![isKO ? 'ko' : 'en']}</span>
          </button>
        ))}
      </div>
    );
  } else if (step === 3) {
    body = (
      <div className={grid}>
        {['', '$', '$$', '$$$', '$$$$'].map((p) => (
          <button key={p || 'any'} disabled={disabled} onClick={() => pickPrice(p)} aria-pressed={price === p} aria-label={p || t('No preference', '상관없음')} className={`${cardBase} ${price === p ? activeCls : idleCls}`}>
            <span className="block text-lg font-semibold">{p || t('No preference', '상관없음')}</span>
          </button>
        ))}
      </div>
    );
  }

  const showNext = step === 1;
  const nextDisabled = disabled || (showNext && selected.length === 0);

  return (
    <section className="rounded-2xl bg-slate-900 border border-slate-800 p-4 sm:p-5 shadow-lg">
      <header className="flex items-center justify-between gap-3 mb-4">
        <button disabled={disabled} onClick={handleBack} aria-label={t('Go back', '뒤로')} className="h-[44px] w-[44px] shrink-0 inline-flex items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 disabled:opacity-50">
          ←
        </button>
        <span aria-live="polite" className="text-xs uppercase tracking-wide text-slate-400">
          {t(`Step`, `단계`)} {Math.min(step + 1, total)}/{total}
        </span>
      </header>
      <h3 className="text-base font-semibold text-white mb-4">{question}</h3>
      <div>{body}</div>
      {showNext && (
        <footer className="mt-4 flex justify-end">
          <button disabled={nextDisabled} onClick={() => target === 'food' ? onStep(2) : onComplete('')} aria-label={t('Next', '다음')} className={`min-h-[44px] px-6 py-3 rounded-xl font-semibold bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50`}>
            <span>{t('Next', '다음')}</span> →
          </button>
        </footer>
      )}
    </section>
  );
}
