import test from 'node:test';
import process from 'node:process';
const {Request,Response} = globalThis;
import assert from 'node:assert/strict';
import { handleRequest } from '../supabase/functions/gemini-proxy/index.ts';

const origFetch = globalThis.fetch;
function setupEnv() {
  process.env.SUPABASE_ANON_KEY = 'anon-test-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-test-key';
  process.env.SUPABASE_URL = 'https://db.supabase.co';
  process.env.GEMINI_API_KEY = 'gemini-test-key';
}
function req(body, headers = {}) {
  return new Request('https://slaptrip.com/api', {
    method: 'POST',
    headers: { origin: 'https://slaptrip.com', apikey: 'anon-test-key', authorization: 'Bearer anon-test-key', 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}
const validPayload = { model: 'gemini-3.1-flash-lite', contents: [{ role: 'user', parts: [{ text: 'hi' }] }] };

test('gemini proxy suite', async (t) => {
  t.beforeEach(() => { setupEnv(); });
  t.afterEach(() => { globalThis.fetch = origFetch; });

  await t.test('no auth 401', async () => {
    const res = await handleRequest(new Request('https://slaptrip.com', { method: 'POST', headers: { origin: 'https://slaptrip.com' } }));
    assert.equal(res.status, 401);
  });
  await t.test('valid rotated anon key is verified with Auth and cached; rejected keys never reach AI', async () => {
    const jwt=(role,ref,signature)=>globalThis.btoa('{}')+'.'+globalThis.btoa(JSON.stringify({role,ref}))+'.'+signature;
    const rotated=jwt('anon','db','rotated');let validations=0,upstream=0;
    globalThis.fetch=async(url)=>{
      if(url.includes('/auth/v1/settings')){validations++;return Response.json({});}
      if(url.includes('/rpc/'))return Response.json(true);
      upstream++;return Response.json({candidates:[]});
    };
    const h={apikey:rotated,authorization:'Bearer '+rotated};
    assert.equal((await handleRequest(req(validPayload,h))).status,200);
    assert.equal((await handleRequest(req(validPayload,h))).status,200);
    assert.equal(validations,1);assert.equal(upstream,2);
    const other=jwt('anon','db','rejected');
    globalThis.fetch=async()=>new Response('',{status:401});
    assert.equal((await handleRequest(req(validPayload,{apikey:other,authorization:'Bearer '+other}))).status,401);
    const wrongRole=jwt('service_role','db','unexpected');
    assert.equal((await handleRequest(req(validPayload,{apikey:wrongRole,authorization:'Bearer '+wrongRole}))).status,401);
  });
  await t.test('wrong origin 403', async () => {
    const res = await handleRequest(new Request('https://slaptrip.com', { method: 'POST', headers: { origin: 'https://evil.com' } }));
    assert.equal(res.status, 403);
  });
  await t.test('unknown model 400', async () => {
    const res = await handleRequest(req({ ...validPayload, model: 'gemini-1.5-pro' }));
    assert.equal(res.status, 400);
  });
  await t.test('oversized stream 413', async () => {
    const big = 'a'.repeat(3 * 1024 * 1024 + 10);
    const res = await handleRequest(req(big));
    assert.equal(res.status, 413);
  });
  await t.test('no upstream call before quota check', async () => {
    let upstreamCalled = false;
    globalThis.fetch = async (url) => {
      if (url.includes('googleapis')) upstreamCalled = true;
      return new Response(JSON.stringify(false), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const res = await handleRequest(req(validPayload));
    assert.equal(res.status, 429);
    assert.equal(upstreamCalled, false);
  });
  await t.test('DB fail / malformed quota 503', async () => {
    globalThis.fetch = async () => new Response('error', { status: 500 });
    const res = await handleRequest(req(validPayload));
    assert.equal(res.status, 503);
  });
  await t.test('malformed budget and config fail closed before upstream', async () => {
    let calls=0;
    globalThis.fetch=async()=>{calls++;return Response.json({allowed:true})};
    assert.equal((await handleRequest(req(validPayload))).status,503);
    assert.equal(calls,1);
    for (const generationConfig of [null,[],{systemInstruction:null},{topK:1.5},{maxOutputTokens:1.5}]) {
      const before=calls;
      assert.equal((await handleRequest(req({...validPayload,generationConfig}))).status,400);
      assert.equal(calls,before);
    }
  });
  await t.test('quota exhausted 429 with Retry-After', async () => {
    globalThis.fetch = async () => new Response('false', { status: 200, headers: { 'content-type': 'application/json' } });
    const res = await handleRequest(req(validPayload));
    assert.equal(res.status, 429);
    assert.equal(res.headers.get('retry-after'), '60');
  });
  await t.test('valid text response', async () => {
    globalThis.fetch = async (url) => {
      if (url.includes('/rpc/')) return new Response('true', { status: 200, headers: { 'content-type': 'application/json' } });
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }), { status: 200 });
    };
    const res = await handleRequest(req(validPayload));
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.candidates[0].content.parts[0].text, 'ok');
  });
  await t.test('image and audio codec MIME accepted', async () => {
    globalThis.fetch = async () => new Response('true', { status: 200, headers: { 'content-type': 'application/json' } });
    const payload = {
      model: 'gemini-3.1-flash-lite',
      contents: [{ role: 'user', parts: [
        { inlineData: { mimeType: 'image/jpeg', data: 'aGVsbG8=' } },
        { inlineData: { mimeType: 'audio/webm;codecs=opus', data: 'aGVsbG8=' } }
      ] }]
    };
    const res = await handleRequest(req(payload));
    assert.equal(res.status, 200);
  });
  await t.test('unsupported tool rejected 400', async () => {
    const res = await handleRequest(req({ ...validPayload, tools: [{ codeExecution: {} }] }));
    assert.equal(res.status, 400);
  });
  await t.test('output cap 4096 and model route/header inspection', async () => {
    let capturedUrl = '', capturedHeaders = {}, capturedBody = {};
    globalThis.fetch = async (url, opts) => {
      if (url.includes('/rpc/')) return new Response('true', { status: 200, headers: { 'content-type': 'application/json' } });
      capturedUrl = url;
      capturedHeaders = opts.headers;
      capturedBody = JSON.parse(opts.body);
      return new Response('{}', { status: 200 });
    };
    const res = await handleRequest(req({ ...validPayload, generationConfig: { maxOutputTokens: 9999 } }));
    assert.equal(res.status, 400); // Exceeds clamp bound
    const validGC = await handleRequest(req({ ...validPayload, generationConfig: { maxOutputTokens: 2048 } }));
    assert.equal(validGC.status, 200);
    assert.equal(capturedUrl, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent');
    assert.equal(capturedHeaders['x-goog-api-key'], 'gemini-test-key');
    assert.equal(capturedBody.generationConfig.maxOutputTokens, 2048);
  });
  await t.test('upstream 401 config error without secret leak', async () => {
    globalThis.fetch = async (url) => {
      if (url.includes('/rpc/')) return new Response('true', { status: 200, headers: { 'content-type': 'application/json' } });
      return new Response(JSON.stringify({ error: { message: 'bad key secret-123' } }), { status: 401 });
    };
    const res = await handleRequest(req(validPayload));
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.error, 'config_error');
    assert.equal(JSON.stringify(body).includes('secret'), false);
  });
  await t.test('timeout simulates TimeoutError -> 504', async () => {
    globalThis.fetch = async (url) => {
      if (url.includes('/rpc/')) return new Response('true', { status: 200, headers: { 'content-type': 'application/json' } });
      const err = new Error('simulated timeout');
      err.name = 'TimeoutError';
      throw err;
    };
    const res = await handleRequest(req(validPayload));
    assert.equal(res.status, 504);
  });
});
