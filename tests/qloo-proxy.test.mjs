import assert from 'node:assert/strict';
import { test } from 'node:test';
const {URL, Request, Response} = globalThis;
const env = {SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'test-anon',QLOO_API_KEY:'test-qloo'};
globalThis.Deno = {env:{get:key=>env[key]},serve:()=>{}};
const {handleRequest} = await import('../supabase/functions/qloo-proxy/index.ts');
const interest = '12345678-1234-4234-8234-123456789abc';
let calls=[];
let upstreamStatus=200;
let authOK=true;
globalThis.fetch = async (url, options={}) => {
  const u = new URL(String(url)); calls.push({u,options});
  if (u.pathname==='/auth/v1/user') return Response.json(authOK?{id:'qa-user'}:{error:'invalid'}, {status:authOK?200:401});
  if (upstreamStatus!==200) return Response.json({error:'never expose upstream credentials'}, {status:upstreamStatus});
  return Response.json({results:{entities:[{entity_id:interest,name:'Test Place',types:['urn:entity:place'],properties:{address:'123 Test St',description:'Verified fixture'}}]}});
};
const request = (body,headers={}) => new Request('https://example.supabase.co/functions/v1/qloo-proxy',{method:'POST',headers:{Origin:'https://slaptrip.com',Authorization:'Bearer user-token','Content-Type':'application/json',...headers},body:typeof body==='string'?body:JSON.stringify(body)});
const rec = {action:'recommend',interests:[interest],location:{latitude:34.05,longitude:-118.24}};
test('Qloo server boundary', async t=>{
 await t.test('health hides key and reports disabled when absent',async()=>{
  delete env.QLOO_API_KEY;
  const r=await handleRequest(new Request('https://example.supabase.co/functions/v1/qloo-proxy'));
  assert.equal(r.status,200);assert.deepEqual(await r.json(),{enabled:false});
  env.QLOO_API_KEY='test-qloo';
 });
 await t.test('CORS rejects unrelated origin before upstream',async()=>{
  calls=[];const r=await handleRequest(request(rec,{Origin:'https://evil.example'}));
  assert.equal(r.status,403);assert.equal(calls.length,0);
 });
 await t.test('preflight permits production origin',async()=>{
  const r=await handleRequest(new Request('https://example.supabase.co/functions/v1/qloo-proxy',{method:'OPTIONS',headers:{Origin:'https://slaptrip.com'}}));
  assert.equal(r.status,204);assert.equal(r.headers.get('Access-Control-Allow-Origin'),'https://slaptrip.com');
 });
 await t.test('no user token or invalid session cannot call Qloo',async()=>{
  calls=[];let r=await handleRequest(request(rec,{Authorization:''}));assert.equal(r.status,401);
  authOK=false;r=await handleRequest(request(rec));assert.equal(r.status,401);authOK=true;
  assert.equal(calls.filter(c=>c.u.hostname==='api.qloo.com').length,0);
 });
 await t.test('invalid coordinates and arbitrary interest IDs rejected',async()=>{
  assert.equal((await handleRequest(request({...rec,location:{latitude:91,longitude:0}}))).status,400);
  assert.equal((await handleRequest(request({...rec,interests:['https://evil.example']}))).status,400);
  assert.equal((await handleRequest(request({...rec,interests:[interest,interest]}))).status,400);
 });
 await t.test('malformed or oversized JSON rejected',async()=>{
  assert.equal((await handleRequest(request('{'))).status,400);
  assert.equal((await handleRequest(request('x'.repeat(5000)))).status,413);
 });
 await t.test('search uses category filter and preserves explicit entity',async()=>{
  calls=[];const r=await handleRequest(request({action:'search',type:'place',query:'Test'}));
  assert.equal(r.status,200);const data=await r.json();assert.equal(data.entities[0].id,interest);
  const c=calls.find(c=>c.u.pathname==='/search');assert.equal(c.u.searchParams.get('types'),'urn:entity:place');
 });
 await t.test('recommendation uses interests and geography without account data',async()=>{
  calls=[];const r=await handleRequest(request(rec));assert.equal(r.status,200);
  const data=await r.json();assert.equal(data.places[0].name,'Test Place');assert.match(data.places[0].url,/^https:\/\/www.google.com\/maps\/search\/\?api=1&query=/);
  const c=calls.find(c=>c.u.pathname==='/v2/insights' && c.u.searchParams.get('take')==='5');assert.equal(c.u.searchParams.get('signal.interests.entities'),interest);
  assert.equal(c.u.searchParams.get('filter.location'),'POINT(-118.24 34.05)');assert.equal(c.u.searchParams.get('filter.location.radius'),'15000');assert.equal(c.u.searchParams.get('take'),'5');
  assert.ok(!JSON.stringify(data).includes('test-qloo'));assert.ok(!c.u.toString().includes('qa-user'));
 });
 await t.test('local categories, cuisine, budget and discovery filters reach Qloo',async()=>{
  calls=[];
  let r=await handleRequest(request({...rec,options:{category:'food',mode:'discover',cuisine:'korean',priceMax:2,radius:5000}}));
  assert.equal(r.status,200);
  let c=calls.find(c=>c.u.pathname==='/v2/insights');
  assert.equal(c.u.searchParams.get('filter.tags'),'urn:tag:category:place:restaurant,urn:tag:genre:place:restaurant:korean');
  assert.equal(c.u.searchParams.get('operator.filter.tags'),'intersection');
  assert.equal(c.u.searchParams.get('filter.price_level.max'),'2');
  assert.equal(c.u.searchParams.get('filter.popularity.max'),'0.95');
  assert.equal(c.u.searchParams.get('filter.location.radius'),'5000');
  calls=[];r=await handleRequest(request({...rec,options:{category:'shopping',mode:'popular'}}));
  assert.equal(r.status,200);c=calls.find(c=>c.u.pathname==='/v2/insights');
  assert.match(c.u.searchParams.get('filter.tags'),/urn:tag:category:place:shopping_mall/);
  assert.equal(c.u.searchParams.get('filter.popularity.min'),'0.95');
  assert.equal(c.u.searchParams.get('filter.price_level.max'),null);
  calls=[];r=await handleRequest(request({...rec,options:{radius:999999}}));
  assert.equal(r.status,400);assert.ok(!calls.some(c=>c.u.pathname==='/v2/insights'));
 });
 await t.test('upstream auth/rate errors are safe and distinct',async()=>{
  upstreamStatus=401;let r=await handleRequest(request(rec));assert.equal(r.status,503);assert.ok(!(await r.text()).includes('credentials'));
  upstreamStatus=429;r=await handleRequest(request(rec));assert.equal(r.status,429);upstreamStatus=200;
 });
 await t.test('hackathon keys route to the official hackathon host',async()=>{
  calls=[];env.QLOO_API_URL='https://hackathon.api.qloo.com';
  const r=await handleRequest(request(rec));assert.equal(r.status,200);
  assert.ok(calls.some(c=>c.u.hostname==='hackathon.api.qloo.com'));
  delete env.QLOO_API_URL;
 });
 await t.test('untrusted API hosts cannot receive keys',async()=>{
  calls=[];env.QLOO_API_URL='https://evil.example';
  const r=await handleRequest(request(rec));assert.equal(r.status,200);
  assert.ok(calls.some(c=>c.u.hostname==='api.qloo.com'));
  assert.ok(!calls.some(c=>c.u.hostname==='evil.example'));
  delete env.QLOO_API_URL;
 });
 await t.test('bounded requests reject excessive calls',async()=>{
  const statuses=[];for(let i=0;i<22;i++) statuses.push((await handleRequest(request(rec))).status);
  assert.ok(statuses.includes(429));
 });
});
