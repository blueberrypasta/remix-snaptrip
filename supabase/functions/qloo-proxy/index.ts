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
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
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
      const subtype = e.subtype || e.type || '';
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

async function handleRecommend(qlooApiKey: string, qlooApiUrl: string, interests: string[], location: { latitude: number; longitude: number }): Promise<{ places: QlooPlaceResult[] } | Response> {
  // Validate Interests: 1-3 unique UUIDs
  if (interests.length < 1 || interests.length > 3) {
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

  // Validate Location
  const { latitude, longitude } = location;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return new Response(JSON.stringify({ error: 'invalid_location_numbers' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return new Response(JSON.stringify({ error: 'location_out_of_bounds' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const filterLocationStr = `${Math.round(latitude * 100) / 100},${Math.round(longitude * 100) / 100}`;
  const interestsStr = interests.join(',');

  const params = new URLSearchParams({
    'filter.type': 'urn:entity:place',
    'signal.interests.entities': interestsStr,
    'filter.location': filterLocationStr,
    'filter.location.radius': '15000',
    'take': '5',
    'feature.explainability': 'true',
  });

  try {
    const signal = AbortSignal.timeout(12000);

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
    const rawPlaces = Array.isArray(data.results?.entities) ? data.results.entities : [];

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

    // Verify User Session
    const authHeader = req.headers.get('Authorization');
    let userSession;
    try { userSession = await verifyUserSession(authHeader); }
    catch { return Response.json({error:'auth_unavailable'}, {status:503, headers:corsHeaders}); }

    if (!userSession) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Rate Limiting
    if (!checkRateLimit(userSession.userId)) {
      return new Response(JSON.stringify({ error: 'rate_limited' }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

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

    try {
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
        const result = await handleRecommend(qlooApiKey, qlooApiUrl!, payload.interests, payload.location);
        if (result instanceof Response) {
          return new Response(result.body, { status: result.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        return new Response(JSON.stringify(result), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      return new Response(JSON.stringify({ error: 'unknown_action' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    } catch (error) {

      return new Response(JSON.stringify({ error: 'internal_server_error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
  }

  return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(handleRequest);
