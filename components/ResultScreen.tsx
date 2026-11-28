import React, { useEffect, useRef, useState } from 'react';
import { useTranslations } from '../translations';
import type { HistoryItem, Language } from '../types';
import { Icon } from './Icon';
import { buildDirectionsUrl, buildStreetViewUrl } from '../utils/mapsLinks';
import {
  SAMPLE_COMMONS_URL,
  SAMPLE_LICENSE_URL,
  getSamplePlaceLabel,
} from '../utils/sampleLandmark';

interface ResultScreenProps {
  result: HistoryItem;
  onReset: () => void;
  onNewPhoto: () => void;
  language: Language;
  credits: number;
  onDelete: (id: string) => void;
  isSample?: boolean;
}

export const ResultScreen: React.FC<ResultScreenProps> = ({
  result,
  onReset,
  onNewPhoto,
  language,
  onDelete,
  isSample = false,
}) => {
  const t = useTranslations(language);
  const resultRef = useRef<HTMLDivElement>(null);
  const [notification, setNotification] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const generateBlob = async (): Promise<Blob | null> => {
    if (!resultRef.current) return null;
    try {
      const html2canvasModule = await import('html2canvas');
      const html2canvas = (html2canvasModule as any).default || html2canvasModule;
      const canvas = await html2canvas(resultRef.current, {
        useCORS: true,
        scale: 2,
        backgroundColor: getComputedStyle(document.body).backgroundColor,
        logging: false,
        width: resultRef.current.offsetWidth,
        height: resultRef.current.offsetHeight,
      });
      return new Promise((resolve) =>
        canvas.toBlob((blob: Blob | null) => resolve(blob), 'image/png', 1.0)
      );
    } catch {
      return null;
    }
  };

  const preparedFile = useRef<File | null>(null);
  useEffect(() => {
    preparedFile.current = null;
  }, [result.title, result.status, isSample]);

  const downloadFile = (file: File) => {
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotification(t('savedSuccess'));
    setTimeout(() => setNotification(''), 3000);
  };

  const handleAction = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    let file = preparedFile.current;
    const safeTitle = (result.title || 'SlapTrip_Discovery').replace(/[\\/:*?"<>|]+/g, '_');
    try {
      if (!file) {
        const blob = await generateBlob();
        if (!blob) throw new Error('render_failed');
        file = new File([blob], `SlapTrip_${safeTitle}.png`, { type: 'image/png' });
        preparedFile.current = file;
      }
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'SlapTrip Discovery',
          text: `[SlapTrip] ${result.title || t('discoveryFallback')}`,
        });
      } else {
        downloadFile(file);
      }
    } catch (e) {
      const name = e instanceof Error ? e.name : '';
      if (name === 'AbortError') {
        // User closed the share sheet.
      } else if (name === 'NotAllowedError' && file) {
        setNotification(
          language === 'ko'
            ? '이미지가 준비됐어요. 한 번 더 누르면 공유돼요.'
            : 'Image ready. Tap share again.'
        );
        setTimeout(() => setNotification(''), 4000);
      } else if (file) {
        downloadFile(file);
      } else {
        setNotification(
          language === 'ko'
            ? '공유 이미지를 만들지 못했어요. 다시 시도해주세요.'
            : 'Could not create the share image. Please try again.'
        );
        setTimeout(() => setNotification(''), 3000);
      }
    }
    setIsProcessing(false);
  };

  const isStreaming = result.status === 'processing';

  const clean = (txt: string | undefined) => {
    if (!txt) return '';
    return txt
      .replace(/\[TITLE\]:?/gi, '')
      .replace(/\[FACT\]:?/gi, '')
      .replace(/\[STORY\]:?/gi, '')
      .replace(/(\*\*|\*|#|_)/g, '')
      .trim();
  };

  const cleanedResultTitle = clean(result.title);
  const cleanTitle =
    cleanedResultTitle || (isStreaming ? t('analyzing') : t('discoveryFallback'));
  const cleanFact = clean(result.fact);
  const status = result.identificationStatus || 'confirmed';
  const isLowConfidence =
    !isStreaming &&
    (status === 'uncertain' || status === 'needs_retake' || (result.confidence ?? 1) < 0.55);
  const isProbable =
    !isStreaming && !isLowConfidence && (status === 'probable' || (result.confidence ?? 1) < 0.8);
  const isConfirmed = !isStreaming && !isLowConfidence && !isProbable;

  // Sample carries curated landmark coordinates; real EXIF/device GPS marks camera/user only.
  const directionsUrl =
    isSample && isConfirmed && result.locationData
      ? buildDirectionsUrl(result.locationData.latitude, result.locationData.longitude)
      : null;
  const streetViewUrl =
    isSample && isConfirmed && result.locationData
      ? buildStreetViewUrl(result.locationData.latitude, result.locationData.longitude)
      : null;
  const mapsSearchUrl =
    !isSample && isConfirmed && cleanedResultTitle
      ? `https://www.google.com/maps/search/?${new URLSearchParams({
          api: '1',
          query: cleanedResultTitle,
        }).toString()}`
      : null;

  const visitCards = [
    result.visit?.atAGlance && {
      label: t('atAGlance'),
      value: clean(result.visit.atAGlance),
      icon: 'near_me',
    },
    result.visit?.bestLight && {
      label: t('bestLight'),
      value: clean(result.visit.bestLight),
      icon: 'light_mode',
    },
    result.visit?.crowds && {
      label: t('crowds'),
      value: clean(result.visit.crowds),
      icon: 'groups',
    },
  ].filter(Boolean) as { label: string; value: string; icon: string }[];

  const placeContextLabel = isSample ? getSamplePlaceLabel(language) : null;
  const storyParagraphs = (result.story || '')
    .split('\n')
    .map((line) => clean(line))
    .filter(Boolean);
  const hasStorySection = !isStreaming && !isLowConfidence && (storyParagraphs.length > 0 || !!clean(result.hiddenStory));
  const hasVisitSection = !isStreaming && !isLowConfidence && (visitCards.length > 0 || !!streetViewUrl);
  const hasFiguresSection =
    !isStreaming && !isLowConfidence && !!result.depictedFigures && result.depictedFigures.length > 0;
  const hasSourcesSection = !isStreaming && !!result.sources && result.sources.length > 0;

  return (
    <div className="w-full max-w-3xl mx-auto px-4 sm:px-6 pb-16 animate-fade-in">
      {/* Top Action Bar */}
      <nav
        data-html2canvas-ignore="true"
        className="sticky top-0 z-30 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] bg-st-surface/95 backdrop-blur-md border-b border-st-ink/10 flex items-center justify-between gap-3"
      >
        {isStreaming ? (
          <div className="min-h-[44px]" aria-hidden="true" />
        ) : (
          <button
            type="button"
            onClick={onReset}
            aria-label={t('back')}
            className="min-h-[44px] min-w-[44px] px-3 inline-flex items-center justify-center gap-1.5 rounded-full hover:bg-st-ink/[0.06] text-sm font-medium text-st-ink transition-colors"
          >
            <Icon name="arrow_back" className="text-[20px]" />
            <span className="hidden sm:inline">{t('back')}</span>
          </button>
        )}

        {isSample && (
          <span className="px-3 py-1 rounded-full bg-[#2EE5A8]/25 text-st-mint text-xs font-semibold">
            {t('sampleResult')}
          </span>
        )}

        <div className="flex items-center gap-1.5 min-h-[44px]">
          {!isStreaming && (
            <>
              <button
                type="button"
                onClick={handleAction}
                aria-label={t('share')}
                disabled={isProcessing}
                className="min-h-[44px] min-w-[44px] px-3 rounded-full border border-st-ink/[0.12] bg-st-surface-alt hover:bg-st-surface-muted text-st-ink text-xs font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-40 transition-colors"
              >
                <Icon name="ios_share" className="text-[18px]" />
                <span className="hidden sm:inline">{t('share')}</span>
              </button>

              {!isSample && (
                <button
                  type="button"
                  onClick={() => onDelete(result.id)}
                  aria-label={t('delete')}
                  className="min-h-[44px] min-w-[44px] rounded-full hover:bg-rose-500/10 text-st-secondary hover:text-rose-700 dark:hover:text-rose-300 inline-flex items-center justify-center transition-colors"
                >
                  <Icon name="delete" className="text-[20px]" />
                </button>
              )}
            </>
          )}
        </div>
      </nav>

      {/* Concise Share Capture Area: Photo + Place + Title + One-line Fact (+ Sample Credit) */}
      <div
        ref={resultRef}
        className="mt-5 rounded-[24px] bg-st-surface border border-st-ink/[0.12] overflow-hidden shadow-[0_16px_40px_-24px_rgba(17,21,23,0.18)]"
      >
        {result.imageData ? (
          <div className="w-full bg-st-surface-card overflow-hidden">
            <img
              src={result.imageData}
              alt={isLowConfidence ? t('needsCloserLook') : cleanTitle}
              crossOrigin="anonymous"
              className="w-full max-h-[420px] object-cover"
            />
          </div>
        ) : (
          <div className="w-full py-10 bg-[#EFEAE0] dark:bg-st-surface-alt flex items-center justify-center text-st-secondary">
            <Icon name="image_not_supported" className="text-3xl" />
          </div>
        )}

        <div className="p-5 sm:p-7 space-y-2.5">
          {placeContextLabel && (
            <p className="text-xs font-semibold text-st-mint tracking-tight">
              {placeContextLabel}
            </p>
          )}

          <h1 className="text-2xl sm:text-[34px] font-bold tracking-[-0.025em] leading-[1.15] text-st-ink break-keep">
            {isLowConfidence ? t('needsCloserLook') : cleanTitle}
          </h1>

          {cleanFact && !isLowConfidence && (
            <p className="text-[15px] sm:text-[17px] leading-[1.55] text-[#353D40] dark:text-st-secondary break-keep">
              {cleanFact}
            </p>
          )}

          {isSample && (
            <p className="pt-2 border-t border-st-ink/10 text-xs text-st-secondary flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>{t('sampleResult')}</span>
              <span aria-hidden="true">·</span>
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
            </p>
          )}
        </div>
      </div>

      {/* Directly Useful Google Maps Action (Confirmed & Valid Only) */}
      {(directionsUrl || mapsSearchUrl) && (
        <div className="mt-4">
          <a
            href={directionsUrl || mapsSearchUrl!}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full min-h-[48px] px-5 py-3 rounded-full bg-[#2EE5A8] hover:bg-[#22D398] text-[#0D1412] text-[15px] font-semibold inline-flex items-center justify-center gap-2 shadow-sm transition-colors"
          >
            <Icon name={directionsUrl ? 'near_me' : 'location_on'} className="text-[20px]" />
            <span>{directionsUrl ? t('getDirections') : t('searchOnMaps')}</span>
          </a>
        </div>
      )}

      {/* Low Confidence: Reason + Primary Retake */}
      {!isStreaming && isLowConfidence && (
        <section className="mt-5 rounded-2xl p-5 bg-[#FFF6E6] dark:bg-amber-950 border border-[#C98A1A]/35 space-y-4">
          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#8A5A00] dark:text-amber-300">
              {t('needsCloserLook')}
            </p>
            <p className="text-sm sm:text-base leading-relaxed text-st-ink break-keep">
              {result.retakeReason || clean(result.story) || t('retakeTextHelp')}
            </p>
          </div>
          <button
            type="button"
            onClick={onNewPhoto}
            className="w-full sm:w-auto min-h-[48px] px-6 rounded-full bg-[#2EE5A8] hover:bg-[#22D398] text-[#0D1412] text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors"
          >
            <Icon name="photo_camera" className="text-[20px]" />
            <span>{t('retakeText')}</span>
          </button>
        </section>
      )}

      {/* Probable Match Notice (Walking directions suppressed) */}
      {!isStreaming && isProbable && (
        <section className="mt-4 rounded-2xl px-4 py-3.5 bg-st-surface-alt border border-st-ink/10">
          <p className="text-xs font-semibold text-st-mint">{t('likelyMatch')}</p>
        </section>
      )}

      {/* Progressive Disclosure Sections */}
      <div className="mt-6 space-y-3">
        {hasStorySection && (
          <details className="group rounded-2xl border border-st-ink/10 bg-st-surface-alt/70 overflow-hidden">
            <summary className="min-h-[48px] px-5 py-3.5 cursor-pointer list-none flex items-center justify-between gap-3 text-sm font-semibold text-st-ink">
              <span>{t('theStory')}</span>
              <svg
                aria-hidden="true"
                className="w-5 h-5 text-st-secondary transition-transform group-open:rotate-180 shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </summary>
            <div className="px-5 pb-5 pt-1 space-y-4 border-t border-st-ink/[0.08]">
              {storyParagraphs.map((paragraph, index) => (
                <p
                  key={index}
                  className="text-[15px] sm:text-base leading-[1.7] text-[#22282B] dark:text-st-ink break-keep"
                >
                  {paragraph}
                </p>
              ))}
              {clean(result.hiddenStory) && (
                <div className="rounded-xl bg-st-surface border border-st-ink/10 p-4 space-y-1.5">
                  <p className="text-xs font-semibold text-st-mint">{t('hiddenStory')}</p>
                  <p className="text-sm leading-relaxed text-[#22282B] dark:text-st-ink break-keep">
                    {clean(result.hiddenStory)}
                  </p>
                </div>
              )}
            </div>
          </details>
        )}

        {hasVisitSection && (
          <details className="group rounded-2xl border border-st-ink/10 bg-st-surface-alt/70 overflow-hidden">
            <summary className="min-h-[48px] px-5 py-3.5 cursor-pointer list-none flex items-center justify-between gap-3 text-sm font-semibold text-st-ink">
              <span>{t('visitDetails')}</span>
              <svg
                aria-hidden="true"
                className="w-5 h-5 text-st-secondary transition-transform group-open:rotate-180 shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </summary>
            <div className="px-5 pb-5 pt-2 space-y-3 border-t border-st-ink/[0.08]">
              {visitCards.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {visitCards.map((card, idx) => (
                    <div
                      key={card.label}
                      className={`rounded-xl bg-st-surface border border-st-ink/10 p-3.5 space-y-1 ${
                        idx === 0 && visitCards.length % 2 === 1 ? 'sm:col-span-2' : ''
                      }`}
                    >
                      <p className="text-xs font-semibold text-st-mint flex items-center gap-1.5">
                        <Icon name={card.icon} className="text-[15px]" />
                        <span>{card.label}</span>
                      </p>
                      <p className="text-sm text-st-ink leading-snug">{card.value}</p>
                    </div>
                  ))}
                </div>
              )}

              {streetViewUrl && (
                <a
                  href={streetViewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[44px] px-4 rounded-xl bg-st-surface border border-st-ink/15 hover:bg-st-surface-muted text-sm font-semibold text-st-ink inline-flex items-center gap-2 transition-colors"
                >
                  <Icon name="my_location" className="text-[18px] text-st-mint" />
                  <span>{t('viewStreetView')}</span>
                </a>
              )}
            </div>
          </details>
        )}

        {hasFiguresSection && (
          <details className="group rounded-2xl border border-st-ink/10 bg-st-surface-alt/70 overflow-hidden">
            <summary className="min-h-[48px] px-5 py-3.5 cursor-pointer list-none flex items-center justify-between gap-3 text-sm font-semibold text-st-ink">
              <span>{t('depictedFigures')}</span>
              <svg
                aria-hidden="true"
                className="w-5 h-5 text-st-secondary transition-transform group-open:rotate-180 shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </summary>
            <div className="px-5 pb-5 pt-2 space-y-3 border-t border-st-ink/[0.08]">
              {result.depictedFigures!.map((figure, index) => (
                <div
                  key={`${figure.name}-${index}`}
                  className="rounded-xl bg-st-surface border border-st-ink/10 p-3.5 space-y-1"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-bold text-st-ink">{clean(figure.name)}</h3>
                    {figure.certainty !== 'confirmed' && (
                      <span className="rounded-full bg-st-surface-muted px-2.5 py-0.5 text-[11px] font-medium text-st-secondary">
                        {figure.certainty === 'probable' ? t('figureProbable') : t('figureUnknown')}
                      </span>
                    )}
                  </div>
                  {figure.role && <p className="text-sm text-[#353D40] dark:text-st-secondary">{clean(figure.role)}</p>}
                  {figure.visualCue && (
                    <p className="text-xs text-st-secondary">{clean(figure.visualCue)}</p>
                  )}
                </div>
              ))}
            </div>
          </details>
        )}

        {hasSourcesSection && (
          <details className="group rounded-2xl border border-st-ink/10 bg-st-surface-alt/70 overflow-hidden">
            <summary className="min-h-[48px] px-5 py-3.5 cursor-pointer list-none flex items-center justify-between gap-3 text-sm font-semibold text-st-ink">
              <span>{t('verifiedSources')}</span>
              <svg
                aria-hidden="true"
                className="w-5 h-5 text-st-secondary transition-transform group-open:rotate-180 shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </summary>
            <div className="px-5 pb-5 pt-2 flex flex-col gap-2 border-t border-st-ink/[0.08]">
              {result.sources!.map((source, idx) => (
                <a
                  key={idx}
                  href={source.uri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[44px] px-4 py-2.5 rounded-xl bg-st-surface border border-st-ink/10 hover:bg-st-surface-muted flex items-center justify-between gap-3 text-sm font-medium text-st-ink transition-colors"
                >
                  <span className="truncate">{source.title}</span>
                  <Icon name="open_in_new" className="text-[16px] text-st-secondary shrink-0" />
                </a>
              ))}
            </div>
          </details>
        )}
      </div>

      {/* Non-sticky Bottom Actions */}
      {!isStreaming && (
        <div className="mt-8 pt-6 border-t border-st-ink/10 space-y-4">
          {!isSample && (
            <p className="text-xs text-st-secondary leading-relaxed">{t('aiCaution')}</p>
          )}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={onNewPhoto}
              className="min-h-[44px] px-5 rounded-full border border-st-ink/15 bg-st-surface-alt hover:bg-st-surface-muted text-sm font-medium text-st-ink inline-flex items-center gap-2 transition-colors"
            >
              <Icon name="upload_file" className="text-[18px]" />
              <span>{t('choosePhoto')}</span>
            </button>

            <button
              type="button"
              onClick={onReset}
              className="min-h-[44px] px-4 rounded-full text-sm font-medium text-st-secondary hover:text-st-ink hover:bg-st-ink/[0.05] transition-colors"
            >
              {t('backHome')}
            </button>
          </div>
        </div>
      )}

      {notification && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-st-ink text-st-surface px-5 py-3 rounded-full shadow-xl z-[60] text-xs font-semibold flex items-center gap-2"
        >
          <Icon name="check_circle" className="text-[#2EE5A8] text-[16px]" />
          <span>{notification}</span>
        </div>
      )}
    </div>
  );
};
