// Minimal Deno declarations for tsc compatibility
declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
  serve(handler: (req: Request) => Promise<Response>): void;
};

interface QlooEntity {
  id: string;
  name: string;
  type: string;
  description?: string;
}

interface QlooPlaceResult {
  michelin?:MichelinAward;
  latitude?: number;
  longitude?: number;
  rating?: number;
  ratingSource?: 'qloo' | 'google';
  reviewCount?: number;
  openNow?: boolean;
  openingHoursText?: string[];
  rankingSource?: 'google'|'qloo';
  googleAttributions?: Array<{displayName:string;uri:string}>;
  priceLevel?: number;
  id: string;
  name: string;
  address: string;
  description?: string;
  hours?: Record<string, unknown>;
  url: string;
}

const ALLOWED_ORIGINS = [
  'https://slaptrip.com',
  'https://www.slaptrip.com',
  'http://localhost:3000',
  'http://127.0.0.1:3000'
];

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_MINUTE = 20;
const BOUNDED_MAP_SIZE = 1000;

const rateLimitMap = new Map<string, number[]>();

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const timestamps = rateLimitMap.get(userId) || [];

  // Prune expired entries
  const validTimestamps = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS);

  if (validTimestamps.length >= MAX_REQUESTS_PER_MINUTE) {
    return false;
  }

  validTimestamps.push(now);
  rateLimitMap.set(userId, validTimestamps);

  // Bound the map size by pruning oldest users if necessary
  if (rateLimitMap.size > BOUNDED_MAP_SIZE) {
    const keys = Array.from(rateLimitMap.keys());
    const oldestKey = keys[0];
    if (oldestKey) {
      rateLimitMap.delete(oldestKey);
    }
  }

  return true;
}

function getCorsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, X-Guest-Taste-Id',
    'Cache-Control': 'no-store',
  };

  if (!origin) {
    // Server-to-server or absent origin allowed
    return headers;
  }

  if (ALLOWED_ORIGINS.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Vary'] = 'Origin';
  } else {
    // Disallow other non-empty origins by not setting Allow-Origin
    // The browser will block it naturally
  }

  return headers;
}

async function verifyUserSession(authHeader: string | null): Promise<{ userId: string } | null> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7).trim();
  if (!token) {
    return null;
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('auth_unavailable');
  }

  try {
    const signal = AbortSignal.timeout(8000);

    const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'apikey': supabaseAnonKey,
      },
      signal,
    });


    if (res.status >= 500) throw new Error('auth_unavailable');
    if (!res.ok) return null;

    const data = await res.json() as { id?: string; email?: string; role?: string };

    // Reject anon JWT or invalid tokens that don't have a user ID
    if (!data.id) {
      return null;
    }


    return { userId: data.id };
  } catch (error) {
    throw new Error('auth_unavailable', {cause:error});
  }
}

// Qloo answers short bursts with 429; one quick retry turns most of those into a normal result.
async function qlooFetch(url: string, init: { headers?: Record<string, string>; method?: string; signal?: AbortSignal }): Promise<Response> {
  const res = await fetch(url, init);
  if (res.status !== 429 || init.signal?.aborted) return res;
  await new Promise(r => setTimeout(r, 800));
  return fetch(url, init);
}

async function handleSearch(qlooApiKey: string, qlooApiUrl: string, query: string, type: string): Promise<QlooEntity[] | Response> {
  const trimmedQuery = query.trim();
  if (trimmedQuery.length < 2 || trimmedQuery.length > 100) {
    return new Response(JSON.stringify({ error: 'invalid_query_length' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const validTypes = ['artist', 'movie', 'book', 'place', 'brand'];
  if (!validTypes.includes(type)) {
    return new Response(JSON.stringify({ error: 'invalid_type' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const searchParams = new URLSearchParams({
    query: trimmedQuery,
    types: `urn:entity:${type}`,
    take: '5',
  });

  try {
    const signal = AbortSignal.timeout(12000);

    const res = await qlooFetch(`${qlooApiUrl}/search?${searchParams.toString()}`, {
      method: 'GET',
      headers: {
        'X-Api-Key': qlooApiKey,
      },
      signal,
    });


    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        return new Response(JSON.stringify({ error: 'config_error' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
      }
      if (res.status === 429) {
        return new Response(JSON.stringify({ error: 'rate_limited' }), { status: 429, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ error: 'upstream_error' }), { status: 502, headers: { 'Content-Type': 'application/json' } });
    }

    const data = await res.json() as any;
    if (data.success === false) return Response.json({error: 'upstream_error'}, {status:502});
    let entities: any[] = [];

    if (Array.isArray(data.results?.entities)) {
      entities = data.results.entities;
    } else if (Array.isArray(data.results)) {
      entities = data.results;
    }

    const mappedEntities: QlooEntity[] = entities.map((e: any) => {
      const subtype = Array.isArray(e.types) && e.types.includes(`urn:entity:${type}`) ? `urn:entity:${type}` : (e.subtype || e.type || '');
      const desc = e.properties?.description ? String(e.properties.description).substring(0, 200) : undefined;

      // Validate UUID/Name roughly
      if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(e.entity_id || e.id || '')) return null;
      if (typeof e.name !== 'string' || !e.name.trim()) return null;
      if (subtype !== `urn:entity:${type}`) return null;


      return {
        id: e.entity_id || e.id,
        name: e.name,
        type: subtype.replace('urn:entity:', ''),
        description: desc,
      };
    }).filter(Boolean) as QlooEntity[];

    return mappedEntities.slice(0, 5);
  } catch (error) {
    return new Response(JSON.stringify({ error: 'timeout' }), { status: 502, headers: { 'Content-Type': 'application/json' } });
  }
}

// Seed businesses describe taste, and must never be returned as discoveries.
function favoriteNameKey(value: string): string {
  const normalized = value.normalize('NFKC').toLowerCase().replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
  const compact = normalized.replace(/ /g, '');
  if (/^(?:innout|인앤아웃|인엔아웃)/u.test(compact)) return 'in n out';
  if (/^(?:bcd tofu house|북창동순두부)(?:$|[\s(])/u.test(normalized) || normalized === 'bcd'
    || compact.startsWith('bcdtofuhouse') || compact.startsWith('북창동순두부')) return 'bcd tofu house';
  return normalized;
}
function isFavoritePlace(place: any, ids: Set<string>, names: string[]): boolean {
  if (ids.has(String(place.entity_id).toLowerCase()) || ids.has(String(place.id).toLowerCase())) return true;
  const candidates = [place.name, place.properties?.brand, place.properties?.chain]
    .map(value => typeof value === 'string' ? value : value?.name).filter(value => typeof value === 'string');
  return candidates.some(name => {
    const candidate = favoriteNameKey(name);
    return names.some(seed => candidate === seed || candidate.startsWith(seed + ' '));
  });
}

// TypeScript helper functions for Qloo food preference resolution and post-filtering.
// These functions are designed to be embedded directly into a single-file Deno server.

interface TagResult {
  id: string;
  name: string;
}

interface TagsResponse { results?: {tags?: TagResult[]}; }

interface PlaceTagsEntry {
  id?: string;
  tag_id?: string;
}

interface PrimaryGenre {
  id?: string;
}

interface Properties {
  primary_genre?: PrimaryGenre;
  cuisine_description?: string;
}

interface PlaceRecord {
  tags?: PlaceTagsEntry[];
  properties?: Properties;
}

const CACHE_MAX_SIZE = 20;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

type CacheValue = { value: string; expiresAt: number };
const cache = new Map<string, CacheValue>();

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isValidQuery(query: string): boolean {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return false;
  return /^[a-z][a-z -]{1,59}$/.test(trimmed);
}

function getCacheKey(apiUrl: string, englishQuery: string): string {
  // Key includes apiUrl and normalized query, never the API key
  return `${apiUrl}|${englishQuery.trim().toLowerCase()}`;
}

function getCachedTag(cacheKey: string): string | null {
  const entry = cache.get(cacheKey);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(cacheKey);
    return null;
  }
  return entry.value;
}

function setCachedTag(cacheKey: string, tagId: string): void {
  // Evict oldest entries if exceeding max size
  if (cache.size >= CACHE_MAX_SIZE) {
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) {
      cache.delete(firstKey);
    }
  }
  cache.set(cacheKey, { value: tagId, expiresAt: Date.now() + CACHE_TTL_MS });
}

/**
 * Resolves an English canonical dish term to a specific Qloo tag ID.
 * Validates input, queries /v2/tags with strict filtering, and caches successful results.
 * Throws errors for invalid inputs, upstream issues, or lack of exact match.
 */
export async function resolveFoodTag(
  apiKey: string,
  apiUrl: string,
  englishQuery: string
): Promise<string> {
  if (!isValidQuery(englishQuery)) {
    throw new Error('unsupported_preference');
  }

  const normalizedQuery = englishQuery.trim().toLowerCase();
  const normQ = normalizeName(normalizedQuery);
  const targetNames = [normQ, normQ + 'restaurant'];

  const cacheKey = getCacheKey(apiUrl, normalizedQuery);
  const cached = getCachedTag(cacheKey);
  if (cached) {
    return cached;
  }

  const params = new URLSearchParams({'filter.query':normalizedQuery,take:'30'});
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),5000);
  let tags:TagResult[];
  try {
    const response=await qlooFetch(`${apiUrl}/v2/tags?${params}`,{headers:{'X-Api-Key':apiKey},signal:controller.signal});
    if(!response.ok)throw new Error(response.status===429?'rate_limited':'upstream_error');
    const data:unknown=await response.json();
    const raw=data && typeof data==='object' ? (data as TagsResponse).results?.tags : null;
    if(!Array.isArray(raw))throw new Error('upstream_error');
    tags=raw.filter(t=>t && typeof t==='object' && typeof t.id==='string' && typeof t.name==='string');
  } finally { clearTimeout(timeout); }

  // Allowed namespaces for selection priority
  const ALLOWED_PREFIXES = [
    'urn:tag:menu_highlight:qloo:',
    'urn:tag:specialty_dish:place:',
    'urn:tag:genre:place:restaurant:'
  ];

  type Candidate = { id: string; prefixIndex: number };
  const candidates: Candidate[] = [];

  for (const tag of tags) {
    if (typeof tag.id !== 'string' || typeof tag.name !== 'string') continue;

    const tagNameNorm = normalizeName(tag.name);
    if (!targetNames.includes(tagNameNorm)) continue;

    // Check if it belongs to one of the allowed prefixes
    let matchedPrefixIndex = -1;
    for (let i = 0; i < ALLOWED_PREFIXES.length; i++) {
      if (tag.id.startsWith(ALLOWED_PREFIXES[i])) {
        matchedPrefixIndex = i;
        break;
      }
    }

    if (matchedPrefixIndex !== -1) {
      candidates.push({ id: tag.id, prefixIndex: matchedPrefixIndex });
    }
  }

  if (candidates.length === 0) {
    throw new Error('unsupported_preference');
  }

  // Sort by prefix index (priority: menu_highlight=0, specialty_dish=1, genre=2)
  // Then by ID stability if needed, though prefix determines category primarily
  candidates.sort((a, b) => a.prefixIndex - b.prefixIndex);

  const selectedTagId = candidates[0].id;
  setCachedTag(cacheKey, selectedTagId);

  return selectedTagId;
}

/**
 * Checks if a place record satisfies cuisine and optional dish constraints based on its tags.
 * Fails closed if proof is missing. Does not use free-text name/description fallbacks for dishes.
 */
export function matchesFoodConstraint(
  place: unknown,
  cuisine: string,
  dishTag?: string
): boolean {
  // Guard against non-object or null places
  if (typeof place !== 'object' || place === null) {
    return false;
  }

  const p = place as PlaceRecord;

  // Collect all relevant tag IDs from the place
  const tagIds = new Set<string>();

  if (Array.isArray(p.tags)) {
    for (const t of p.tags) {
      if (t && typeof t === 'object') {
        if (typeof t.id === 'string') {
          tagIds.add(t.id);
        } else if (typeof t.tag_id === 'string') {
          tagIds.add(t.tag_id);
        }
      }
    }
  }

  // Also consider primary_genre.id if present in properties
  if (p.properties && typeof p.properties === 'object') {
    if (p.properties.primary_genre && typeof p.properties.primary_genre === 'object') {
      if (typeof p.properties.primary_genre.id === 'string') {
        tagIds.add(p.properties.primary_genre.id);
      }
    }
  }

  // Normalize cuisine for matching logic
  const normCuisine = cuisine.trim().toLowerCase();
  const hasCuisineConstraint = normCuisine !== '' && normCuisine !== 'any';

  if(hasCuisineConstraint && !tagIds.has(`urn:tag:genre:place:restaurant:${normCuisine}`) && !tagIds.has(`urn:tag:cuisine:qloo:${normCuisine}`)) return false;

  // If there's a dish tag requirement, verify it exists exactly or via equivalent namespaces
  if (dishTag && typeof dishTag === 'string' && dishTag.length > 0) {
    if (!tagIds.has(dishTag)) {
      // Allow equivalent slugs across approved namespaces if the base slug matches
      // Extract slug from dishTag assuming format urn:tag:<namespace>:<slug_part>...
      // We need to find if any other tag in tagIds shares the same semantic identity

      // Parse the dishTag to extract potential equivalents
      // Example: urn:tag:menu_highlight:qloo:ramen -> slug "ramen"
      // Equivalents: urn:tag:specialty_dish:place:ramen, urn:tag:genre:place:restaurant:ramen

      const parts = dishTag.split(':');
      if (parts.length >= 4) {
        const lastPart = parts[parts.length - 1];
        // Construct potential alternatives using other prefixes
        const altPrefixes = [
          'urn:tag:specialty_dish:place:',
          'urn:tag:genre:place:restaurant:',
          'urn:tag:menu_highlight:qloo:'
        ];

        let foundEquivalent = false;
        for (const prefix of altPrefixes) {
          if (prefix === dishTag.substring(0, dishTag.lastIndexOf(lastPart))) continue;

          const candidateId = prefix + lastPart;
          if (tagIds.has(candidateId)) {
            foundEquivalent = true;
            break;
          }
        }

        if (!foundEquivalent) {
          // No exact match and no valid cross-namespace equivalent found
          // Fail closed: do not rely on name/description free text for dish verification
          return false;
        }
      } else {
        // Malformed dishTag structure cannot be verified safely
        return false;
      }
    }
  }

  return true;
}

const HYBRID_LANGS = ['ko', 'en', 'ja', 'zh-CN', 'zh-TW', 'es', 'fr', 'de', 'it', 'pt', 'vi', 'th', 'id'];
const PRICE_MAP: Record<string, number> = { FREE: 0, INEXPENSIVE: 1, MODERATE: 2, EXPENSIVE: 3, VERY_EXPENSIVE: 4 };

function hybridValidateQuery(q: any): string | null {
  if(q===undefined)return '';
  if (typeof q !== 'string') return null;
  const trimmed = q.trim();
  if (!trimmed) return '';
  if (trimmed.length > 120) return null;
  for (let i = 0; i < trimmed.length; i++) {
    const c = trimmed.charCodeAt(i);
    if (c < 32 || c > 126) return null;
  }
  if (/https?:\/\//i.test(trimmed)) return null;
  return trimmed;
}

function hybridDeriveQuery(opts:any):string {
  const query=opts.searchQuery?.trim();
  if(query)return query;
  if(opts.category==='shopping' && opts.shoppingKind && opts.shoppingKind!=='any')return `${opts.shoppingKind} clothing stores`;
  if(opts.category==='food'){
    if(opts.foodQuery)return `${opts.foodQuery} restaurants`;
    if(opts.drink==='matcha')return 'matcha cafes';
    if(opts.cuisine && opts.cuisine!=='any' && opts.foodApproach!=='local')return `${opts.cuisine} restaurants`;
    return 'restaurants';
  }
  return opts.category==='shopping'?'shopping':'tourist attractions';
}

function hybridHaversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function hybridBuildGoogleRequest(apiKey: string, query: string, lang: string, loc: { latitude: number; longitude: number }, radius: number, openNow: boolean | undefined, priceMax: number | undefined,options:any) {
  const body: any = { textQuery: query, languageCode: lang, pageSize: 10, locationBias: { circle: { center: { latitude: loc.latitude, longitude: loc.longitude }, radius: radius } } };
  if(options.category==='food'){body.includedType=options.drink==='matcha'?'cafe':'restaurant';body.strictTypeFiltering=true;}
  if (openNow === true) body.openNow = true;
  if (priceMax !== undefined && priceMax > 0) {
    const levels = Object.entries(PRICE_MAP).filter(([_, v]) => v <= priceMax).map(([k]) => `PRICE_LEVEL_${k}`);
    if (levels.length) body.priceLevels = levels;
  }
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Goog-Api-Key': apiKey,
    'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.priceLevel,places.currentOpeningHours,places.regularOpeningHours,places.businessStatus,places.types,places.attributions',
  };
  return { method: 'POST', headers, body: JSON.stringify(body) };
}

function hybridSanitizePlace(p: any): QlooPlaceResult | null {
  if (!p || typeof p.id !== 'string' || !/^[A-Za-z0-9_-]{10,200}$/.test(p.id)) return null;
  const nameObj = p.displayName;
  const name = nameObj?.text ? String(nameObj.text).slice(0, 200) : '';
  if (!name) return null;
  const address = p.formattedAddress ? String(p.formattedAddress).slice(0, 300) : '';
  const lat = p.location?.latitude;
  const lng = p.location?.longitude;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat)>90 || Math.abs(lng)>180) return null;
  const ratingRaw = p.rating;
  let rating:number|undefined;
  if (typeof ratingRaw === 'number' && isFinite(ratingRaw) && ratingRaw >= 0 && ratingRaw <= 5) rating = Math.round(ratingRaw * 10) / 10;
  const countRaw = p.userRatingCount;
  let reviewCount:number|undefined;
  if (typeof countRaw === 'number' && Number.isInteger(countRaw) && countRaw >= 0) reviewCount = countRaw;
  const status = p.businessStatus;
  if (status && status !== 'OPERATIONAL') return null;
  const curOH = p.currentOpeningHours;
  let openNow: boolean | undefined;
  if (curOH && typeof curOH.openNow === 'boolean') openNow = curOH.openNow;
  const regOH = p.regularOpeningHours;
  let openingHoursText: string[] | undefined;
  if (regOH && Array.isArray(regOH.weekdayDescriptions)) {
    const descs = regOH.weekdayDescriptions.filter((d: any) => typeof d === 'string').slice(0, 7).map((d: string) => d.slice(0, 300));
    if (descs.length) openingHoursText = descs;
  }
  const attrs = p.attributions;
  let googleAttributions: Array<{ displayName: string; uri: string }> | undefined;
  if (Array.isArray(attrs) && attrs.length) {
    const valid = attrs.slice(0, 10).map((a: any) => ({
      displayName: typeof a.displayName === 'string' ? a.displayName.slice(0, 200) : '',
      uri: typeof a.uri === 'string' && /^https:\/\//.test(a.uri) ? a.uri : '',
    })).filter((a: any) => a.displayName && a.uri);
    if (valid.length) googleAttributions = valid;
  }
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name},${address}`)}&query_place_id=${encodeURIComponent(p.id)}`;
  return { id: `google:${p.id}`, name, address, latitude:lat, longitude:lng, priceLevel:PRICE_MAP[String(p.priceLevel).replace('PRICE_LEVEL_','')], ratingSource:'google', url: mapUrl, reviewCount, rating, openNow, openingHoursText, rankingSource: 'google', googleAttributions };
}

function hybridGoogleIds(entity:any):string[]{
  const links=[entity.external?.google_place,entity.properties?.external?.google_place].flatMap(link=>Array.isArray(link)?link:link?[link]:[]);
  return links.map((link:any)=>link?.place_id).filter((id:any)=>typeof id==='string');
}

async function hybridFetchQlooMatch(qlooKey: string, qlooUrl: string, placeName: string, types: string[], googleId:string, excludedNames:string[], signal: AbortSignal): Promise<string[]> {
  try {
    const params = new URLSearchParams({ query: placeName, take: '5' });
    if (types.length) params.set('types', types.join(','));
    const res = await fetch(`${qlooUrl}/search?${params.toString()}`, {
      headers: { 'X-Api-Key': qlooKey },
      signal,
    });
    if (!res.ok) return [];
    const data = await res.json();
    const entities = data.results?.entities ?? data.results ?? data.entities ?? [];
    if (!Array.isArray(entities)) return [];
    return entities.filter((e:any)=>hybridGoogleIds(e).includes(googleId) && !isFavoritePlace(e,new Set(),excludedNames.map(favoriteNameKey))).map((e: any) => e.entity_id ?? e.id).filter((id: any) => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id));
  } catch {
    return [];
  }
}

async function hybridRankWithQloo(qlooKey: string, qlooUrl: string, matchedIds: string[], interests: string[], cuisineGenre: string | null, signal: AbortSignal): Promise<string[]> {
  if (!matchedIds.length) return [];
  const params=new URLSearchParams({'filter.type':'urn:entity:place','filter.results.entities':matchedIds.join(','),take:String(matchedIds.length)});
  if(interests.length)params.set('signal.interests.entities',interests.join(','));
  else if(cuisineGenre)params.set('signal.interests.tags',cuisineGenre);
  else return [];
  const url=`${qlooUrl}/v2/insights?${params}`;
  try {
    const res = await fetch(url, { headers: { 'X-Api-Key': qlooKey }, signal });
    if (!res.ok) return [];
    const data = await res.json();
    const ents = data.results?.entities ?? data.results ?? [];
    if (!Array.isArray(ents)) return [];
    const ranked = ents.map((e: any) => e.id ?? e.entity_id).filter((id: any) => typeof id === 'string' && matchedIds.includes(id));
    const seen = new Set<string>();
    return ranked.filter((id: string) => { if (seen.has(id)) return false; seen.add(id); return true; });
  } catch {
    return [];
  }
}

async function handlePlacesHybrid(apiKey: string, qlooKey: string, qlooUrl: string, interests: string[], location: { latitude: number; longitude: number }, options: any, excludedNames: string[]): Promise<{ places: QlooPlaceResult[] } | Response> {
  if (!apiKey) return new Response(JSON.stringify({ error: 'places_unavailable' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  const rawQuery = options.searchQuery;
  const validatedQuery = hybridValidateQuery(rawQuery);
  if (validatedQuery === null) return new Response(JSON.stringify({ error: 'invalid_query' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  const query = validatedQuery || hybridDeriveQuery(options);
  if (!query) return new Response(JSON.stringify({ error: 'no_query' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  const lang = HYBRID_LANGS.includes(options.language) ? options.language : 'en';
  const openNowOpt = typeof options.openNow === 'boolean' ? options.openNow : undefined;
  const priceMaxVal = typeof options.priceMax === 'number' && options.priceMax >= 0 && options.priceMax <= 4 ? options.priceMax : undefined;
  const radius=options.radius ?? 15000;
  const abortCtrl = new AbortController();
  const timeoutId = setTimeout(() => abortCtrl.abort(), 8000);
  let googlePlaces: QlooPlaceResult[] = [];
  try {
    const reqOpts = hybridBuildGoogleRequest(apiKey, query, lang, location, radius, openNowOpt, priceMaxVal,options);
    const gRes = await fetch('https://places.googleapis.com/v1/places:searchText', { ...reqOpts, signal: abortCtrl.signal });
    if (gRes.status === 429) {clearTimeout(timeoutId);return new Response(JSON.stringify({ error: 'rate_limited' }), { status: 429, headers: { 'Content-Type': 'application/json' } });}
    if (!gRes.ok) {clearTimeout(timeoutId);return new Response(JSON.stringify({ error: 'places_unavailable' }), { status: 502, headers: { 'Content-Type': 'application/json' } });}
    const gData = await gRes.json();
    const placesArr = Array.isArray(gData.places) ? gData.places : [];
    const seenIds = new Set<string>();
    for (const gp of placesArr) {
      const sanitized = hybridSanitizePlace(gp);
      if (!sanitized) continue;
      if (seenIds.has(sanitized.id)) continue;
      seenIds.add(sanitized.id);
      if (gp.id && seenIds.has(`raw:${gp.id}`)) continue;
      if (gp.id) seenIds.add(`raw:${gp.id}`);
      if(isFavoritePlace({name:sanitized.name},new Set(),excludedNames.map(favoriteNameKey)))continue;
      if(options.category==='shopping' && options.shoppingKind && options.shoppingKind!=='any' && Array.isArray(gp.types) && gp.types.some((t:string)=>['shopping_mall','book_store','school','university'].includes(t)))continue;
      if (openNowOpt === true && sanitized.openNow !== true) continue;
      if (priceMaxVal !== undefined && priceMaxVal > 0) {
        const pl = gp.priceLevel;
        if (pl && PRICE_MAP[String(pl).replace('PRICE_LEVEL_', '')] !== undefined && PRICE_MAP[String(pl).replace('PRICE_LEVEL_', '')]! > priceMaxVal) continue;
        if (PRICE_MAP[String(pl).replace('PRICE_LEVEL_','')]===undefined) continue;
      }
      const dist = hybridHaversine(location.latitude, location.longitude, gp.location.latitude, gp.location.longitude);
      if (dist > radius) continue;
      googlePlaces.push(sanitized);
      if (googlePlaces.length >= 10) break;
    }
  } catch (e) {
    clearTimeout(timeoutId);
    return new Response(JSON.stringify({ error: 'places_unavailable' }), { status: 502, headers: { 'Content-Type': 'application/json' } });
  }
  clearTimeout(timeoutId);
  if (!googlePlaces.length) return { places: [] };
  const matchAbort = new AbortController();
  const matchTimeout = setTimeout(() => matchAbort.abort(), 7000);
  const candidatesToMatch = googlePlaces.slice(0, 8);
  const matchResults: Map<number, string[]> = new Map();
  const workerQueue = [...candidatesToMatch.keys()];
  const workers = Array.from({ length: Math.min(3, workerQueue.length) }, async () => {
    while (workerQueue.length) {
      const idx = workerQueue.shift()!;
      const place = candidatesToMatch[idx];
      const origId = place.id.replace(/^google:/, '');
      const typesForSearch = ['urn:entity:place'];
      const matchedIds = await hybridFetchQlooMatch(qlooKey, qlooUrl, place.name, typesForSearch, origId, excludedNames, matchAbort.signal);
      const filtered = matchedIds.filter((mid: string) => mid && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(mid));
      if (filtered.length) matchResults.set(idx, filtered);
    }
  });
  await Promise.all(workers);
  const allMatchedIds = new Set<string>();
  const candidateToQlooIds: Map<number, string[]> = new Map();
  for (const [idx, ids] of matchResults) {
    candidateToQlooIds.set(idx, ids);
    ids.forEach((id: string) => allMatchedIds.add(id));
  }
  const matchedIdList = Array.from(allMatchedIds);
  let rankedIds: string[] = [];
  if (matchedIdList.length) {
    const cuisineGenre = options.category==='food' && options.cuisine && options.cuisine!=='any' ? `urn:tag:genre:place:restaurant:${options.cuisine}` : null;
    rankedIds = await hybridRankWithQloo(qlooKey, qlooUrl, matchedIdList, interests, cuisineGenre, matchAbort.signal);
  }
  clearTimeout(matchTimeout);
  const finalPlaces: QlooPlaceResult[] = [];
  const usedOriginalIndices = new Set<number>();
  for (const rid of rankedIds) {
    if (finalPlaces.length >= 10) break;
    for (const [idx, qlooIds] of candidateToQlooIds) {
      if (usedOriginalIndices.has(idx)) continue;
      if (qlooIds.includes(rid)) {
        const orig = candidatesToMatch[idx];
        const updated: QlooPlaceResult = { ...orig, rankingSource: 'qloo' };
        finalPlaces.push(updated);
        usedOriginalIndices.add(idx);
        break;
      }
    }
  }
  for (let i = 0; i < googlePlaces.length && finalPlaces.length < 10; i++) {
    if (!usedOriginalIndices.has(i)) {
      finalPlaces.push(googlePlaces[i]);
    }
  }
  return { places: finalPlaces.slice(0, 10) };
}

interface MichelinFilter {
  awards: Array<'bib' | 'green' | 'star'>;
  maxStars: number;
}

interface MichelinAward {
  stars: number;
  bib: boolean;
  green: boolean;
  year?: number;
  sourceUrl: string;
  _id?:number;_lat?:number;_lng?:number;
}

const MICHELIN_CACHE_TTL_MS = 3600 * 1000;
const MAX_CACHE_ENTRIES = 24;
const PARSE_TIMEOUT_MS = 8000;
const MAX_GROUPS_PER_REQUEST = 3;
const CONCURRENCY_LIMIT = 3;
const DISTANCE_THRESHOLD_M = 1000;
const MICHELIN_API_BASE_URL = "https://api.parse.bot/scraper/70808de2-3170-4ee9-8819-d781d6b15701/search_restaurants";

const michelinCache = new Map<string, { data: any[]; expiry: number }>();
const inFlightRequests = new Map<string, Promise<any[]>>();

function getParseApiKey(): string {
  const key = Deno.env.get('PARSE_API_KEY');
  if (!key) throw new Error('michelin_unavailable');
  return key;
}

function normalizeMichelinHit(hit: any): MichelinAward | null {
  if (!hit || typeof hit !== 'object') return null;

  const objId = hit.objectID;
  if (typeof objId !== 'string' || !/^\d+$/.test(objId)) return null;
  const numericId = parseInt(objId, 10);
  if (isNaN(numericId)) return null;

  const distSlug = hit.distinction?.slug;

  const greenVal = hit.green_star;
  const guideYear = hit.guide_year;
  const geoloc = hit._geoloc;
  const url = hit.url;

  if (!geoloc || typeof geoloc.lat !== 'number' || typeof geoloc.lng !== 'number') return null;
  const lat = geoloc.lat;
  const lng = geoloc.lng;
  if (!Number.isFinite(lat)||!Number.isFinite(lng)||lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  let validYear: number | undefined = undefined;
  if (typeof guideYear === 'number' && Number.isInteger(guideYear)) {
    if (guideYear >= 2000 && guideYear <= 2100) {
      validYear = guideYear;
    } else {
      return null; // Invalid year range
    }
  }

  let stars:number;
  let isBib = false;
  let isValidClassification = false;

  if (distSlug === 'bib-gourmand') {
    stars = 0;
    isBib = true;
    isValidClassification = true;
  } else if (distSlug === '1-star-michelin') {
    stars = 1;
    isValidClassification = true;
  } else if (distSlug === '2-stars-michelin') {
    stars = 2;
    isValidClassification = true;
  } else if (distSlug === '3-stars-michelin') {
    stars = 3;
    isValidClassification = true;
  } else if (distSlug === 'the-plate-michelin') {
    if (greenVal === true) {
      stars = 0;
      isValidClassification = true;
    } else {
      return null; // Reject plate without explicit green true per strict interpretation
    }
  } else if (distSlug === 'selected-restaurants' || distSlug === 'selected' || distSlug === 'michelin-selected' || distSlug == null) {
    stars = 0;
    isValidClassification = true;
  } else {
    return null; // Unknown slug
  }

  let isGreen:boolean;
  if (greenVal === true) {
    isGreen = true;
  } else if (greenVal === false || greenVal === null || greenVal === undefined) {
    isGreen = false;
  } else {
    return null; // Unexpected type
  }


  let sourceUrl = "";
  if (typeof url === 'string' && /^\/[a-z]{2}\/[A-Za-z0-9/_%.-]{3,300}$/.test(url)) {
    sourceUrl = `https://guide.michelin.com${url}`;
  } else if (typeof url === 'string' && url.startsWith('https://')) {
    try {
      const parsed = new URL(url);
      if (parsed.hostname === 'guide.michelin.com') {
        sourceUrl = url;
      }
    } catch { /* ignore invalid URL */ }
  }

  if (!sourceUrl && typeof hit.name === 'string' && hit.name.length > 0) {
     const encodedName = encodeURIComponent(hit.name);
     sourceUrl = `https://guide.michelin.com/en/restaurants?search=${encodedName}`;
  } else if (!sourceUrl) {
     if (typeof hit.name === 'string' && hit.name.length > 0) {
        const encodedName = encodeURIComponent(hit.name);
        sourceUrl = `https://guide.michelin.com/en/restaurants?search=${encodedName}`;
     } else {
        return null; // Cannot form valid source URL
     }
  }

  return {
    stars,
    bib: isBib,
    green: isGreen,
    year: validYear,
    sourceUrl,
    _id: numericId, // Internal marker for matching
    _lat: lat,      // Internal marker for distance calc
    _lng: lng       // Internal marker for distance calc
  };
}

function michelinDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth’s mean radius in meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

async function fetchParseData(query: string): Promise<any[]> {
  const apiKey = getParseApiKey();
  const params = new URLSearchParams({
    query,
    limit: '100',
    page: '0'
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PARSE_TIMEOUT_MS);

  try {
    const response = await fetch(`${MICHELIN_API_BASE_URL}?${params.toString()}`, {
      headers: {
        'X-API-Key': apiKey,
        'Accept': 'application/json'
      },
      signal: controller.signal
    });

    if (response.status === 429) throw new Error('rate_limited');
    if (response.status === 402) throw new Error('michelin_quota');
    if (!response.ok) throw new Error('michelin_unavailable');

    const bodyText = await response.text();
    let json: any;
    try {
      json = JSON.parse(bodyText);
    } catch (error) {
      throw new Error('michelin_unavailable',{cause:error});
    }

    if (json.status !== 'success' || !json.data || !Array.isArray(json.data.hits)) {
      throw new Error('michelin_unavailable');
    }

    clearTimeout(timeoutId);
    const hits = json.data.hits;

    if (hits.length > 100) hits.length = 100;

    const normalizedAwards: any[] = [];
    for (const hit of hits) {
      const norm = normalizeMichelinHit(hit);
      if (norm) {
        normalizedAwards.push(norm);
      }
    }

    return normalizedAwards;

  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.message === 'rate_limited' || error.message === 'michelin_quota' || error.message === 'michelin_unavailable') {
      throw error;
    }
    throw new Error('michelin_unavailable',{cause:error});
  }
}

function getCacheEntry(key: string): any[] | null {
  const entry = michelinCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiry) {
    michelinCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCacheEntry(key: string, data: any[]): void {
  if (michelinCache.size >= MAX_CACHE_ENTRIES) {
    const firstKey = michelinCache.keys().next().value;
    if (firstKey !== undefined) {
      michelinCache.delete(firstKey);
    }
  }
  michelinCache.set(key, { data, expiry: Date.now() + MICHELIN_CACHE_TTL_MS });
}

const MAX_MICHELIN_LOOKUPS = 10;
const SHARED_MICHELIN_TTL_MS = 7 * 24 * 3600 * 1000; // Michelin awards change about once a year.
let parseBackoffUntil = 0;

// Edge function instances don't share memory, so successful lookups (including "no award")
// are also kept in Postgres (public.michelin_lookup_cache, service role only).
function sharedCacheConfig(): { url: string; key: string } | null {
  const url = Deno.env.get('SUPABASE_URL'); const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  return url && key ? { url, key } : null;
}
async function readSharedMichelinCache(key: string): Promise<any[] | null> {
  const cfg = sharedCacheConfig(); if (!cfg) return null;
  try {
    const r = await fetch(`${cfg.url}/rest/v1/michelin_lookup_cache?select=data&key=eq.${encodeURIComponent(key)}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}`, {
      headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}` }, signal: AbortSignal.timeout(2500),
    });
    if (!r.ok) return null;
    const rows = await r.json();
    return Array.isArray(rows) && rows.length && Array.isArray(rows[0]?.data) ? rows[0].data : null;
  } catch { return null; }
}
async function writeSharedMichelinCache(key: string, data: any[]): Promise<void> {
  const cfg = sharedCacheConfig(); if (!cfg || key.length > 300) return;
  try {
    await fetch(`${cfg.url}/rest/v1/michelin_lookup_cache?on_conflict=key`, {
      method: 'POST',
      headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ key, data, expires_at: new Date(Date.now() + SHARED_MICHELIN_TTL_MS).toISOString() }),
      signal: AbortSignal.timeout(2500),
    });
  } catch { /* cache is best effort */ }
}

function michelinCandidate(item: any): { ids: number[]; lat: number; lon: number; name: string; country: string } | null {
  const ext = item?.external?.michelin;
  if (!Array.isArray(ext) || ext.length === 0) return null;
  const ids = ext.map((e: any) => String(e?.id ?? '')).filter((s: string) => /^\d{1,15}$/.test(s)).map(Number);
  const lat = item?.location?.lat, lon = item?.location?.lon;
  const name = typeof item?.name === 'string' ? item.name.trim() : '';
  if (!ids.length || !Number.isFinite(lat) || !Number.isFinite(lon) || !name || name.length > 120) return null;
  const country = typeof item?.properties?.geocode?.country_code === 'string' ? item.properties.geocode.country_code.trim() : '';
  return { ids, lat, lon, name, country };
}

async function lookupMichelinAward(item: any): Promise<MichelinAward | null> {
  const c = michelinCandidate(item);
  if (!c) return null;
  const cacheKey = JSON.stringify(['name', c.country, c.name.toLowerCase()]);
  let awards = getCacheEntry(cacheKey);
  if (!awards) {
    let flight = inFlightRequests.get(cacheKey);
    if (!flight) {
      flight = (async () => {
        const shared = await readSharedMichelinCache(cacheKey);
        if (shared) return shared;
        // parse.bot rate-limits bursts; after a 429 stop calling it from this instance for a minute.
        if (Date.now() < parseBackoffUntil) throw new Error('rate_limited');
        try {
          const fresh = await fetchParseData(c.name);
          void writeSharedMichelinCache(cacheKey, fresh);
          return fresh;
        } catch (e) {
          if (e instanceof Error && e.message === 'rate_limited') parseBackoffUntil = Date.now() + 60_000;
          throw e;
        }
      })().finally(() => inFlightRequests.delete(cacheKey));
      inFlightRequests.set(cacheKey, flight);
    }
    awards = await flight;
    setCacheEntry(cacheKey, awards);
  }
  for (const award of awards) {
    if (c.ids.includes(award._id) && michelinDistanceMeters(c.lat, c.lon, award._lat, award._lng) <= DISTANCE_THRESHOLD_M) {
      return { stars: award.stars, bib: award.bib, green: award.green, year: award.year, sourceUrl: award.sourceUrl };
    }
  }
  return null;
}

function michelinSelectionFallback(item: any): MichelinAward | undefined {
  const c = michelinCandidate(item);
  if (!c) return undefined;
  return { stars: 0, bib: false, green: false, sourceUrl: `https://guide.michelin.com/en/restaurants?search=${encodeURIComponent(c.name)}` };
}

async function mapLimited<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i]); }
  }));
  return out;
}

// Michelin filter: look each Qloo place up by name (Qloo already returned only places with a Michelin id).
// A region-wide query overflowed the 100-hit cap in big cities and failed the whole request.
async function filterMichelinPlaces(raw: any[], filter: MichelinFilter): Promise<any[]> {
  const candidates = (raw || []).filter(item => michelinCandidate(item)).slice(0, MAX_MICHELIN_LOOKUPS);
  if (!candidates.length) return [];
  let failures = 0; let lastError: Error | null = null;
  const awards = await mapLimited(candidates, CONCURRENCY_LIMIT, async item => {
    try { return await lookupMichelinAward(item); }
    catch (e) { failures++; lastError = e instanceof Error ? e : new Error('michelin_unavailable'); return null; }
  });
  if (failures === candidates.length && lastError) throw lastError;
  const requestedOnlyGreen = filter.awards.length === 1 && filter.awards[0] === 'green';
  let anyGreen = false;
  const results: any[] = [];
  candidates.forEach((item, i) => {
    const a = awards[i];
    if (!a) return;
    if (a.green) anyGreen = true;
    if (a.stars > filter.maxStars) return;
    if ((a.bib && filter.awards.includes('bib')) || (a.green && filter.awards.includes('green')) || (a.stars >= 1 && filter.awards.includes('star'))) {
      item._michelin = a;
      results.push(item);
    }
  });
  if (requestedOnlyGreen && !anyGreen) throw new Error('michelin_green_unavailable');
  return results;
}

// Badge for ordinary restaurant results: best effort, never fails or slows the search much.
async function annotateMichelin(items: any[]): Promise<void> {
  const candidates = items.filter(item => !item._michelin && michelinCandidate(item)).slice(0, 5);
  if (!candidates.length) return;
  const budget = new Promise<null>(resolve => setTimeout(() => resolve(null), 4000));
  await Promise.race([
    mapLimited(candidates, CONCURRENCY_LIMIT, async item => {
      try { item._michelin = (await lookupMichelinAward(item)) ?? michelinSelectionFallback(item); }
      catch { item._michelin = michelinSelectionFallback(item); }
    }),
    budget,
  ]);
  for (const item of candidates) if (!item._michelin) item._michelin = michelinSelectionFallback(item);
}


function toPlaceResult(p: any): QlooPlaceResult | null {
      if (typeof p.name !== 'string' || !p.name.trim() || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(p.entity_id || p.id || '')) return null;
      const name = p.name;
      const addressProps = p.properties?.address;
      const geocodeAddr = p.properties?.geocode?.formatted_address;
      const address = typeof addressProps === 'string' ? addressProps : (typeof geocodeAddr === 'string' ? geocodeAddr : '');

      const descRaw = p.properties?.description || p.properties?.short_description;
      const description = descRaw ? String(descRaw).substring(0, 400) : undefined;

      // Construct Google Maps URL strictly
      const queryStr = encodeURIComponent(`${name} ${address}`.trim());
      const googlePlaceId=p.external?.google_place?.[0]?.place_id;
      const placeSuffix=typeof googlePlaceId==='string' && /^[A-Za-z0-9_-]{10,200}$/.test(googlePlaceId) ? `&query_place_id=${encodeURIComponent(googlePlaceId)}` : '';
      const url = `https://www.google.com/maps/search/?api=1&query=${queryStr}${placeSuffix}`;

      return {
        michelin:p._michelin,
        id: p.id || p.entity_id || '',
        name,
        address,
        description,
        hours: p.properties?.hours && typeof p.properties.hours==='object' && !Array.isArray(p.properties.hours) ? Object.fromEntries(['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].filter(day=>Array.isArray(p.properties.hours[day])).map(day=>[day,p.properties.hours[day].slice(0,4).map((h:any)=>({opens:typeof h?.opens==='string'?h.opens.slice(0,10):undefined,closes:typeof h?.closes==='string'?h.closes.slice(0,10):undefined,closed:h?.closed===true?true:undefined}))])) : undefined,
        latitude: Number.isFinite(p.location?.lat) && Math.abs(p.location.lat)<=90 ? p.location.lat : undefined,
        longitude: Number.isFinite(p.location?.lon) && Math.abs(p.location.lon)<=180 ? p.location.lon : undefined,
        rating: Number.isFinite(p.properties?.business_rating) && p.properties.business_rating >= 0 && p.properties.business_rating <= 5 ? p.properties.business_rating : undefined,
        ratingSource: Number.isFinite(p.properties?.business_rating) ? 'qloo' as const : undefined,
        priceLevel: Number.isInteger(p.properties?.price_level) && p.properties.price_level >= 1 && p.properties.price_level <= 4 ? p.properties.price_level : undefined,
        url,
      };
}

const NEARBY_MICHELIN_RADIUS = 50000; // ~1 hour by car in a metro area (straight-line estimate).
// Best effort, bounded by its own time budget so normal results never wait long for it.
async function findNearbyMichelin(qlooApiUrl: string, qlooApiKey: string, base: URLSearchParams, excludedIds: Set<string>, excludedKeys: string[]): Promise<QlooPlaceResult[]> {
  const lookup = async (params: URLSearchParams) => {
    params.set('filter.external.exists', 'michelin');
    params.set('filter.location.radius', String(NEARBY_MICHELIN_RADIUS));
    params.set('take', '12');
    params.delete('filter.popularity.min');
    params.delete('filter.popularity.max');
    params.delete('filter.price_level.max');
    const res = await qlooFetch(`${qlooApiUrl}/v2/insights?${params}`, { headers: { 'X-Api-Key': qlooApiKey }, signal: AbortSignal.timeout(6000) });
    if (!res.ok) return [];
    const data = await res.json() as any;
    const raw = (Array.isArray(data.results?.entities) ? data.results.entities : []).filter((p: any) => !isFavoritePlace(p, excludedIds, excludedKeys));
    const found = await filterMichelinPlaces(raw, { awards: ['bib', 'green', 'star'], maxStars: 3 });
    // Stars first, then Bib Gourmand, then Green Star.
    found.sort((a, b) => (b._michelin.stars - a._michelin.stars) || (Number(b._michelin.bib) - Number(a._michelin.bib)));
    return found.map(toPlaceResult).filter(Boolean) as QlooPlaceResult[];
  };
  const work = (async () => {
    const params = new URLSearchParams(base);
    const tags = (params.get('filter.tags') || '').split(',').filter(Boolean);
    const strict = params.get('operator.filter.tags') === 'intersection' && tags.length > 1;
    const places = await lookup(params);
    // A pasta or pho search rarely has a Michelin match of that exact cuisine; show any nearby Michelin restaurant instead.
    if (places.length || !strict) return places;
    const relaxed = new URLSearchParams(base);
    relaxed.set('filter.tags', tags[0]);
    relaxed.delete('operator.filter.tags');
    return lookup(relaxed);
  })().catch(() => [] as QlooPlaceResult[]);
  const budget = new Promise<QlooPlaceResult[]>(resolve => setTimeout(() => resolve([]), 9000));
  return Promise.race([work, budget]);
}

async function handleRecommend(qlooApiKey: string, qlooApiUrl: string, interests: string[], location: { latitude: number; longitude: number }, options: {michelin?:MichelinFilter|null;category?: string;mode?: string;cuisine?: string;priceMax?: number;radius?: number;drink?: string;foodApproach?: string;shoppingKind?: string;foodQuery?: string;searchQuery?:string;openNow?:boolean;language?:string;skipNearbyMichelin?:boolean} = {}, excludedNames: string[] = []): Promise<{ places: QlooPlaceResult[]; michelinNearby?: QlooPlaceResult[] } | Response> {
  // Optional explicit entities; generic tastes are represented by tags.
  if (interests.length > 3) {
    return new Response(JSON.stringify({ error: 'invalid_interest_count' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const uniqueInterests = [...new Set(interests)];
  if (uniqueInterests.length !== interests.length) {
     return new Response(JSON.stringify({ error: 'duplicate_interests' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  for (const i of interests) {
    if (!uuidRegex.test(i)) {
      return new Response(JSON.stringify({ error: 'invalid_interest_uuid' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
  }

  if (!Array.isArray(excludedNames) || excludedNames.length > 10 || excludedNames.some(n => typeof n !== 'string' || !n.trim() || n.length > 200)) return Response.json({error:'invalid_exclusions'}, {status:400});
  const excludedIds = new Set(interests.map(id => id.toLowerCase()));
  const excludedKeys = excludedNames.map(n => favoriteNameKey(n.replace(/\s+[-–—|]\s+.*$|\s*\([^)]*\)\s*$/gu, ''))).filter(Boolean);

  // Validate Location
  const { latitude, longitude } = location;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return new Response(JSON.stringify({ error: 'invalid_location_numbers' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return new Response(JSON.stringify({ error: 'location_out_of_bounds' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const category = options.category ?? 'food';
  const mode = options.mode ?? 'balanced';
  const cuisine = options.cuisine ?? 'any';
  const radius = options.radius ?? 15000;
  const priceMax = options.priceMax ?? 0;
  const drink = options.drink ?? 'any';
  const shoppingKind=options.shoppingKind ?? 'any';
  const foodApproach=options.foodApproach ?? 'familiar';
  const filterCuisine=options.foodQuery || foodApproach==='familiar'?cuisine:'any';
  const foodQuery=options.foodQuery ?? '';
  if(typeof foodQuery!=='string' || (foodQuery!=='' && !/^[a-z][a-z -]{1,59}$/.test(foodQuery))) return Response.json({error:'unsupported_preference'},{status:422});
  if (!['any','thrift','vintage','secondhand'].includes(shoppingKind) || !['food','shopping','visits'].includes(category) || !['balanced','popular','discover'].includes(mode)
    || !['any','korean','japanese','italian','mexican','american','vegetarian','vietnamese','thai','chinese','indian','french','mediterranean','greek','spanish','brazilian'].includes(cuisine)
    || !['familiar','local','both'].includes(foodApproach) || !['any','matcha'].includes(drink) || ![5000,15000,30000].includes(radius) || !Number.isInteger(priceMax) || priceMax < 0 || priceMax > 4) {
    return Response.json({error:'invalid_options'}, {status:400});
  }
  const michelin=options.michelin;
  if(michelin && (category!=='food'||!Array.isArray(michelin.awards)||!michelin.awards.length||michelin.awards.length>3||michelin.awards.some(a=>!['bib','green','star'].includes(a))||!Number.isInteger(michelin.maxStars)||michelin.maxStars<0||michelin.maxStars>3))return Response.json({error:'invalid_options'},{status:400});
  if(!michelin && Deno.env.get('GOOGLE_PLACES_API_KEY'))return handlePlacesHybrid(Deno.env.get('GOOGLE_PLACES_API_KEY')!,qlooApiKey,qlooApiUrl,interests,location,options,excludedNames);
  let dishTag:string|undefined;
  if(category==='food' && foodQuery){
    try{dishTag=await resolveFoodTag(qlooApiKey,qlooApiUrl,foodQuery);}catch(error){const code=error instanceof Error&&['unsupported_preference','rate_limited'].includes(error.message)?error.message:'upstream_error';return Response.json({error:code},{status:code==='unsupported_preference'?422:code==='rate_limited'?429:502});}
  }
  const filterLocationStr = `POINT(${Math.round(longitude * 100) / 100} ${Math.round(latitude * 100) / 100})`;
  const interestsStr = interests.join(',');

  const params = new URLSearchParams({
    'filter.type': 'urn:entity:place',
    'filter.location': filterLocationStr,
    'filter.location.radius': String(radius),
    'take': '20',
    'feature.explainability': 'true',
  });

  if(michelin)params.set('filter.external.exists','michelin');
  if (interestsStr) params.set('filter.exclude.entities',interestsStr);

  const categoryTag = category === 'food' ? 'urn:tag:category:place:restaurant'
    : category === 'shopping' ? 'urn:tag:category:place:shopping_mall,urn:tag:category:place:clothing_store,urn:tag:category:place:store' : 'urn:tag:category:place:tourist_attraction';
  params.set('filter.tags', categoryTag);
  if(category==='shopping' && shoppingKind!=='any'){
    const tags=shoppingKind==='thrift'?['thrift_store']:shoppingKind==='vintage'?['vintage_clothing_store']:['thrift_store','vintage_clothing_store','consignment_shop','used_clothing_store'];
    params.set('filter.tags',tags.map(t=>'urn:tag:genre:place:'+t).join(','));
    params.set('filter.exclude.tags','urn:tag:category:place:shopping_mall,urn:tag:category:place:book_store');
  }
  if (interestsStr && (category!=='food' || (foodApproach!=='local' && filterCuisine==='any' && !dishTag))) params.set('signal.interests.entities',interestsStr);
  if (category === 'food' && cuisine !== 'any' && foodApproach!=='local') params.set('signal.interests.tags',`urn:tag:genre:place:restaurant:${cuisine}`);
  if (category === 'visits') params.set('filter.exclude.tags','urn:tag:category:place:restaurant,urn:tag:category:place:grocery_store');
  if (category === 'food') {
    params.set('filter.exclude.tags','urn:tag:category:place:shopping_mall');
    if (filterCuisine !== 'any') {
      params.set('filter.tags', `${categoryTag},urn:tag:genre:place:restaurant:${filterCuisine}`);
      params.set('operator.filter.tags','intersection');
    }
    if(dishTag){params.set('filter.tags',[params.get('filter.tags'),dishTag].filter(Boolean).join(','));params.set('operator.filter.tags','intersection');}
    if (priceMax) params.set('filter.price_level.max',String(priceMax));
  }
  if (mode === 'popular') params.set('filter.popularity.min','0.95');
  if (mode === 'discover') params.set('filter.popularity.max','0.95');
  try {
    const signal = AbortSignal.timeout(12000);

    const discoverParams = new URLSearchParams(params);
    discoverParams.set('filter.popularity.max','0.95');
    discoverParams.set('take','10');
    if (category === 'food' && drink === 'matcha' && !dishTag) {
      discoverParams.set('filter.tags','urn:tag:category:place:cafe,urn:tag:menu_highlight:qloo:matcha_latte');
      discoverParams.set('operator.filter.tags','intersection');
      discoverParams.set('signal.interests.tags','urn:tag:menu_highlight:qloo:matcha_latte');
      discoverParams.delete('filter.popularity.max');
      if (mode === 'discover') discoverParams.set('filter.popularity.max','0.95');
    }
    const discoveries = (mode === 'balanced' || (category === 'food' && drink === 'matcha' && !dishTag)) ? fetch(`${qlooApiUrl}/v2/insights?${discoverParams}`, {
      headers:{'X-Api-Key':qlooApiKey}, signal,
    }).then(async r => r.ok ? (await r.json()).results?.entities ?? [] : []).catch(() => []) : null;
    const res = await qlooFetch(`${qlooApiUrl}/v2/insights?${params.toString()}`, {
      method: 'GET',
      headers: {
        'X-Api-Key': qlooApiKey,
      },
      signal,
    });


    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        return new Response(JSON.stringify({ error: 'config_error' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
      }
      if (res.status === 429) {
        return new Response(JSON.stringify({ error: 'rate_limited' }), { status: 429, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ error: 'upstream_error' }), { status: 502, headers: { 'Content-Type': 'application/json' } });
    }

    const data = await res.json() as any;
    if (data.success === false) return Response.json({error: 'upstream_error'}, {status:502});
    // "멀지만 미쉐린": Michelin restaurants within roughly an hour's drive, shown beside normal food results.
    // Started after the main query so we don't fire three Qloo calls at once (Qloo 429s bursts).
    const nearbyMichelin = category === 'food' && !michelin && !options.skipNearbyMichelin
      ? findNearbyMichelin(qlooApiUrl, qlooApiKey, params, excludedIds, excludedKeys) : null;
    let rawPlaces = Array.isArray(data.results?.entities) ? data.results.entities : [];
    rawPlaces = rawPlaces.filter((p: any) => !isFavoritePlace(p, excludedIds, excludedKeys));
    if (discoveries) {
      const extra = (await discoveries).filter((p: any) => !isFavoritePlace(p, excludedIds, excludedKeys));
      if (Array.isArray(extra) && extra.length) rawPlaces = [...rawPlaces.slice(0,3), ...extra.slice(0,2), ...rawPlaces.slice(3), ...extra.slice(2)]
        .filter((p, i, a) => a.findIndex(x => x.entity_id === p.entity_id) === i);
    }

    if(category==='shopping' && shoppingKind!=='any'){
      const allowed=shoppingKind==='thrift'?['thrift_store']:shoppingKind==='vintage'?['vintage_clothing_store']:['thrift_store','vintage_clothing_store','consignment_shop','used_clothing_store'];
      rawPlaces=rawPlaces.filter((p:any)=>{
        const ids=[p.properties?.primary_genre?.id,...(Array.isArray(p.tags)?p.tags.map((t:any)=>t.id||t.tag_id):[])].filter((x:any)=>typeof x==='string');
        const primary=p.properties?.primary_genre?.id;
        if(typeof primary==='string' && !allowed.some(t=>primary==='urn:tag:genre:place:'+t)) return false;
        return ids.some((id:string)=>allowed.some(t=>id==='urn:tag:genre:place:'+t || id==='urn:tag:category:place:'+t)) && !ids.includes('urn:tag:category:place:shopping_mall') && !ids.includes('urn:tag:category:place:book_store');
      });
    }
    if(category==='food' && (filterCuisine!=='any' || dishTag))rawPlaces=rawPlaces.filter((p:any)=>matchesFoodConstraint(p,filterCuisine,dishTag) || (!dishTag && drink==='matcha' && Array.isArray(p.tags) && p.tags.some((t:any)=>t.id==='urn:tag:menu_highlight:qloo:matcha_latte')));
    if(michelin)rawPlaces=await filterMichelinPlaces(rawPlaces,michelin);
    else if(category==='food')await annotateMichelin(rawPlaces.slice(0,6));
    const places: QlooPlaceResult[] = rawPlaces.map(toPlaceResult).filter(Boolean).slice(0, 5) as QlooPlaceResult[];

    // Exact dish tags are sparse in Qloo (e.g. "pasta" matched 0-1 Italian places in Irvine).
    // Top up with same-cuisine places so a common dish never returns an empty or single result.
    if (dishTag && places.length < 3 && !michelin && cuisine !== 'any') {
      const broader = await handleRecommend(qlooApiKey, qlooApiUrl, interests, location, { ...options, foodQuery: '', foodApproach: 'familiar', drink: 'any', skipNearbyMichelin: true }, excludedNames);
      if (!(broader instanceof Response)) {
        for (const p of broader.places) {
          if (places.length >= 5) break;
          if (!places.some(x => x.id === p.id)) places.push(p);
        }
      }
    }

    let michelinNearby: QlooPlaceResult[] = [];
    if (nearbyMichelin) {
      const ids = new Set(places.map(p => p.id));
      michelinNearby = (await nearbyMichelin).filter(p => !ids.has(p.id)).slice(0, 3);
    }
    return michelinNearby.length ? { places, michelinNearby } : { places };
  } catch (error) {

    const code=error instanceof Error && ['michelin_unavailable','michelin_green_unavailable','michelin_quota','rate_limited'].includes(error.message)?error.message:'timeout';
    return new Response(JSON.stringify({ error: code }), { status: 502, headers: { 'Content-Type': 'application/json' } });
  }
}

async function guestTasteQuota(id: string, operation: 'status'|'consume'|'refund'): Promise<number> {
  const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const supabaseUrl=Deno.env.get('SUPABASE_URL');
  if(!serviceKey || !supabaseUrl) throw new Error('guest_quota_unavailable');
  const response=await fetch(`${supabaseUrl}/rest/v1/rpc/guest_taste_quota`, {
    method:'POST',headers:{apikey:serviceKey,Authorization:`Bearer ${serviceKey}`,'Content-Type':'application/json'},
    body:JSON.stringify({p_guest_id:id,p_operation:operation}),signal:AbortSignal.timeout(8000),
  });
  if(!response.ok) throw new Error('guest_quota_unavailable');
  const used=await response.json();
  if(!Number.isInteger(used) || used < -1 || used > 10) throw new Error('guest_quota_unavailable');
  return used;
}

export async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const origin = req.headers.get('Origin');
  const corsHeaders = getCorsHeaders(origin);

  // Handle Preflight
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    return Response.json({error:'forbidden_origin'}, {status:403,headers:{'Cache-Control':'no-store'}});
  }
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // Health Check
  if (req.method === 'GET') {
    const apiKey = Deno.env.get('QLOO_API_KEY');
    return new Response(
      JSON.stringify({ enabled: Boolean(apiKey) }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Main Proxy Endpoint
  if (req.method !== 'GET') {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const qlooApiKey = Deno.env.get('QLOO_API_KEY');
    if (!qlooApiKey) {
      return new Response(JSON.stringify({ error: 'not_configured' }), { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let qlooApiUrl = Deno.env.get('QLOO_API_URL');
    const allowedUrls = ['https://api.qloo.com', 'https://staging.api.qloo.com', 'https://hackathon.api.qloo.com'];
    if (!qlooApiUrl || !allowedUrls.includes(qlooApiUrl)) {
      qlooApiUrl = 'https://api.qloo.com';
    }

    // Registered sessions and browser guest trials share the same recommendation flow.
    const authHeader = req.headers.get('Authorization');
    const guestCredential=!authHeader || authHeader===`Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`;
    let userSession;
    if(!guestCredential) {
      try { userSession=await verifyUserSession(authHeader); }
      catch {return Response.json({error:'auth_unavailable'}, {status:503,headers:corsHeaders});}
    }
    const guestId=guestCredential ? req.headers.get('X-Guest-Taste-Id') : null;
    if(!userSession && (!guestId || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(guestId)))
      return Response.json({error:'unauthorized'},{status:401,headers:corsHeaders});
    if (!checkRateLimit(userSession?.userId || `guest:${guestId}`))
      return Response.json({error:'rate_limited'}, {status:429,headers:corsHeaders});

    // Parse Body with Size Limit
    const contentLength = Number(req.headers.get('Content-Length') || 0);
    if (contentLength > 4096) {
       return new Response(JSON.stringify({ error: 'payload_too_large' }), { status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let bodyText: string;
    try {
      bodyText = await req.text();
      if (new TextEncoder().encode(bodyText).length > 4096) {
         return new Response(JSON.stringify({ error: 'payload_too_large' }), { status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    } catch (e) {
      return new Response(JSON.stringify({ error: 'bad_request' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let payload: any;
    try {
      payload = JSON.parse(bodyText);
    } catch (e) {
      return new Response(JSON.stringify({ error: 'malformed_json' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
      return new Response(JSON.stringify({ error: 'invalid_payload_structure' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const action = payload.action;
    let guestRemaining: number|undefined;
    let guestReserved=false;
    try {
      if(guestId) {
        const used=await guestTasteQuota(guestId,'status');
        guestRemaining=10-used;
        if(action==='guest_status') return Response.json({guestRemaining},{headers:corsHeaders});
        if(guestRemaining===0) return Response.json({error:'guest_limit_reached',guestRemaining:0},{status:403,headers:corsHeaders});
      }

      if (action === 'search') {
        if (typeof payload.query !== 'string' || typeof payload.type !== 'string') return Response.json({error:'bad_request'}, {status:400,headers:corsHeaders});
        const result = await handleSearch(qlooApiKey, qlooApiUrl!, payload.query, payload.type);
        if (result instanceof Response) {
          return new Response(result.body, { status: result.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        return new Response(JSON.stringify({ entities: result }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (action === 'recommend') {
        if (!Array.isArray(payload.interests) || payload.interests.some((id: unknown) => typeof id !== 'string') || !payload.location || typeof payload.location !== 'object') return Response.json({error:'bad_request'}, {status:400,headers:corsHeaders});
        if (payload.options != null && (typeof payload.options !== 'object' || Array.isArray(payload.options))) return Response.json({error:'invalid_options'}, {status:400,headers:corsHeaders});
        if(guestId) {
          const used=await guestTasteQuota(guestId,'consume');
          if(used===-1) return Response.json({error:'guest_limit_reached',guestRemaining:0},{status:403,headers:corsHeaders});
          guestReserved=true;guestRemaining=10-used;
        }
        const result = await handleRecommend(qlooApiKey, qlooApiUrl!, payload.interests, payload.location, payload.options || {}, payload.excludedNames ?? []);
        if (result instanceof Response) {
          if(guestId && guestReserved) {await guestTasteQuota(guestId,'refund');guestReserved=false;}
          return new Response(result.body, { status: result.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        if(guestId && !result.places.length) {const used=await guestTasteQuota(guestId,'refund');guestRemaining=10-used;guestReserved=false;}
        guestReserved=false;
        return new Response(JSON.stringify({...result,...(guestId?{guestRemaining}:{})}), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      return new Response(JSON.stringify({ error: 'unknown_action' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    } catch (error) {
      if(guestId && guestReserved) try {await guestTasteQuota(guestId,'refund');} catch { /* Persisted reservation remains conservative. */ }
      return new Response(JSON.stringify({ error: guestId ? 'guest_quota_unavailable' : 'internal_server_error' }), { status: guestId ? 503 : 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
  }

  return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(handleRequest);
