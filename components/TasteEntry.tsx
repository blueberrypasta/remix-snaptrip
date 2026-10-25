import React, { useState, type ComponentType } from 'react';
import type { Language, LocationData } from '../types';

interface Props {
  language: Language;
  location: null | LocationData;
  onRequestLocation: () => Promise<LocationData | null>;
  onLogin: () => void;
  userId?: string;
  initialOpen?: boolean;
}

const LABELS: Record<string, Partial<Record<Language, string>>> = {
  pill: { ko: '✨ 취향저격', en: '✨ Taste Match', ja: '✨ 好みに合う場所', zh: '✨ 我的口味', es: '✨ A mi gusto', fr: '✨ À mon goût', de: '✨ Mein Geschmack', it: '✨ I miei gusti' },
  retry: { ko: '재시도', en: 'Retry' },
  errorGeneric: { ko: '오류가 발생했습니다.', en: 'An error occurred.' },
};

const SearchIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

export const TasteEntry: React.FC<Props> = (props) => {
  const { language } = props;
  const [LoadedComp, setLoadedComp] = useState<ComponentType<Props> | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);

  const loadAndOpen = async () => {
    setIsLoading(true);
    setHasError(false);
    try {
      const mod = await import('./TasteRecommendations');
      setLoadedComp(() => mod.TasteRecommendations);
    } catch {
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  };

  if (LoadedComp) {
    return <LoadedComp {...props} initialOpen={true} />;
  }

  const entryPillLabel = LABELS.pill[language] || LABELS.pill.en || '';
  const retryLabel = LABELS.retry[language] || LABELS.retry.en || 'Retry';
  const errorLabel = LABELS.errorGeneric[language] || LABELS.errorGeneric.en || 'An error occurred.';

  if (hasError) {
    return (
      <div className="w-full h-[56px] px-5 rounded-full bg-white/[0.07] border border-red-500/30 flex items-center justify-between text-white/90">
        <span className="text-sm truncate">{errorLabel}</span>
        <button
          type="button"
          onClick={loadAndOpen}
          className="shrink-0 min-h-11 px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-xs font-medium text-white transition-colors"
        >
          {retryLabel}
        </button>
      </div>
    );
  }

  return (
    <button
      data-taste-entry
      type="button"
      aria-label={entryPillLabel}
      disabled={isLoading}
      aria-busy={isLoading}
      onClick={(e) => {
        e.stopPropagation();
        loadAndOpen();
      }}
      className="w-full flex items-center gap-3 h-[56px] pl-5 pr-2 rounded-full bg-white/[0.07] border border-white/[0.10] text-left hover:bg-white/[0.10] active:scale-[0.99] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 touch-manipulation select-none disabled:opacity-70"
      style={{ WebkitTapHighlightColor: 'transparent' }}
    >
      <span className="text-white/70 shrink-0">
        <SearchIcon />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-white leading-tight truncate">
          {language === 'ko' ? '오늘 어디 갈까요?' : 'Where to today?'}
        </span>
        <span className="block text-[12px] text-white/50 leading-tight mt-0.5 truncate">
          {isLoading
            ? (language === 'ko' ? '불러오는 중...' : 'Loading...')
            : (language === 'ko' ? '맛집 · 쇼핑 · 명소 · 미쉐린' : 'Food · shops · sights · Michelin')}
        </span>
      </span>
      <span
        aria-hidden="true"
        className="shrink-0 w-10 h-10 rounded-full bg-[#33d5a4] text-[#0b1311] flex items-center justify-center"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </span>
    </button>
  );
};
