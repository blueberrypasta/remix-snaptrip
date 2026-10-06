// utils/tasteTerms.ts

/**
 * Normalizes a taste name by trimming, lowercasing, and collapsing whitespace.
 */
export function normalizeTasteName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

const GENERIC_KOREAN = new Set([
  '한식',
  '한국 음식',
  '한국음식',
  '한식 맛집',
]);

const GENERIC_JAPANESE = new Set([
  '일식',
]);

const GENERIC_CHINESE = new Set([
  '중식',
]);

const GENERIC_WESTERN = new Set([
  '양식',
]);

const GENERIC_VEGETARIAN = new Set([
  '채식',
]);

const GENERIC_RAMEN = new Set([
  '라멘',
  'ramen',
]);

const GENERIC_BURGER = new Set([
  '버거',
  'burger',
]);

const GENERIC_PIZZA = new Set([
  '피자',
  'pizza',
]);

const GENERIC_MATCHA_DRINKS = new Set([
  '말차',
  '말차 라떼',
  '말차라떼',
  'matcha',
  'matcha latte',
]);

const GENERIC_COFFEE_LIKE = new Set([
  '커피',
  '라떼',
  '카페',
  'coffee',
  'latte',
  'cafe',
]);

const GENERIC_RESTAURANT_LABELS = new Set([
  '맛집',
  'restaurants',
]);

export function isGenericTasteName(name: string): boolean {
  const norm = normalizeTasteName(name);
  
  // Check all generic sets
  if (GENERIC_KOREAN.has(norm)) return true;
  if (GENERIC_JAPANESE.has(norm)) return true;
  if (GENERIC_CHINESE.has(norm)) return true;
  if (GENERIC_WESTERN.has(norm)) return true;
  if (GENERIC_VEGETARIAN.has(norm)) return true;
  if (GENERIC_RAMEN.has(norm)) return true;
  if (GENERIC_BURGER.has(norm)) return true;
  if (GENERIC_PIZZA.has(norm)) return true;
  if (GENERIC_MATCHA_DRINKS.has(norm)) return true;
  if (GENERIC_COFFEE_LIKE.has(norm)) return true;
  if (GENERIC_RESTAURANT_LABELS.has(norm)) return true;
  
  // Check English cuisine terms
  if (norm === 'korean' || norm === 'korean food' || norm === 'korean cuisine') return true;
  if (norm === 'japanese' || norm === 'japanese food') return true;
  if (norm === 'chinese') return true;
  if (norm === 'italian') return true;
  if (norm === 'mexican') return true;
  if (norm === 'american') return true;
  if (norm === 'vegetarian') return true;
  if (norm === 'ramen' || norm === 'burger' || norm === 'pizza') return true;
  if (norm === 'matcha' || norm === 'matcha latte') return true;
  if (norm === 'coffee' || norm === 'latte' || norm === 'cafe') return true;
  if (norm === 'restaurants') return true;

  return false;
}

type CuisineType = 'korean' | 'japanese' | 'italian' | 'mexican' | 'american' | 'vegetarian';
type DrinkType = 'matcha';

interface GenericTasteOptions {
  cuisine?: CuisineType;
  drink?: DrinkType;
}

/**
 * Extracts generic taste options from an array of names.
 * Only exact matches against known generic terms are considered.
 * If multiple conflicting cuisines are found, cuisine is omitted.
 */
export function extractGenericTasteOptions(names: string[]): GenericTasteOptions {
  const result: GenericTasteOptions = {};
  const detectedCuisines = new Set<CuisineType>();
  let hasMatcha = false;

  for (const rawName of names) {
    const norm = normalizeTasteName(rawName);

    // Determine cuisine
    let currentCuisine: CuisineType | null = null;
    
    // Korean variants
    if (GENERIC_KOREAN.has(norm) || norm === 'korean' || norm === 'korean food' || norm === 'korean cuisine') {
      currentCuisine = 'korean';
    } 
    // Japanese variants
    else if (GENERIC_JAPANESE.has(norm) || norm === 'japanese' || norm === 'japanese food') {
      currentCuisine = 'japanese';
    }
    // Italian/Mexican/American/Vegetarian (English only per list, except vegetarian which has Korean too)
    else if (norm === 'italian') {
      currentCuisine = 'italian';
    } else if (norm === 'mexican') {
      currentCuisine = 'mexican';
    } else if (norm === 'american') {
      currentCuisine = 'american';
    } else if (GENERIC_VEGETARIAN.has(norm) || norm === 'vegetarian') {
      currentCuisine = 'vegetarian';
    }

    if (currentCuisine) {
      detectedCuisines.add(currentCuisine);
    }

    // Determine drink (only matcha is requested in output type)
    if (GENERIC_MATCHA_DRINKS.has(norm)) {
      hasMatcha = true;
    }
  }

  if (detectedCuisines.size === 1) {
    result.cuisine = Array.from(detectedCuisines)[0];
  }
  // If size > 1 or 0, omit cuisine
  
  if (hasMatcha) {
    result.drink = 'matcha';
  }

  return result;
}
