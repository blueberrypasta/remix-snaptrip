// Public guest credential; NOT per-user authentication. Does not guarantee identity or prevent quota abuse alone.
declare const Deno: { env: { get(k: string): string | undefined }; serve: (h: (r: Request) => Promise<Response>) => void } | undefined;

const ALLOWED_ORIGINS = new Set([
  'https://slaptrip.com', 'https://www.slaptrip.com',
  'http://localhost:3000', 'http://127.0.0.1:3000', 'http://127.0.0.1:4173',
]);
const MIME_REGEX = /^(image\/(jpeg|png|webp)|audio\/(webm|wav|mp4|mpeg|ogg))(;[a-zA-Z0-9_\-+.]+=([a-zA-Z0-9_\-+.]+|"[^"]*"))*$/i;
const B64_REGEX = /^[A-Za-z0-9+/=]+$/;

function err(status: number, message: string, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'vary': 'Origin', ...headers },
  });
}

async function readLimitedBody(body: ReadableStream<Uint8Array> | null, limit: number): Promise<string> {
  if (!body) return '';
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let total = 0, text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) { void reader.cancel().catch(() => {}); throw new RangeError('payload_too_large'); }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } finally {
    reader.releaseLock();
  }
}

async function hmacHex(keyStr: string, dataStr: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(keyStr), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(dataStr));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Supabase can keep multiple valid legacy anon JWTs in circulation after rotation.
// Verify alternate guest keys with Auth rather than requiring byte equality with the default key.
const validatedGuestKeys = new Map<string, number>();
async function validGuestKey(key: string, defaultKey: string, supaUrl: string): Promise<boolean> {
  if (key === defaultKey) return true;
  if ((validatedGuestKeys.get(key) || 0) > Date.now()) return true;
  if (key.length > 2048) return false;
  try {
    const parts = key.split('.');
    if (parts.length !== 3) return false;
    const claims = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (claims.role !== 'anon' || claims.ref !== new URL(supaUrl).hostname.split('.')[0]) return false;
    const response = await fetch(`${supaUrl}/auth/v1/settings`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(5000),
    });
    void response.body?.cancel();
    if (!response.ok) return false;
    if (validatedGuestKeys.size >= 4) validatedGuestKeys.delete(validatedGuestKeys.keys().next().value!);
    validatedGuestKeys.set(key, Date.now() + 10 * 60 * 1000);
    return true;
  } catch { return false; }
}

export async function handleRequest(req: Request): Promise<Response> {
  const origin = req.headers.get('origin');
  if (origin !== null && !ALLOWED_ORIGINS.has(origin)) return err(403, 'forbidden_origin');
  const corsHeaders: Record<string, string> = {
    'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'vary': 'Origin',
    ...(origin ? { 'access-control-allow-origin': origin, 'access-control-allow-headers': 'authorization,apikey,content-type,x-client-info', 'access-control-allow-methods': 'POST,OPTIONS' } : {}),
  };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return err(405, 'method_not_allowed', corsHeaders);

  const getEnv = (k: string) => (typeof Deno !== 'undefined' ? Deno.env.get(k) : (globalThis as any).process?.env?.[k]);
  const anonKey = getEnv('SUPABASE_ANON_KEY');
  const serviceKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');
  const supaUrl = getEnv('SUPABASE_URL');
  const geminiKey = getEnv('GEMINI_API_KEY');
  if (!anonKey || !serviceKey || !supaUrl || !geminiKey) return err(503, 'service_unavailable', corsHeaders);

  const apikey = req.headers.get('apikey');
  const auth = req.headers.get('authorization');
  if (!apikey || auth !== `Bearer ${apikey}` || !await validGuestKey(apikey, anonKey, supaUrl)) return err(401, 'unauthorized', corsHeaders);

  let raw: string;
  try { raw = await readLimitedBody(req.body, 3 * 1024 * 1024); } catch (e: any) {
    if (e?.message === 'payload_too_large') return err(413, 'payload_too_large', corsHeaders);
    return err(400, 'invalid_body', corsHeaders);
  }
  let parsed: any;
  try { parsed = JSON.parse(raw); } catch { return err(400, 'invalid_json', corsHeaders); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return err(400, 'invalid_root', corsHeaders);
  if (parsed.model !== 'gemini-3.1-flash-lite') return err(400, 'unsupported_model', corsHeaders);

  const contents = parsed.contents;
  if (!Array.isArray(contents) || contents.length < 1 || contents.length > 12) return err(400, 'invalid_contents', corsHeaders);

  let totalParts = 0, totalTextChars = 0;
  const cleanContents: any[] = [];
  for (const c of contents) {
    if (!c || (c.role !== 'user' && c.role !== 'model') || !Array.isArray(c.parts) || c.parts.length < 1 || c.parts.length > 20) return err(400, 'invalid_message', corsHeaders);
    const cleanParts: any[] = [];
    for (const p of c.parts) {
      if (!p || typeof p !== 'object') return err(400, 'invalid_part', corsHeaders);
      const hasText = 'text' in p;
      const hasInline = 'inlineData' in p;
      if ((hasText && hasInline) || (!hasText && !hasInline)) return err(400, 'mixed_or_empty_part', corsHeaders);
      if (hasText) {
        if (typeof p.text !== 'string' || p.text.length > 20000) return err(400, 'invalid_text_part', corsHeaders);
        totalTextChars += p.text.length;
        cleanParts.push({ text: p.text });
      } else {
        const d = p.inlineData;
        if (!d || typeof d !== 'object' || typeof d.mimeType !== 'string' || !MIME_REGEX.test(d.mimeType)) return err(400, 'invalid_inline_mime', corsHeaders);
        if (typeof d.data !== 'string' || d.data.length === 0 || d.data.length > 3 * 1024 * 1024 || !B64_REGEX.test(d.data)) return err(400, 'invalid_inline_data', corsHeaders);
        cleanParts.push({ inlineData: { mimeType: d.mimeType, data: d.data } });
      }
      totalParts++;
    }
    cleanContents.push({ role: c.role, parts: cleanParts });
  }
  if (totalParts > 40 || totalTextChars > 60000) return err(400, 'exceeded_limits', corsHeaders);

  const cleanBody: any = { contents: cleanContents };
  const rawSys = parsed.systemInstruction ?? parsed.generationConfig?.systemInstruction;
  if (rawSys !== undefined) {
    if (typeof rawSys === 'string') {
      if (rawSys.length > 20000) return err(400, 'system_instruction_too_long', corsHeaders);
      cleanBody.systemInstruction = { parts: [{ text: rawSys }] };
    } else if (rawSys && typeof rawSys === 'object' && Array.isArray(rawSys.parts) && rawSys.parts.length === 1 && typeof rawSys.parts[0]?.text === 'string') {
      if (rawSys.parts[0].text.length > 20000) return err(400, 'system_instruction_too_long', corsHeaders);
      cleanBody.systemInstruction = { parts: [{ text: rawSys.parts[0].text }] };
    } else return err(400, 'invalid_system_instruction', corsHeaders);
  }

  const gc = parsed.generationConfig;
  const cleanGC: any = { maxOutputTokens: 4096, thinkingConfig: { thinkingLevel: 'minimal' } };
  if (gc !== undefined && (!gc || typeof gc !== 'object' || Array.isArray(gc))) return err(400, 'invalid_gc', corsHeaders);
  if (gc && typeof gc === 'object') {
    if (gc.temperature !== undefined) { if (typeof gc.temperature !== 'number' || gc.temperature < 0 || gc.temperature > 2) return err(400, 'invalid_gc', corsHeaders); cleanGC.temperature = gc.temperature; }
    if (gc.topP !== undefined) { if (typeof gc.topP !== 'number' || gc.topP < 0 || gc.topP > 1) return err(400, 'invalid_gc', corsHeaders); cleanGC.topP = gc.topP; }
    if (gc.topK !== undefined) { if (!Number.isInteger(gc.topK) || gc.topK < 1 || gc.topK > 64) return err(400, 'invalid_gc', corsHeaders); cleanGC.topK = gc.topK; }
    if (gc.responseMimeType !== undefined) { if (gc.responseMimeType !== 'application/json' && gc.responseMimeType !== 'text/plain') return err(400, 'invalid_gc', corsHeaders); cleanGC.responseMimeType = gc.responseMimeType; }
    if (gc.responseSchema !== undefined) { if (typeof gc.responseSchema !== 'object' || gc.responseSchema === null || Array.isArray(gc.responseSchema) || JSON.stringify(gc.responseSchema).length > 16000) return err(400, 'invalid_gc', corsHeaders); cleanGC.responseSchema = gc.responseSchema; }
    if (gc.maxOutputTokens !== undefined) { if (!Number.isInteger(gc.maxOutputTokens) || gc.maxOutputTokens < 1 || gc.maxOutputTokens > 4096) return err(400, 'invalid_gc', corsHeaders); cleanGC.maxOutputTokens = gc.maxOutputTokens; }
  }
  cleanBody.generationConfig = cleanGC;

  if (parsed.tools !== undefined) {
    if (!Array.isArray(parsed.tools) || parsed.tools.length > 1) return err(400, 'invalid_tools', corsHeaders);
    if (parsed.tools.length === 1) {
      const t = parsed.tools[0];
      if (!t || typeof t !== 'object' || !t.googleSearch || Object.keys(t.googleSearch).length !== 0 || Object.keys(t).length !== 1) return err(400, 'unsupported_tool', corsHeaders);
      cleanBody.tools = [{ googleSearch: {} }];
    }
  }

  const rawIp = (req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('cf-connecting-ip') || 'unknown');
  const callerHash = await hmacHex(serviceKey, rawIp);

  let budgetAllowed: boolean;
  try {
    const rpcRes = await fetch(`${supaUrl}/rest/v1/rpc/consume_gemini_proxy_budget`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', apikey: serviceKey, authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({ p_caller: callerHash }),
      signal: AbortSignal.timeout(5000),
    });
    if (!rpcRes.ok) return err(503, 'quota_unavailable', corsHeaders);
    const rpcData = await rpcRes.json();
    if (typeof rpcData !== 'boolean') return err(503, 'quota_unavailable', corsHeaders);
    budgetAllowed = rpcData;
  } catch {
    return err(503, 'quota_unavailable', corsHeaders);
  }
  if (!budgetAllowed) return err(429, 'rate_limited', { ...corsHeaders, 'retry-after': '60' });

  try {
    const targetUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(parsed.model)}:generateContent`;
    const googleRes = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': geminiKey },
      body: JSON.stringify(cleanBody),
      signal: AbortSignal.timeout(45000),
    });
    if (!googleRes.ok) {
      if (googleRes.status === 429) return err(429, 'rate_limited', corsHeaders);
      if (googleRes.status === 401 || googleRes.status === 403) return err(503, 'config_error', corsHeaders);
      return err(502, 'upstream_error', corsHeaders);
    }
    const respText = await readLimitedBody(googleRes.body, 2 * 1024 * 1024);
    return new Response(respText, { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } });
  } catch (e: any) {
    if (e?.name === 'TimeoutError' || e?.name === 'AbortError') return err(504, 'gateway_timeout', corsHeaders);
    return err(502, 'upstream_error', corsHeaders);
  }
}

if (typeof Deno !== 'undefined' && typeof Deno.serve === 'function') {
  Deno.serve(handleRequest);
}
