import { supabase } from './supabaseClient';
import type { LocationData } from '../types';

export interface QlooOptions {
  category: 'food' | 'shopping' | 'visits';
  mode: 'balanced' | 'popular' | 'discover';
  drink?: 'any' | 'matcha';
  foodApproach?: 'familiar' | 'local' | 'both';
  cuisine: 'any' | 'korean' | 'japanese' | 'italian' | 'mexican' | 'american' | 'vegetarian';
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
  id: string;
  name: string;
  address: string;
  description?: string;
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
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('login_required');
  }

  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!anonKey) {
    throw new Error('configuration_missing');
  }

  const payload = {
    action: 'search',
    query,
    type,
  };

  const data = await makeRequest('', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': anonKey,
    },
    body: JSON.stringify(payload),
  });

  // Runtime basic shape validation
  if (!Array.isArray(data.entities)) {
    throw new Error('invalid_response_shape');
  }

  return data.entities.filter((e: any) => e && e.id && e.name);
}

export async function recommendQloo(interests: string[], location: LocationData, options?: QlooOptions, excludedNames: string[] = []): Promise<QlooPlace[]> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('login_required');
  }

  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!anonKey) {
    throw new Error('configuration_missing');
  }

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
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': anonKey,
    },
    body: JSON.stringify(payload),
  });

  if (!data.places || !Array.isArray(data.places)) {
    throw new Error('invalid_response_shape');
  }

  return data.places.filter((p: any) =>
    p && typeof p.id === 'string' && typeof p.name === 'string' && typeof p.url === 'string' && p.url.startsWith('https://www.google.com/maps/search/?api=1&query=')
  );
}
