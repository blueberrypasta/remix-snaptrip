import React, { useState, useRef, useEffect, useCallback } from 'react';
import { fileToBase64 } from '../utils/fileUtils';
import {
  Language,
  MenuItemCandidate,
  PlaceSearchResult,
  PlaceReviewResponse,
  GroundedRecommendation
} from '../services/menuEvidence';
import {
  parseMenuImageOCR,
  searchPlacesForMenu,
  fetchPlaceReviewsForMenu,
  rankMenuItemsWithEvidence
} from '../services/menuService';

interface MenuScannerProps {
  language: Language;
  onBack: () => void;
  canScan: () => Promise<boolean>;
  onScanComplete: () => Promise<void>;
}

type ScanStep = 'idle' | 'ocr_processing' | 'edit_and_search' | 'searching_places' | 'fetching_reviews' | 'results';

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

function formatDate(dateStr?: string, language: Language = 'en'): string {
  if (!dateStr) return '';
  const parsed = Date.parse(dateStr);
  if (Number.isNaN(parsed)) return dateStr;
  try {
    return new Intl.DateTimeFormat(language === 'ko' ? 'ko-KR' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    }).format(new Date(parsed));
  } catch {
    return dateStr;
  }
}

function mapFriendlyError(err: any, language: Language): string {
  const code = String(err?.code || err?.message || '').toUpperCase();
  const isKo = language === 'ko';
  if (code.includes('GOOGLE_QUOTA')) return isKo ? 'Google 리뷰 조회 한도에 도달했습니다. 나중에 다시 시도해 주세요.' : 'Google review lookup is temporarily at its limit. Please try later.';
  if (code.includes('CONFIG_MISSING') || code.includes('NOT_CONFIGURED')) return isKo ? '리뷰 조회가 아직 연결되지 않았습니다. 잠시 후 다시 확인해 주세요.' : 'Review lookup is not connected yet. Please check again later.';
  if (code.includes('LIMIT') || code.includes('QUOTA') || code.includes('PERMISSION')) {
    return isKo ? '현재 이용 가능한 추천 횟수를 모두 소진했습니다.' : 'Usage limit reached for menu recommendations.';
  }
  if (code.includes('NETWORK') || code.includes('TIMEOUT') || code.includes('TIMED OUT') || code.includes('ABORTERROR')) {
    return isKo ? '연결 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.' : 'The connection timed out. Please try again.';
  }
  if (code.includes('FILE_TOO_LARGE')) {
    return isKo ? '사진 용량이 너무 큽니다 (최대 20MB).' : 'Image file is too large (max 20MB).';
  }
  if (code.includes('INVALID_TYPE')) {
    return isKo ? '지원하지 않는 이미지 형식입니다.' : 'Unsupported image file format.';
  }
  if (code.includes('NO_USABLE_MENU')) {
    return isKo ? '인식 가능한 메뉴가 없습니다. 글씨가 선명하도록 다시 촬영해 주세요.' : 'No readable menu items found. Please retake a clear photo.';
  }
  return isKo ? '메뉴 추천을 불러오는 중 문제가 발생했습니다. 다시 시도해 주세요.' : 'Something went wrong while finding menu recommendations. Please retry.';
}

export const MenuScanner: React.FC<MenuScannerProps> = ({
  language,
  onBack,
  canScan,
  onScanComplete
}) => {
  const isKo = language === 'ko';
  const [step, setStep] = useState<ScanStep>('idle');
  const [error, setError] = useState<string | null>(null);
  const [busyMessage, setBusyMessage] = useState<string>('');

  const [restaurantQuery, setRestaurantQuery] = useState<string>('');
  const [menuItems, setMenuItems] = useState<MenuItemCandidate[]>([]);
  const [places, setPlaces] = useState<PlaceSearchResult[]>([]);
  const [hasSearchedPlaces, setHasSearchedPlaces] = useState<boolean>(false);
  const [selectedPlace, setSelectedPlace] = useState<PlaceSearchResult | null>(null);
  const [placeReviewData, setPlaceReviewData] = useState<PlaceReviewResponse | null>(null);
  const [recommendations, setRecommendations] = useState<GroundedRecommendation[]>([]);

  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const activeAbortRef = useRef<AbortController | null>(null);
  const activeRevisionRef = useRef<number>(0);
  const inFlightRef = useRef<boolean>(false);

  const abortAndInvalidate = useCallback(() => {
    activeRevisionRef.current += 1;
    if (activeAbortRef.current) {
      activeAbortRef.current.abort();
      activeAbortRef.current = null;
    }
    inFlightRef.current = false;
    return activeRevisionRef.current;
  }, []);

  useEffect(() => {
    return () => {
      abortAndInvalidate();
    };
  }, [abortAndInvalidate]);

  const clearPhotoInputs = () => {
    if (cameraInputRef.current) cameraInputRef.current.value = '';
    if (uploadInputRef.current) uploadInputRef.current.value = '';
  };

  const resetForNewPhoto = useCallback(() => {
    abortAndInvalidate();
    setStep('idle');
    setError(null);
    setBusyMessage('');
    setRestaurantQuery('');
    setMenuItems([]);
    setPlaces([]);
    setHasSearchedPlaces(false);
    setSelectedPlace(null);
    setPlaceReviewData(null);
    setRecommendations([]);
    clearPhotoInputs();
  }, [abortAndInvalidate]);

  const handleBack = () => {
    abortAndInvalidate();
    onBack();
  };

  const handleFile = async (file?: File) => {
    if (!file || inFlightRef.current) return;

    if (!file.type.startsWith('image/')) {
      setError(mapFriendlyError({ code: 'INVALID_TYPE' }, language));
      clearPhotoInputs();
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError(mapFriendlyError({ code: 'FILE_TOO_LARGE' }, language));
      clearPhotoInputs();
      return;
    }

    const rev = abortAndInvalidate();
    const ac = new AbortController();
    activeAbortRef.current = ac;
    inFlightRef.current = true;

    setError(null);
    setRestaurantQuery('');
    setMenuItems([]);
    setPlaces([]);
    setHasSearchedPlaces(false);
    setSelectedPlace(null);
    setPlaceReviewData(null);
    setRecommendations([]);
    setStep('ocr_processing');
    setBusyMessage(isKo ? '메뉴판 글자를 읽고 있습니다...' : 'Reading menu photo...');

    try {
      const allowed = await canScan();
      if (rev !== activeRevisionRef.current || ac.signal.aborted) return;
      if (!allowed) {
        setError(mapFriendlyError({ code: 'LIMIT' }, language));
        setStep('idle');
        return;
      }

      const { base64, mimeType } = await fileToBase64(file);
      if (rev !== activeRevisionRef.current || ac.signal.aborted) return;

      const ocrResult = await parseMenuImageOCR(base64, mimeType, ac.signal);
      if (rev !== activeRevisionRef.current || ac.signal.aborted) return;

      const parsedItems = (ocrResult.items || []).filter((it) => it.name && it.name.trim().length > 0);
      if (parsedItems.length === 0) {
        setError(mapFriendlyError({ code: 'NO_USABLE_MENU' }, language));
        setStep('idle');
        return;
      }

      await onScanComplete();
      if (rev !== activeRevisionRef.current || ac.signal.aborted) return;

      setRestaurantQuery(ocrResult.restaurantQuery ? ocrResult.restaurantQuery.slice(0, 200) : '');
      setMenuItems(parsedItems.slice(0, 50));
      setStep('edit_and_search');

      if (ocrResult.restaurantQuery && ocrResult.restaurantQuery.trim()) {
        await triggerPlaceSearch(ocrResult.restaurantQuery.trim(), rev, ac.signal);
      }
    } catch (err: any) {
      if (rev !== activeRevisionRef.current || ac.signal.aborted) return;
      setError(mapFriendlyError(err, language));
      setStep('idle');
    } finally {
      if (rev === activeRevisionRef.current) {
        inFlightRef.current = false;
        clearPhotoInputs();
      }
    }
  };

  const triggerPlaceSearch = async (queryText: string, rev: number, signal: AbortSignal) => {
    const trimmed = queryText.trim();
    if (!trimmed) {
      setPlaces([]);
      setHasSearchedPlaces(false);
      return;
    }
    inFlightRef.current = true;
    setPlaces([]);
    setStep('searching_places');
    setBusyMessage(isKo ? '식당 지점을 찾는 중입니다...' : 'Locating restaurant branch...');
    try {
      const results = await searchPlacesForMenu(trimmed, signal);
      if (rev !== activeRevisionRef.current || signal.aborted) return;
      setPlaces(results.slice(0, 5));
      setHasSearchedPlaces(true);
      setStep('edit_and_search');
    } catch (err: any) {
      if (rev !== activeRevisionRef.current || signal.aborted) return;
      setHasSearchedPlaces(true);
      setStep('edit_and_search');
      setError(mapFriendlyError(err, language));
    } finally {
      if (rev === activeRevisionRef.current) inFlightRef.current = false;
    }
  };

  const handleQuerySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inFlightRef.current || !restaurantQuery.trim()) return;
    const rev = abortAndInvalidate();
    const ac = new AbortController();
    activeAbortRef.current = ac;
    setSelectedPlace(null);
    setPlaceReviewData(null);
    setRecommendations([]);
    setError(null);
    triggerPlaceSearch(restaurantQuery, rev, ac.signal);
  };

  const handleSelectPlace = async (place: PlaceSearchResult) => {
    if (inFlightRef.current) return;
    const rev = abortAndInvalidate();
    const ac = new AbortController();
    activeAbortRef.current = ac;
    inFlightRef.current = true;

    setSelectedPlace(place);
    setPlaceReviewData(null);
    setRecommendations([]);
    setError(null);
    setStep('fetching_reviews');
    setBusyMessage(isKo ? '방문자 리뷰에서 메뉴 추천을 분석하고 있습니다...' : 'Finding popular menu items from reviews...');

    try {
      const reviewResp = await fetchPlaceReviewsForMenu(place.id, ac.signal);
      if (rev !== activeRevisionRef.current || ac.signal.aborted) return;

      if (!reviewResp || reviewResp.place?.id !== place.id) {
        throw new Error('BRANCH_MISMATCH');
      }
      setPlaceReviewData(reviewResp);

      if (!reviewResp.reviews || reviewResp.reviews.length === 0) {
        setStep('results');
        return;
      }

      const activeItems = menuItems.filter((i) => i.name.trim().length > 0);
      if (activeItems.length === 0) {
        setError(mapFriendlyError({ code: 'NO_USABLE_MENU' }, language));
        setStep('edit_and_search');
        return;
      }

      const verified = await rankMenuItemsWithEvidence(activeItems, reviewResp.reviews, language, ac.signal);
      if (rev !== activeRevisionRef.current || ac.signal.aborted) return;

      setRecommendations(verified.slice(0, 3));
      setStep('results');
    } catch (err: any) {
      if (rev !== activeRevisionRef.current || ac.signal.aborted) return;
      setError(mapFriendlyError(err, language));
      setStep('edit_and_search');
    } finally {
      if (rev === activeRevisionRef.current) {
        inFlightRef.current = false;
      }
    }
  };

  const handleQueryChange = (val: string) => {
    abortAndInvalidate();
    setStep('edit_and_search');
    setError(null);
    setRestaurantQuery(val.slice(0, 200));
    setPlaces([]);
    setHasSearchedPlaces(false);
    setSelectedPlace(null);
    setPlaceReviewData(null);
    setRecommendations([]);
  };

  const handleItemNameChange = (id: string, name: string) => {
    abortAndInvalidate();
    setStep('edit_and_search');
    setError(null);
    setSelectedPlace(null);
    setPlaceReviewData(null);
    setRecommendations([]);
    setMenuItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, name: name.slice(0, 80), aliases: [] } : it))
    );
  };

  const handleItemPriceChange = (id: string, price: string) => {
    abortAndInvalidate();
    setStep('edit_and_search');
    setError(null);
    setSelectedPlace(null);
    setPlaceReviewData(null);
    setRecommendations([]);
    setMenuItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, price: price.slice(0, 30) } : it))
    );
  };

  const isBusy = step === 'ocr_processing' || step === 'searching_places' || step === 'fetching_reviews';
  const hasUsableItems = menuItems.some((i) => i.name.trim().length > 0);

  return (
    <div className="w-full max-w-2xl mx-auto px-4 py-6 bg-[#101922] text-slate-100 min-h-screen font-sans flex flex-col gap-5">
      {/* Top Bar */}
      <header className="flex items-center justify-between border-b border-slate-800 pb-3">
        <button
          type="button"
          onClick={handleBack}
          className="min-h-[44px] min-w-[44px] px-3 py-2 text-slate-300 hover:text-white rounded-lg hover:bg-slate-800/80 transition-colors flex items-center gap-1 font-medium text-sm"
          aria-label={isKo ? '뒤로 가기' : 'Back'}
        >
          <span>←</span> {isKo ? '뒤로' : 'Back'}
        </button>
        <h1 className="text-base sm:text-lg font-serif font-semibold tracking-wide text-[#D9B26A]">
          {isKo ? '메뉴 추천' : 'Menu Recommendations'}
        </h1>
        <button
          type="button"
          onClick={resetForNewPhoto}
          className="min-h-[44px] px-3 py-2 text-xs text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800/50 transition-colors"
        >
          {isKo ? '새로 찍기' : 'New Photo'}
        </button>
      </header>

      {/* Status & Error Aria Region */}
      <div aria-live="polite" aria-atomic="true" className="flex flex-col gap-2">
        {isBusy && (
          <div className="p-3.5 bg-slate-800/90 border border-slate-700 text-[#D9B26A] text-sm rounded-xl flex items-center gap-3">
            <span className="inline-block w-4 h-4 border-2 border-[#D9B26A] border-t-transparent rounded-full animate-spin" />
            <span>{busyMessage}</span>
          </div>
        )}
        {error && (
          <div className="p-3.5 bg-rose-950/70 border border-rose-800/70 text-rose-200 text-sm rounded-xl flex items-center justify-between gap-3">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="min-h-[44px] min-w-[44px] text-rose-300 hover:text-white flex items-center justify-center font-bold"
              aria-label={isKo ? '오류 닫기' : 'Dismiss error'}
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* Intro & Dual Photo Action */}
      <div className="bg-[#152331] border border-slate-800 p-5 rounded-2xl flex flex-col gap-3">
        <p className="text-xs text-slate-400 leading-relaxed">
          {isKo
            ? '메뉴판을 촬영하면 Google 방문자 리뷰 중 실제 호평을 분석해 대표 메뉴를 추천해 드립니다. (관련도순 리뷰 최대 5개 기준)'
            : 'Capture or upload a menu photo to uncover top dish recommendations supported by real Google visitor praise.'}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <button
            type="button" disabled={isBusy} onClick={() => cameraInputRef.current?.click()}
            className={`min-h-[44px] px-4 py-2.5 rounded-xl font-medium text-sm flex items-center justify-center gap-2 cursor-pointer transition-all ${
              isBusy
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                : 'bg-[#D9B26A] text-[#101922] hover:bg-[#e4c07c] shadow-md shadow-[#D9B26A]/10'
            }`}
          >
            <span>📷</span>
            <span>{isKo ? '카메라로 촬영' : 'Take Photo'}</span>
          </button>
          <input
            id="camera-capture-input"
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            disabled={isBusy}
            onChange={(e) => handleFile(e.target.files?.[0])}
            className="hidden"
          />

          <button
            type="button" disabled={isBusy} onClick={() => uploadInputRef.current?.click()}
            className={`min-h-[44px] px-4 py-2.5 rounded-xl font-medium text-sm flex items-center justify-center gap-2 cursor-pointer transition-all ${
              isBusy
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                : 'bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700'
            }`}
          >
            <span>📁</span>
            <span>{isKo ? '사진 보관함에서 선택' : 'Upload from Library'}</span>
          </button>
          <input
            id="photo-upload-input"
            ref={uploadInputRef}
            type="file"
            accept="image/*"
            disabled={isBusy}
            onChange={(e) => handleFile(e.target.files?.[0])}
            className="hidden"
          />
        </div>
      </div>

      {/* Edit & Search Step */}
      {step !== 'idle' && step !== 'ocr_processing' && (
        <section className="bg-[#152331] border border-slate-800 p-5 rounded-2xl flex flex-col gap-4">
          <form onSubmit={handleQuerySubmit} className="flex flex-col gap-2">
            <label htmlFor="restaurant-query" className="text-xs font-semibold text-slate-300">
              {isKo ? '식당 이름 및 도시' : 'Restaurant Name & City'}
            </label>
            <div className="flex gap-2">
              <input
                id="restaurant-query"
                type="text"
                maxLength={200}
                value={restaurantQuery}
                disabled={isBusy}
                onChange={(e) => handleQueryChange(e.target.value)}
                placeholder={isKo ? '예: 서울 삼각지 몽탄' : 'e.g., Osteria Francescana Modena'}
                className="flex-1 min-h-[44px] px-3.5 text-sm bg-[#101922] border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-[#D9B26A]"
              />
              <button
                type="submit"
                disabled={isBusy || !restaurantQuery.trim() || !hasUsableItems}
                className="min-h-[44px] px-4 bg-slate-800 text-[#D9B26A] border border-[#D9B26A]/40 hover:bg-slate-700/80 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl text-xs font-medium transition-colors"
              >
                {isKo ? '지점 찾기' : 'Find Branch'}
              </button>
            </div>
          </form>

          {/* Place Candidates */}
          {places.length > 0 && (
            <div className="flex flex-col gap-2 pt-2 border-t border-slate-800/80">
              <span className="text-xs font-medium text-slate-400">
                {isKo ? '방문하신 정확한 지점을 골라주세요:' : 'Select exact branch:'}
              </span>
              <div className="flex flex-col gap-2">
                {places.map((place) => {
                  const isSelected = selectedPlace?.id === place.id;
                  return (
                    <button
                      key={place.id}
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleSelectPlace(place)}
                      className={`min-h-[44px] text-left p-3 rounded-xl border transition-all ${
                        isSelected
                          ? 'border-[#D9B26A] bg-[#1a2c3d]'
                          : 'border-slate-800 bg-[#101922] hover:border-slate-700'
                      }`}
                    >
                      <div className="text-sm font-medium text-slate-100">{place.displayName || 'Google Place'}</div>
                      <div className="text-xs text-slate-400 break-words mt-0.5">{place.formattedAddress}</div>
                      <span className="text-[10px] text-slate-500 mt-1 block">Google Maps</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {hasSearchedPlaces && places.length === 0 && (
            <p className="text-xs text-slate-400 text-center py-2">
              {isKo ? '일치하는 지점을 찾지 못했습니다. 도시나 상호명을 조금 더 자세히 적어보세요.' : 'No matching branches found. Try adding the neighborhood or city.'}
            </p>
          )}

          {/* Editable Menu Items */}
          <div className="pt-2 border-t border-slate-800/80 flex flex-col gap-2">
            <span className="text-xs font-semibold text-slate-300">
              {isKo ? '사진에서 읽은 메뉴 (수정 가능)' : 'Recognized Menu Items (Editable)'}
            </span>
            <div className="flex flex-col gap-2 max-h-60 overflow-y-auto pr-1">
              {menuItems.map((item) => (
                <div key={item.id} className="flex gap-2">
                  <input
                    type="text"
                    maxLength={80}
                    value={item.name}
                    disabled={isBusy}
                    aria-label={`Menu item ${item.name || item.id}`}
                    onChange={(e) => handleItemNameChange(item.id, e.target.value)}
                    placeholder={isKo ? '메뉴 이름' : 'Item name'}
                    className="flex-[3] min-w-0 min-h-[44px] px-3 text-xs bg-[#101922] border border-slate-800 rounded-lg text-slate-100 placeholder-slate-600 focus:outline-none focus:border-slate-600"
                  />
                  <input
                    type="text"
                    maxLength={30}
                    value={item.price || ''}
                    disabled={isBusy}
                    aria-label={`Menu price for ${item.name || item.id}`}
                    onChange={(e) => handleItemPriceChange(item.id, e.target.value)}
                    placeholder={isKo ? '가격' : 'Price'}
                    className="flex-1 min-w-0 min-h-[44px] px-2 text-xs bg-[#101922] border border-slate-800 rounded-lg text-slate-300 placeholder-slate-600 focus:outline-none focus:border-slate-600"
                  />
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Results View */}
      {step === 'results' && selectedPlace && (
        <section className="bg-[#152331] border border-slate-800 p-5 rounded-2xl flex flex-col gap-4">
          <div className="flex flex-col gap-1 border-b border-slate-800 pb-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-[#D9B26A]">
                {selectedPlace.displayName || (isKo ? '선택한 지점' : 'Selected Branch')}
              </h2>
              {selectedPlace.googleMapsUri && (
                <a
                  href={selectedPlace.googleMapsUri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[44px] inline-flex items-center text-xs text-sky-400 hover:underline"
                >
                  Google Maps ↗
                </a>
              )}
            </div>
            <p className="text-xs text-slate-400">{selectedPlace.formattedAddress}</p>
          </div>

          {/* Empty Review / Empty Rec Feedback */}
          {(!placeReviewData?.reviews || placeReviewData.reviews.length === 0) ? (
            <div className="text-center py-6 flex flex-col items-center gap-3 text-slate-400 text-xs">
              <p>{isKo ? '이 지점의 Google 리뷰를 아직 충분히 불러올 수 없습니다.' : 'No Google review text was returned for this branch.'}</p>
              <button
                type="button"
                onClick={() => handleSelectPlace(selectedPlace)}
                className="min-h-[44px] px-4 rounded-xl bg-slate-800 text-[#D9B26A] text-xs font-medium hover:bg-slate-700"
              >
                {isKo ? '다시 시도' : 'Retry'}
              </button>
            </div>
          ) : recommendations.length === 0 ? (
            <div className="text-center py-6 flex flex-col items-center gap-3 text-slate-400 text-xs">
              <p>
                {isKo
                  ? '조회된 리뷰에서 메뉴판 속 메뉴에 대한 구체적인 찬사를 찾지 못했습니다.'
                  : 'No specific praise found in the returned review sample for the scanned menu items.'}
              </p>
              <button
                type="button"
                onClick={() => handleSelectPlace(selectedPlace)}
                className="min-h-[44px] px-4 rounded-xl bg-slate-800 text-[#D9B26A] text-xs font-medium hover:bg-slate-700"
              >
                {isKo ? '다시 확인하기' : 'Check Again'}
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {recommendations.map((rec) => (
                <article
                  key={rec.item.id}
                  className="bg-[#101922] border border-slate-800 p-4 rounded-xl flex flex-col gap-2.5"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="text-sm font-semibold text-slate-100 break-words min-w-0">{rec.item.name}</h3>
                    {rec.item.price && (
                      <span className="text-xs font-medium text-[#D9B26A]">{rec.item.price}</span>
                    )}
                  </div>

                  <p className="text-xs text-slate-400">{isKo ? `조회한 리뷰에서 호평 ${rec.sampleMentionCount}건` : `Praised in ${rec.sampleMentionCount} sampled review(s)`}</p>
                  <div className="flex flex-col gap-2 mt-1">
                    {rec.evidences.map((ev, i) => (
                      <div key={i} className="border-l-2 border-[#D9B26A]/60 pl-3 py-0.5 flex flex-col gap-1">
                        <blockquote className="text-xs italic text-slate-300 break-words">
                          “{ev.quote}”
                        </blockquote>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-400">
                          {ev.review.authorUri ? (
                            <a
                              href={ev.review.authorUri}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-slate-300 hover:text-white underline"
                            >
                              {ev.review.authorName || (isKo ? '리뷰어' : 'Reviewer')}
                            </a>
                          ) : (
                            <span>{ev.review.authorName || (isKo ? '리뷰어' : 'Reviewer')}</span>
                          )}
                          {ev.review.publishTime && (
                            <span>• {formatDate(ev.review.publishTime, language)}</span>
                          )}
                          {ev.review.visitDate && (
                            <span>({isKo ? '방문' : 'Visit'}: {formatDate(ev.review.visitDate, language)})</span>
                          )}
                          {ev.review.googleMapsUri && (
                            <a
                              href={ev.review.googleMapsUri}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="min-h-[44px] inline-flex items-center text-sky-400 hover:underline"
                            >
                              Google Review ↗
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          )}

          {/* Attributions */}
          <footer className="text-xs text-slate-400 pt-2 border-t border-slate-800 flex flex-col gap-2">
            <span className="font-medium text-slate-200">Google Maps</span>
            <p>
              {isKo
                ? 'Google Maps 관련도순 리뷰 최대 5개에서 확인한 추천입니다. 전체 리뷰의 인기 순위는 아닙니다. 가격은 메뉴 사진 기준입니다.'
                : 'Recommendations use up to 5 relevant Google Maps reviews, not a whole-review bestseller ranking. Prices come from the menu photo.'}
            </p>
            {placeReviewData?.attributions && placeReviewData.attributions.length > 0 && (
              <div>
                {isKo ? '출처' : 'Attribution'}:{' '}
                {placeReviewData.attributions.map((att, i) => (
                  <span key={i}>
                    {att.providerUri ? (
                      <a href={att.providerUri} target="_blank" rel="noopener noreferrer" className="underline text-slate-400">
                        {att.providerName || att.providerUri}
                      </a>
                    ) : (
                      att.providerName
                    )}
                    {i < (placeReviewData.attributions?.length ?? 0) - 1 ? ', ' : ''}
                  </span>
                ))}
              </div>
            )}
          </footer>
        </section>
      )}
    </div>
  );
};
