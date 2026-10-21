export type Language = 'en' | 'ko' | 'ja' | 'zh' | 'es' | 'fr' | 'de' | 'it';

export interface MenuItemCandidate {
  id: string;
  name: string;
  price?: string;
  aliases?: string[];
}

export interface GooglePlaceReview {
  id?: string;
  authorName?: string;
  authorPhotoUri?: string;
  authorUri?: string;
  rating: number;
  text: string;
  publishTime?: string;
  relativePublishTimeDescription?: string;
  visitDate?: string;
  googleMapsUri?: string;
}

export interface PlaceSearchResult {
  id: string;
  displayName?: string;
  formattedAddress?: string;
  googleMapsUri?: string;
}

export interface PlaceReviewResponse {
  place: PlaceSearchResult;
  reviews: GooglePlaceReview[];
  attributions?: Array<{
    providerName?: string;
    providerUri?: string;
  }>;
}

export interface RawEvidenceQuote {
  reviewIndex: number;
  quote: string;
  positive?: boolean;
}

export interface GroundedEvidence {
  reviewIndex: number;
  quote: string;
  review: GooglePlaceReview;
}

export interface GroundedRecommendation {
  item: MenuItemCandidate;
  sampleMentionCount: number;
  evidences: GroundedEvidence[];
}

export interface ModelRecommendationCandidate {
  itemId: string;
  evidence: RawEvidenceQuote[];
  positive: boolean;
}

export interface ModelRankingOutput {
  recommendations: ModelRecommendationCandidate[];
}

export const CONSERVATIVE_NEGATIVE_REGEX_EN = /\b(not\s+(?:good|recommend|order|worth)|don[’'']t\s+(?:order|recommend)|do\s+not\s+(?:order|recommend)|terrible|awful|horrible|bad|worst|disappointing|disappointed|bland|overpriced|inedible|undercooked|overcooked|stale|cold|tasteless|dry|gross|mediocre|wouldn't\s+recommend|never\s+again|avoid|waste\s+of\s+money|salty|greasy)\b/i;

export const CONSERVATIVE_NEGATIVE_REGEX_KO = /(맛없|최악|별로|돈아까|비추|실망|질김|너무\s*짬|맹맹|다신\s*안|비려|상했|불친절|식었|느끼해|돈\s*아깝)/i;

export function containsNegativeSentiment(text: string): boolean {
  if (!text) return false;
  return CONSERVATIVE_NEGATIVE_REGEX_EN.test(text) || CONSERVATIVE_NEGATIVE_REGEX_KO.test(text);
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function matchesPhraseBoundary(source: string, targetPhrase: string): boolean {
  const target = targetPhrase.trim();
  if (!source || !target) return false;
  const particle = /[가-힣]$/.test(target)
    ? '(?:(?:은|는|이|가|을|를|도|만|와|과|에|으로|로)(?=$|[^\\p{L}\\p{N}_]))?'
    : '';
  return new RegExp(`(^|[^\\p{L}\\p{N}_])${escapeRegex(target)}${particle}(?=$|[^\\p{L}\\p{N}_])`, 'iu').test(source);
}

export function validateRecommendationGrounding(
  items: MenuItemCandidate[],
  reviews: GooglePlaceReview[],
  modelOutput: ModelRankingOutput
): GroundedRecommendation[] {
  if (!Array.isArray(items) || !Array.isArray(reviews) || !modelOutput || !Array.isArray(modelOutput.recommendations)) {
    return [];
  }

  const validItemsMap = new Map<string, MenuItemCandidate>();
  for (const item of items) {
    if (item && typeof item.id === 'string' && typeof item.name === 'string' && item.name.trim()) {
      validItemsMap.set(item.id, {
        ...item,
        name: item.name.trim(),
        aliases: Array.isArray(item.aliases)
          ? item.aliases.map((a) => (typeof a === 'string' ? a.trim() : '')).filter(Boolean)
          : []
      });
    }
  }

  const results: GroundedRecommendation[] = [];
  const seenItemIds = new Set<string>();

  for (const rec of modelOutput.recommendations) {
    if (results.length >= 3) break;
    if (!rec || rec.positive !== true || typeof rec.itemId !== 'string') continue;
    if (seenItemIds.has(rec.itemId)) continue;

    const matchedItem = validItemsMap.get(rec.itemId);
    if (!matchedItem) continue;

    const rawEvidences = Array.isArray(rec.evidence) ? rec.evidence : [];
    const validGroundedEvidences: GroundedEvidence[] = [];
    const seenReviewIndices = new Set<number>();
    const seenReviewKeys = new Set<string>();

    const targetNames = [matchedItem.name, ...(matchedItem.aliases || [])].filter((n) => n.length > 0);

    for (const ev of rawEvidences) {
      if (!ev || typeof ev.reviewIndex !== 'number' || typeof ev.quote !== 'string') continue;
      const idx = ev.reviewIndex;
      if (!Number.isInteger(idx) || idx < 0 || idx >= reviews.length) continue;
      if (seenReviewIndices.has(idx)) continue;

      const review = reviews[idx];
      if (!review || typeof review.text !== 'string' || typeof review.rating !== 'number') continue;

      // Rating must be >= 4
      if (!Number.isFinite(review.rating) || review.rating < 4 || review.rating > 5) continue;
      const reviewKey = review.id || `${review.authorUri || review.authorName || ""}:${review.text}`;
      if (seenReviewKeys.has(reviewKey)) continue;

      const quote = ev.quote.trim();
      if (!quote || quote.length < 2) continue;

      // Verify quote is exact substring of source original review
      if (!review.text.includes(quote)) continue;

      // Conservative negative phrase guard on quote
      if (containsNegativeSentiment(review.text)) continue;

      // Item/alias matches literal phrase with Unicode token boundaries in either quote or review
      const hasLiteralMatchInReviewOrQuote = targetNames.some(
        (target) => matchesPhraseBoundary(quote, target)
      );
      if (!hasLiteralMatchInReviewOrQuote) continue;

      seenReviewIndices.add(idx);
      seenReviewKeys.add(reviewKey);
      validGroundedEvidences.push({
        reviewIndex: idx,
        quote,
        review
      });
    }

    if (validGroundedEvidences.length > 0) {
      seenItemIds.add(rec.itemId);
      results.push({
        item: matchedItem,
        sampleMentionCount: validGroundedEvidences.length,
        evidences: validGroundedEvidences
      });
    }
  }

  return results.slice(0, 3);
}
