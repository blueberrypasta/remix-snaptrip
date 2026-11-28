import NearbyPlaceList from './NearbyPlaceList';
import React, { useState, useEffect } from 'react';
import { useTranslations } from '../translations';
import type { Language, User, HistoryItem } from '../types';
import { Icon } from './Icon';
import {
  SAMPLE_IMAGE_URL,
  SAMPLE_COMMONS_URL,
  SAMPLE_LICENSE_URL,
} from '../utils/sampleLandmark';

interface WelcomeScreenProps {
  tasteRecommendations?: React.ReactNode;
  onUploadClick: () => void;
  onCameraClick: () => void;
  onTrySample?: () => void;
  language: Language;
  user: User | null;
  onLogin: () => void;
  recentHistory: HistoryItem[];
  onSelectHistory: (item: HistoryItem) => void;
  credits: number;
  onReload: () => void;
  isSyncing?: boolean;
  nearbyGems?: {
    name: string;
    type: string;
    rating: string | number;
    reviewCount: string | number;
    description: string;
    url: string;
  }[];
  nearbyAreaName?: string;
  nearbyWeather?: { emoji: string; tempC: number } | null;
  weatherStatus?: 'idle' | 'loading' | 'ready' | 'error';
  onRetryWeather?: () => void;
  isNearbyLoading?: boolean;
  locationStatus?: 'idle' | 'loading' | 'ready' | 'denied' | 'unavailable' | 'error' | 'empty';
  onRefreshLocation?: () => void;
  onStartGuide?: (landmarkName: string) => void;
  onShowMoreNearby?: () => void;
  isMoreNearbyLoading?: boolean;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  onUploadClick,
  onCameraClick,
  onTrySample,
  language,
  nearbyGems = [],
  nearbyAreaName = '',
  nearbyWeather = null,
  isNearbyLoading = false,
  locationStatus = 'idle',
  onRefreshLocation,
  onStartGuide,
  onShowMoreNearby,
  isMoreNearbyLoading = false,
  tasteRecommendations,
  weatherStatus = 'idle',
  onRetryWeather,
}) => {
  const t = useTranslations(language);
  const [isExploreExpanded, setIsExploreExpanded] = useState(false);
  const [tempUnit, setTempUnit] = useState<'C' | 'F'>('C');
  const [activeGuide, setActiveGuide] = useState<{ landmarkName: string } | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('snaptrip_active_guide');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Date.now() - parsed.lastUpdated < 24 * 60 * 60 * 1000 && parsed.landmarkName) {
          setActiveGuide({ landmarkName: parsed.landmarkName });
        }
      }
    } catch {
      // Ignore storage parse failures
    }
  }, []);

  const getDisplayTemp = () => {
    if (!nearbyWeather) return '';
    const { tempC } = nearbyWeather;
    if (tempUnit === 'C') return `${Math.round(tempC)}°C`;
    return `${Math.round((tempC * 9) / 5 + 32)}°F`;
  };

  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-5 sm:pt-8 lg:pt-14 pb-12 animate-fade-in">
      {/* Wide Editorial Hero Grid */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 lg:gap-12 items-center">
        {/* Left: Copy & Controls */}
        <div className="lg:col-span-6 flex flex-col gap-4 sm:gap-5">
          <h1 className="text-[32px] sm:text-[46px] lg:text-[56px] font-bold tracking-[-0.03em] leading-[1.06] text-st-ink break-keep">
            {t('heroHeadline')}
          </h1>

          <p className="text-[15px] sm:text-[18px] leading-[1.55] text-[#4A5356] dark:text-st-secondary max-w-lg break-keep">
            {t('heroSubtitle')}
          </p>

          <div className="flex flex-col gap-2.5 pt-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={onUploadClick}
                className="min-h-[48px] px-6 rounded-full bg-[#2EE5A8] hover:bg-[#22D398] active:scale-[0.98] text-[#0D1412] text-[15px] font-semibold inline-flex items-center justify-center gap-2 shadow-sm transition-all"
              >
                <Icon name="upload_file" className="text-[20px]" />
                <span>{t('choosePhoto')}</span>
              </button>

              <button
                type="button"
                onClick={onCameraClick}
                className="min-h-[48px] px-5 rounded-full border border-st-ink/15 bg-transparent hover:bg-st-ink/[0.05] active:scale-[0.98] text-st-ink text-[15px] font-medium inline-flex items-center justify-center gap-2 transition-all"
              >
                <Icon name="photo_camera" className="text-[20px]" />
                <span>{t('takePhoto')}</span>
              </button>
            </div>

            {onTrySample && (
              <button
                type="button"
                onClick={onTrySample}
                className="self-start min-h-[44px] px-1 inline-flex items-center gap-1.5 text-sm font-medium text-st-mint hover:text-[#075B40] underline underline-offset-4 transition-colors"
              >
                <span>{t('trySample')}</span>
                <Icon name="arrow_forward" className="text-[16px]" />
              </button>
            )}
          </div>
        </div>

        {/* Right: Edge-to-edge Travel Photo in an Offset Rounded Frame */}
        <div className="lg:col-span-6 lg:pl-2">
          <figure className="m-0">
            <div className="relative overflow-hidden rounded-[24px] lg:rounded-[32px] bg-st-surface-card border border-st-ink/10 shadow-[0_24px_60px_-28px_rgba(17,21,23,0.28)] aspect-[16/10] sm:aspect-[16/9] lg:aspect-[4/3] lg:translate-y-2">
              <img
                src={SAMPLE_IMAGE_URL}
                width={1200}
                height={900}
                fetchPriority="high"
                alt="Eiffel Tower in Paris, Champ de Mars"
                className="w-full h-full object-cover"
              />
            </div>
            <figcaption className="mt-3 lg:mt-5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-st-secondary">
              <a
                href={SAMPLE_COMMONS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-st-ink"
              >
                {t('photoAttributionLabel')}
              </a>
              <span aria-hidden="true">·</span>
              <a
                href={SAMPLE_LICENSE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-st-ink"
              >
                CC BY-SA 4.0
              </a>
            </figcaption>
          </figure>
        </div>
      </section>

      {/* Reachable Resume Guide when active */}
      {activeGuide && (
        <section className="mt-8">
          <button
            type="button"
            onClick={() => onStartGuide?.(activeGuide.landmarkName)}
            className="w-full min-h-[52px] px-4 py-3 rounded-2xl bg-st-surface-alt hover:bg-st-surface-muted border border-st-ink/10 flex items-center justify-between gap-3 transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-9 h-9 rounded-full bg-[#2EE5A8]/25 text-st-mint flex items-center justify-center shrink-0">
                <Icon name="record_voice_over" className="text-[20px]" />
              </span>
              <div className="text-left min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-st-mint">
                  {t('resumeGuide')}
                </p>
                <p className="text-sm font-semibold text-st-ink truncate">
                  {activeGuide.landmarkName}
                </p>
              </div>
            </div>
            <Icon name="arrow_forward" className="text-[18px] text-st-secondary shrink-0" />
          </button>
        </section>
      )}

      {/* Secondary More / Explore Details Accordion */}
      <section className="mt-8 sm:mt-10 pt-6 border-t border-st-ink/10">
        <button
          type="button"
          aria-expanded={isExploreExpanded}
          aria-controls="explore-details-panel"
          onClick={() => setIsExploreExpanded((prev) => !prev)}
          className="w-full min-h-[48px] px-5 py-3 rounded-2xl bg-st-surface-alt hover:bg-st-surface-muted border border-st-ink/10 flex items-center justify-between gap-3 text-left text-sm font-semibold text-st-ink transition-colors"
        >
          <span>{t('exploreMore')}</span>
          <svg
            aria-hidden="true"
            className={`w-5 h-5 text-st-secondary transition-transform ${
              isExploreExpanded ? 'rotate-180' : ''
            }`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>

        <div
          id="explore-details-panel"
          hidden={!isExploreExpanded}
          className="mt-3 rounded-2xl bg-[#14191B] text-white p-4 sm:p-5 border border-st-ink/15 space-y-4"
        >
          {tasteRecommendations && (
            <div onClick={(e) => e.stopPropagation()}>{tasteRecommendations}</div>
          )}

          <div className="rounded-2xl bg-white/[0.04] border border-white/[0.08] p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-white">
                  {language === 'ko' ? '주변 유명 장소' : t('nearbyGems')}
                </h2>
                <p className="text-xs text-white/60 truncate mt-0.5" title={nearbyAreaName}>
                  {nearbyAreaName
                    ? nearbyAreaName
                    : language === 'ko'
                    ? locationStatus === 'denied'
                      ? '위치 권한 필요'
                      : isNearbyLoading
                      ? '주변 찾는 중…'
                      : '내 주변'
                    : locationStatus === 'denied'
                    ? 'Location needed'
                    : isNearbyLoading
                    ? 'Finding nearby…'
                    : 'Nearby'}
                </p>
              </div>
              <button
                type="button"
                aria-label={t('retryLocation')}
                onClick={() => onRefreshLocation?.()}
                className="min-h-[44px] min-w-[44px] rounded-full hover:bg-white/10 text-white/75 flex items-center justify-center shrink-0"
              >
                <Icon
                  name="sync"
                  className={`text-[20px] ${isNearbyLoading ? 'motion-safe:animate-spin' : ''}`}
                />
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {locationStatus === 'idle' && !nearbyAreaName && (
                <button
                  type="button"
                  onClick={() => onRefreshLocation?.()}
                  className="min-h-[44px] px-4 rounded-full bg-[#2EE5A8] text-[#0D1412] text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  <Icon name="my_location" className="text-[16px]" />
                  <span>{language === 'ko' ? '위치 확인하기' : 'Enable Location'}</span>
                </button>
              )}

              {nearbyWeather && Number.isFinite(nearbyWeather.tempC) ? (
                <button
                  type="button"
                  data-weather-display
                  title={
                    language === 'ko'
                      ? '현재 날씨 · °C/°F 전환'
                      : 'Current weather · switch °C/°F'
                  }
                  onClick={() => setTempUnit((prev) => (prev === 'C' ? 'F' : 'C'))}
                  className="min-h-[44px] px-3 rounded-full bg-white/10 text-xs font-medium text-white inline-flex items-center gap-1.5 hover:bg-white/15"
                >
                  <span aria-hidden="true">{nearbyWeather.emoji}</span>
                  <span>{getDisplayTemp()}</span>
                </button>
              ) : (
                <button
                  type="button"
                  data-weather-status
                  disabled={weatherStatus === 'loading'}
                  onClick={() => onRetryWeather?.()}
                  aria-label={language === 'ko' ? '날씨 다시 불러오기' : 'Retry weather'}
                  className="min-h-[44px] px-3 rounded-full bg-white/5 text-xs text-white/75 hover:bg-white/10"
                >
                  {language === 'ko'
                    ? weatherStatus === 'loading'
                      ? '날씨 확인 중…'
                      : weatherStatus === 'error'
                      ? '날씨 재시도'
                      : '날씨 · 위치 필요'
                    : weatherStatus === 'loading'
                    ? 'Weather…'
                    : weatherStatus === 'error'
                    ? 'Retry weather'
                    : 'Weather · location'}
                </button>
              )}

              {nearbyWeather && (
                <a
                  href="https://open-meteo.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-white/50 hover:text-white/80 underline underline-offset-2"
                >
                  Open-Meteo
                </a>
              )}
            </div>

            {isNearbyLoading && nearbyGems.length === 0 ? (
              <div className="py-6 text-center text-xs text-white/70">{t('findingGems')}</div>
            ) : nearbyGems.length > 0 ? (
              <div className="space-y-3 pt-1">
                <NearbyPlaceList
                  places={nearbyGems}
                  language={language}
                  onStartGuide={onStartGuide}
                />
                {nearbyGems.length < 20 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onShowMoreNearby?.();
                    }}
                    disabled={isMoreNearbyLoading}
                    className="w-full min-h-[44px] rounded-full bg-white/10 hover:bg-white/15 text-xs font-semibold text-[#2EE5A8] flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isMoreNearbyLoading ? (
                      <span>…</span>
                    ) : (
                      <>
                        <Icon name="add_circle" className="text-[18px]" />
                        <span>{t('findMore')}</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            ) : locationStatus !== 'idle' ? (
              <div className="py-4 text-center space-y-3">
                <p className="text-xs font-semibold text-white">
                  {locationStatus === 'denied'
                    ? t('locationDenied')
                    : locationStatus === 'empty'
                    ? t('noGemsFound')
                    : t('locationUnavailable')}
                </p>
                <p className="text-xs text-white/65">
                  {locationStatus === 'empty' ? t('emptyNearbyGuide') : t('locationPermissionGuide')}
                </p>
                <button
                  type="button"
                  onClick={onRefreshLocation}
                  className="min-h-[44px] px-4 rounded-full border border-white/20 text-xs font-semibold text-white hover:bg-white/10"
                >
                  {t('retryLocation')}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
};
