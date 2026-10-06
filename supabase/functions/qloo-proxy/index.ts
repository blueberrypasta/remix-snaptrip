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
  id: string;
  name: string;
  address: string;
  description?: string;
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

    const res = await fetch(`${qlooApiUrl}/search?${searchParams.toString()}`, {
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

async function handleRecommend(qlooApiKey: string, qlooApiUrl: string, interests: string[], location: { latitude: number; longitude: number }, options: {category?: string;mode?: string;cuisine?: string;priceMax?: number;radius?: number;drink?: string;foodApproach?: string} = {}, excludedNames: string[] = []): Promise<{ places: QlooPlaceResult[] } | Response> {
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

  if (!Array.isArray(excludedNames) || excludedNames.length > 3 || excludedNames.some(n => typeof n !== 'string' || !n.trim() || n.length > 200)) return Response.json({error:'invalid_exclusions'}, {status:400});
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
  const foodApproach=options.foodApproach ?? 'familiar';
  const filterCuisine=foodApproach==='familiar'?cuisine:'any';
  if (!['food','shopping','visits'].includes(category) || !['balanced','popular','discover'].includes(mode)
    || !['any','korean','japanese','italian','mexican','american','vegetarian'].includes(cuisine)
    || !['familiar','local','both'].includes(foodApproach) || !['any','matcha'].includes(drink) || ![5000,15000,30000].includes(radius) || !Number.isInteger(priceMax) || priceMax < 0 || priceMax > 4) {
    return Response.json({error:'invalid_options'}, {status:400});
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

  if (interestsStr) params.set('filter.exclude.entities',interestsStr);

  const categoryTag = category === 'food' ? 'urn:tag:category:place:restaurant'
    : category === 'shopping' ? 'urn:tag:category:place:shopping_mall,urn:tag:category:place:clothing_store,urn:tag:category:place:store' : 'urn:tag:category:place:tourist_attraction';
  params.set('filter.tags', categoryTag);
  if (interestsStr && (category!=='food' || foodApproach!=='local')) params.set('signal.interests.entities',interestsStr);
  if (category === 'food' && cuisine !== 'any' && foodApproach!=='local') params.set('signal.interests.tags',`urn:tag:genre:place:restaurant:${cuisine}`);
  if (category === 'visits') params.set('filter.exclude.tags','urn:tag:category:place:restaurant,urn:tag:category:place:grocery_store');
  if (category === 'food') {
    params.set('filter.exclude.tags','urn:tag:category:place:shopping_mall');
    if (filterCuisine !== 'any') {
      params.set('filter.tags', `${categoryTag},urn:tag:genre:place:restaurant:${filterCuisine}`);
      params.set('operator.filter.tags','intersection');
    }
    if (priceMax) params.set('filter.price_level.max',String(priceMax));
  }
  if (mode === 'popular') params.set('filter.popularity.min','0.95');
  if (mode === 'discover') params.set('filter.popularity.max','0.95');
  try {
    const signal = AbortSignal.timeout(12000);

    const discoverParams = new URLSearchParams(params);
    discoverParams.set('filter.popularity.max','0.95');
    discoverParams.set('take','10');
    if (category === 'food' && drink === 'matcha') {
      discoverParams.set('filter.tags','urn:tag:category:place:cafe,urn:tag:menu_highlight:qloo:matcha_latte');
      discoverParams.set('operator.filter.tags','intersection');
      discoverParams.set('signal.interests.tags','urn:tag:menu_highlight:qloo:matcha_latte');
      discoverParams.delete('filter.popularity.max');
      if (mode === 'discover') discoverParams.set('filter.popularity.max','0.95');
    }
    const discoveries = (mode === 'balanced' || (category === 'food' && drink === 'matcha')) ? fetch(`${qlooApiUrl}/v2/insights?${discoverParams}`, {
      headers:{'X-Api-Key':qlooApiKey}, signal,
    }).then(async r => r.ok ? (await r.json()).results?.entities ?? [] : []).catch(() => []) : null;
    const res = await fetch(`${qlooApiUrl}/v2/insights?${params.toString()}`, {
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
    let rawPlaces = Array.isArray(data.results?.entities) ? data.results.entities : [];
    rawPlaces = rawPlaces.filter((p: any) => !isFavoritePlace(p, excludedIds, excludedKeys));
    if (discoveries) {
      const extra = (await discoveries).filter((p: any) => !isFavoritePlace(p, excludedIds, excludedKeys));
      if (Array.isArray(extra) && extra.length) rawPlaces = [...rawPlaces.slice(0,3), ...extra.slice(0,2), ...rawPlaces.slice(3), ...extra.slice(2)]
        .filter((p, i, a) => a.findIndex(x => x.entity_id === p.entity_id) === i);
    }

    const places: QlooPlaceResult[] = rawPlaces.map((p: any) => {
      if (typeof p.name !== 'string' || !p.name.trim() || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(p.entity_id || p.id || '')) return null;
      const name = p.name;
      const addressProps = p.properties?.address;
      const geocodeAddr = p.properties?.geocode?.formatted_address;
      const address = typeof addressProps === 'string' ? addressProps : (typeof geocodeAddr === 'string' ? geocodeAddr : '');

      const descRaw = p.properties?.description;
      const description = descRaw ? String(descRaw).substring(0, 400) : undefined;

      // Construct Google Maps URL strictly
      const queryStr = encodeURIComponent(`${name} ${address}`.trim());
      const url = `https://www.google.com/maps/search/?api=1&query=${queryStr}`;

      return {
        id: p.id || p.entity_id || '',
        name,
        address,
        description,
        url,
      };
    }).filter(Boolean).slice(0, 5);

    return { places };
  } catch (error) {

    return new Response(JSON.stringify({ error: 'timeout' }), { status: 502, headers: { 'Content-Type': 'application/json' } });
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
