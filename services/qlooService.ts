import { tasteRequestHeaders, notifyGuestTasteRemaining } from './guestTasteService';
import type { LocationData } from '../types';

export interface QlooOptions {
  michelin?: {awards:Array<'bib'|'green'|'star'>;maxStars:number}|null;
  category: 'food' | 'shopping' | 'visits';
  mode: 'balanced' | 'popular' | 'discover';
  drink?: 'any' | 'matcha';
  foodQuery?: string;
  searchQuery?: string;
  openNow?: boolean;
  language?: string;
  shoppingKind?: 'any' | 'thrift' | 'vintage' | 'secondhand';
  foodApproach?: 'familiar' | 'local' | 'both';
  cuisine: 'any' | 'korean' | 'japanese' | 'italian' | 'mexican' | 'american' | 'vegetarian' | 'vietnamese' | 'thai' | 'chinese' | 'indian' | 'french' | 'mediterranean' | 'greek' | 'spanish' | 'brazilian';
  priceMax: number;
  radius: number;
}

export interface QlooInterest {
  id: string;
  name: string;
  type: string;
  description?: string;
}

export interface QlooPlace {
  michelin?: {stars:number;bib:boolean;green:boolean;year?:number;sourceUrl:string};
  latitude?: number;
  longitude?: number;
  rating?: number;
  ratingSource?: 'qloo' | 'google';
  reviewCount?: number;
  openNow?: boolean;
  openingHoursText?: string[];
  rankingSource?: 'google' | 'qloo';
  googleAttributions?: Array<{displayName:string;uri:string}>;
  priceLevel?: number;
  id: string;
  name: string;
  address: string;
  description?: string;
  descriptionUnavailable?: boolean;
  hours?: Record<string, Array<{opens?: string; closes?: string; closed?: boolean}>>;
  url: string;
}

const SUPABASE_PROJECT_ID = 'cshxkzgpuurursnhejnw';
const FUNCTION_NAME = 'qloo-proxy';
const TIMEOUT_MS = 25000;

function getFunctionUrl(): string {
  const base = import.meta.env.VITE_SUPABASE_URL || `https://${SUPABASE_PROJECT_ID}.supabase.co`;
  return `${base}/functions/v1/${FUNCTION_NAME}`;
}

async function makeRequest(path: string, options: Parameters<typeof fetch>[1] = {}): Promise<any> {
  const url = path === '/health' ? `${getFunctionUrl()}/health` : getFunctionUrl();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      throw new Error(`Invalid content type: ${contentType}`);
    }

    const data = await response.json();
    notifyGuestTasteRemaining(data.guestRemaining);

    if (!response.ok) {
      const errorCode = data.error || 'unknown_error';
      throw new Error(errorCode);
    }

    return data;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('timeout', {cause:error});
    }
    throw error;
  }
}

export async function qlooAvailable(): Promise<boolean> {
  try {
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!anonKey) return false;
    const headers = {apikey:anonKey, Authorization:`Bearer ${anonKey}`};

    const data = await makeRequest('/health', {
      method: 'GET',
      headers,
    });

    return data.enabled === true;
  } catch {
    return false;
  }
}

export async function searchQloo(query: string, type: string): Promise<QlooInterest[]> {
  const headers = await tasteRequestHeaders();

  const payload = {
    action: 'search',
    query,
    type,
  };

  const data = await makeRequest('', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  // Runtime basic shape validation
  if (!Array.isArray(data.entities)) {
    throw new Error('invalid_response_shape');
  }

  return data.entities.filter((e: any) => e && e.id && e.name);
}

const isValidPlace=(p: any): p is QlooPlace => p && typeof p.id === 'string' && typeof p.name === 'string' && typeof p.url === 'string' && p.url.startsWith('https://www.google.com/maps/search/?api=1&query=');

export async function recommendQlooDetailed(interests: string[], location: LocationData, options?: QlooOptions, excludedNames: string[] = []): Promise<{ places: QlooPlace[]; michelinNearby: QlooPlace[] }> {
  const headers = await tasteRequestHeaders();

  const payload = {
    action: 'recommend',
    excludedNames,
    options,
    interests,
    location: {
      latitude: Math.round(location.latitude * 100) / 100,
      longitude: Math.round(location.longitude * 100) / 100,
    },
  };

  const data = await makeRequest('', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  if (!data.places || !Array.isArray(data.places)) {
    throw new Error('invalid_response_shape');
  }

  const michelinNearby = Array.isArray(data.michelinNearby) ? data.michelinNearby.filter((p: any) => isValidPlace(p) && p.michelin) : [];
  return { places: data.places.filter(isValidPlace), michelinNearby };
}

export async function recommendQloo(interests: string[], location: LocationData, options?: QlooOptions, excludedNames: string[] = []): Promise<QlooPlace[]> {
  return (await recommendQlooDetailed(interests, location, options, excludedNames)).places;
}
