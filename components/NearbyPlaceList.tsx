import React, { useState } from 'react';
import type { Language } from '../types';

interface Place {
  name: string;
  type: string;
  rating: string | number;
  reviewCount: string | number;
  description: string;
  url: string;
}

interface NearbyPlaceListProps {
  places: Place[];
  language: Language;
  onStartGuide?: (name: string) => void;
}

const getIconColor = (type: string): string => {
  const lowerType = (type||'').toLowerCase();
  if (/landmark|tourist|attraction|monument|museum|park|historic|temple|palace|명소|박물관|공원|궁전|유적/.test(lowerType)) return '#d4af37'; // Gold
  if (/cafe|coffee|bakery|카페|베이커리/.test(lowerType)) return '#ffbf00'; // Amber
  if (/food|restaurant|dining|식당|레스토랑|음식/.test(lowerType)) return '#e11d48'; // Rose
  return '#10b981'; // Emerald for other
};

const getCategoryLabel = (type: string, lang: Language): string => {
  const lowerType = (type||'').toLowerCase();
  const isKo = lang === 'ko';

  if (/landmark|tourist|attraction|monument|museum|park|historic|temple|palace|명소|박물관|공원|궁전|유적/.test(lowerType)) return isKo ? '명소' : 'Landmark';
  if (/cafe|coffee|bakery|카페|베이커리/.test(lowerType)) return isKo ? '카페' : 'Cafe';
  if (/food|restaurant|dining|식당|레스토랑|음식/.test(lowerType)) return isKo ? '음식점' : 'Food';
  return isKo ? '장소' : 'Place';
};

const parseRating = (rating: string | number): number | null => {
  if (typeof rating === 'number') {
    return Number.isFinite(rating) && rating >= 0 && rating <= 5 ? rating : null;
  }
  if (typeof rating === 'string') {
    if(!/^\d(?:\.\d+)?$/.test(rating.trim()))return null;
    const num = Number(rating);
    return !isNaN(num) && num >= 0 && num <= 5 ? num : null;
  }
  return null;
};

const formatReviewCount = (count: string | number): string | null => {
  if (!count) return null;

  if (typeof count === 'number') {
    return count > 0 ? count.toLocaleString() : null;
  }

  if (typeof count === 'string') {
    const cleanStr = count.replace(/,/g, '');
    if (/^\d+$/.test(cleanStr)) {
      const num = parseInt(cleanStr, 10);
      return num > 0 ? num.toLocaleString() : null;
    }
    if (/[a-zA-Z]/.test(count)) {
        return count.trim().length > 0 ? count : null;
    }
    return null;
  }

  return null;
};

const isValidGoogleMapsUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    if(parsed.protocol!=='https:')return false;
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname;

    if (host !== 'maps.google.com' && host !== 'www.google.com' && host !== 'google.com') {
      return false;
    }

    if (host.includes('google.com')) {
       if (host==='maps.google.com' || path==='/maps' || path.startsWith('/maps/')) {
         return true;
       }
    }
    return false;
  } catch {
    return false;
  }
};

const ChevronDownIcon = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <polyline points="6 9 12 15 18 9"></polyline>
  </svg>
);

const MapPinIcon = ({ color }: { color: string }) => (
  <div
    className="w-8 h-8 flex items-center justify-center rounded-full shrink-0"
    style={{ backgroundColor: `${color}15`, border: `1px solid ${color}30` }}
  >
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
      <circle cx="12" cy="10" r="3"></circle>
    </svg>
  </div>
);

export default function NearbyPlaceList({ places, language, onStartGuide }: NearbyPlaceListProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggleDetails = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  if (!places || places.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2.5 w-full text-white">
      {places.map((place, index) => {
        const isOpen = openIndex === index;
        const accentColor = getIconColor(place.type);
        const categoryLabel = getCategoryLabel(place.type, language);
        const numericRating = parseRating(place.rating);
        const formattedReviews = formatReviewCount(place.reviewCount);
        const hasValidMapLink = isValidGoogleMapsUrl(place.url);
        const isLandmark = /landmark|tourist|attraction|monument|museum|park|historic|temple|palace|명소|박물관|공원|궁전|유적/i.test(place.type);

        const showGuideButton = isLandmark && !!onStartGuide;

        return (
          <details
            key={`${place.name}-${index}`}
            open={isOpen}
            className="group relative bg-white/[0.03] border border-white/[0.06] rounded-[18px] overflow-hidden transition-all duration-300 hover:bg-white/[0.05]"
          >

            <summary
              onClick={(e) => {
                e.preventDefault();
                toggleDetails(index);
              }}
              className="flex items-start gap-3 p-4 cursor-pointer list-none focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 rounded-t-[18px] min-h-[76px]"
              aria-expanded={isOpen}
            >
              <MapPinIcon color={accentColor} />

              <div className="flex-1 min-w-0 pt-0.5">
                <h3
                  className="text-base font-semibold leading-snug line-clamp-2 break-words text-white mb-1"
                  title={place.name}
                >
                  {place.name}
                </h3>

                <div className="flex items-center gap-2 text-[13px] text-white/[0.65] flex-wrap">
                  <span
                    className="uppercase tracking-wide font-medium"
                    style={{ color: accentColor }}
                  >
                    {categoryLabel}
                  </span>

                  {numericRating !== null && (
                    <>
                      <span className="opacity-30">•</span>
                      <span className="flex items-center gap-1">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="#d4af37" stroke="none">
                          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                        </svg>
                        <span className="font-medium text-white/90">{numericRating.toFixed(1)}</span>
                      </span>
                    </>
                  )}

                  {formattedReviews && (
                     <>
                       <span className="opacity-30">•</span>
                       <span>({formattedReviews})</span>
                     </>
                  )}
                </div>
              </div>

              <ChevronDownIcon
                className={`w-3.5 h-3.5 mt-1 text-white/40 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
              />
            </summary>

            <div
              className="px-4 pb-4 pt-0"
            >
              <div className="border-t border-white/[0.06] pt-3 mt-1">
                {place.description && (
                  <p className="text-sm leading-relaxed text-white/[0.65] mb-4 whitespace-pre-line">
                    {place.description}
                  </p>
                )}

                <div className="flex flex-col gap-2">
                  {hasValidMapLink && (
                    <a
                      href={place.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center w-full h-11 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-sm font-medium text-emerald-400 transition-colors active:scale-[0.98]"
                    >
                      {language === 'ko' ? '지도에서 보기' : 'View on map'}
                    </a>
                  )}

                  {showGuideButton && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onStartGuide) {
                          onStartGuide(place.name);
                        }
                      }}
                      className="flex items-center justify-center w-full h-11 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-sm font-medium text-emerald-300 transition-colors active:scale-[0.98]"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mr-2">
                         <path d="M5 17v-6a7 7 0 0 1 14 0v6M5 13H3v6h4v-6H5Zm14 0h2v6h-4v-6h2Z"/>
                      </svg>
                      {language === 'ko' ? '이야기 듣기' : 'Audio guide'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </details>
        );
      })}
    </div>
  );
}
