import assert from 'node:assert/strict';
import { test } from 'node:test';
const {URL, Request, Response} = globalThis;
const env = {SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'test-anon',QLOO_API_KEY:'test-qloo',SUPABASE_SERVICE_ROLE_KEY:'test-service'};
globalThis.Deno = {env:{get:key=>env[key]},serve:()=>{}};
const {handleRequest} = await import('../supabase/functions/qloo-proxy/index.ts');
const interest = '12345678-1234-4234-8234-123456789abc';
let calls=[];
let upstreamStatus=200;
const guestUsage=new Map();
let authOK=true;
let authUser='qa-user';
const discovered='22345678-1234-4234-8234-123456789abc';
let fixtures=[{entity_id:discovered,name:'Test Place',types:['urn:entity:place'],location:{lat:34.051,lon:-118.241},external:{google_place:[{place_id:'ChIJtest_place_id_123456'}]},properties:{address:'123 Test St',description:'Verified fixture',business_rating:4.699999809,price_level:2}}];
globalThis.fetch = async (url, options={}) => {
  const u = new URL(String(url)); calls.push({u,options});
  if (u.pathname==='/auth/v1/user') return Response.json(authOK?{id:authUser}:{error:'invalid'}, {status:authOK?200:401});
  if(u.pathname==='/rest/v1/rpc/guest_taste_quota') {
   assert.equal(options.headers.apikey,'test-service');const {p_guest_id:id,p_operation:op}=JSON.parse(options.body);let used=guestUsage.get(id)||0;
   if(op==='consume'){if(used===10)return Response.json(-1);used++;}else if(op==='refund')used=Math.max(0,used-1);
   guestUsage.set(id,used);return Response.json(used);
  }
  if (upstreamStatus!==200) return Response.json({error:'never expose upstream credentials'}, {status:upstreamStatus});
  return Response.json({results:{entities:u.pathname==='/search'?[{entity_id:interest,name:'Test Place',types:['urn:entity:place']}]:fixtures}});
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
  assert.equal(new URL(data.places[0].url).searchParams.get('query_place_id'),'ChIJtest_place_id_123456');assert.equal(data.places[0].latitude,34.051);assert.equal(data.places[0].longitude,-118.241);assert.equal(data.places[0].ratingSource,'qloo');assert.equal(data.places[0].priceLevel,2);assert.equal(data.places[0].reviewCount,undefined);
  const c=calls.find(c=>c.u.pathname==='/v2/insights' && c.u.searchParams.get('take')==='20');assert.equal(c.u.searchParams.get('signal.interests.entities'),interest);
  assert.equal(c.u.searchParams.get('filter.location'),'POINT(-118.24 34.05)');assert.equal(c.u.searchParams.get('filter.location.radius'),'15000');assert.equal(c.u.searchParams.get('take'),'20');
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
 await t.test('generic Korean and matcha tastes do not require restaurant entity IDs',async()=>{
  calls=[];const r=await handleRequest(request({...rec,interests:[],options:{category:'food',cuisine:'korean',drink:'matcha'}}));
  assert.equal(r.status,200);const requests=calls.filter(c=>c.u.pathname==='/v2/insights');assert.equal(requests.length,2);
  const restaurant=requests.find(c=>c.u.searchParams.get('take')==='20');const cafe=requests.find(c=>c.u.searchParams.get('take')==='10');
  assert.equal(restaurant.u.searchParams.get('signal.interests.entities'),null);
  assert.equal(restaurant.u.searchParams.get('signal.interests.tags'),'urn:tag:genre:place:restaurant:korean');
  assert.match(cafe.u.searchParams.get('filter.tags'),/matcha_latte/);assert.match(cafe.u.searchParams.get('filter.tags'),/category:place:cafe/);
 });
 await t.test('local food exploration broadens cuisine; mixed exploration retains explicit taste signals',async()=>{
  calls=[];let r=await handleRequest(request({...rec,options:{category:'food',cuisine:'korean',foodApproach:'local',mode:'popular'}}));assert.equal(r.status,200);
  let c=calls.find(c=>c.u.pathname==='/v2/insights');assert.equal(c.u.searchParams.get('filter.tags'),'urn:tag:category:place:restaurant');assert.equal(c.u.searchParams.get('signal.interests.entities'),null);assert.equal(c.u.searchParams.get('signal.interests.tags'),null);
  calls=[];r=await handleRequest(request({...rec,options:{category:'food',cuisine:'korean',foodApproach:'both',mode:'popular'}}));assert.equal(r.status,200);
  c=calls.find(c=>c.u.pathname==='/v2/insights');assert.equal(c.u.searchParams.get('filter.tags'),'urn:tag:category:place:restaurant');assert.equal(c.u.searchParams.get('signal.interests.tags'),'urn:tag:genre:place:restaurant:korean');assert.equal(c.u.searchParams.get('signal.interests.entities'),interest);
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
 await t.test('favorites, alternate branches and chain aliases never appear in any mode',async()=>{
  const saved=fixtures;authUser='qa-exclusions';
  fixtures=[
   {entity_id:interest,name:'Original Favorite'},
   {entity_id:'33345678-1234-4234-8234-123456789abc',name:'In-N-Out Burger - Glendale'},
   {entity_id:'43345678-1234-4234-8234-123456789abc',name:'인앤아웃 버거'},
   {entity_id:'53345678-1234-4234-8234-123456789abc',name:'BCD Tofu House (Koreatown)'},
   {entity_id:'63345678-1234-4234-8234-123456789abc',name:'북창동순두부'},
   {entity_id:'73345678-1234-4234-8234-123456789abc',name:'Other Burger',properties:{brand:{name:'In N Out'}}},
   ...Array.from({length:5},(_,i)=>({entity_id:`${i+2}2345678-1234-4234-8234-123456789abd`,name:['New Tofu Kitchen','Burger Garden','BCD-inspired independent cafe','Incredible Food','Local Bistro'][i]}))
  ];
  try {
   for(const foodApproach of ['familiar','local','both']) {
    calls=[];const r=await handleRequest(request({...rec,excludedNames:['BCD Tofu House','In N Out'],options:{foodApproach}}));assert.equal(r.status,200);
    const data=await r.json();assert.equal(data.places.length,5);assert.ok(data.places.every(p=>!['Original Favorite','Other Burger','북창동순두부','인앤아웃 버거'].includes(p.name) && !p.name.startsWith('In-N-Out') && !p.name.startsWith('BCD Tofu')));
    assert.ok(data.places.some(p=>p.name==='BCD-inspired independent cafe'));
    assert.ok(calls.filter(c=>c.u.pathname==='/v2/insights').every(c=>c.u.searchParams.get('filter.exclude.entities')===interest));
   }
   assert.equal((await handleRequest(request({...rec,excludedNames:'BCD'}))).status,400);
   assert.equal((await handleRequest(request({...rec,excludedNames:Array.from({length:11},(_,i)=>'Favorite '+i)}))).status,400);
   assert.equal((await handleRequest(request({...rec,excludedNames:['BCD','In-N-Out','Muji','Uniqlo']}))).status,200);
   assert.equal((await handleRequest(request({...rec,excludedNames:['x'.repeat(201)]}))).status,400);
  } finally {fixtures=saved;authUser='qa-user';}
 });
 await t.test('guest trials persist ten recommendations, allow searches, then block before Qloo',async()=>{
  const id='a2345678-1234-4234-8234-123456789abc';const h={Authorization:'Bearer test-anon','X-Guest-Taste-Id':id};
  let r=await handleRequest(request({action:'guest_status'},h));assert.equal(r.status,200);assert.equal((await r.json()).guestRemaining,10);
  r=await handleRequest(request({action:'search',query:'Test',type:'place'},h));assert.equal(r.status,200);assert.equal(guestUsage.get(id),0);
  for(let i=1;i<=10;i++){r=await handleRequest(request({...rec,interests:[]},h));assert.equal(r.status,200);assert.equal((await r.json()).guestRemaining,10-i);}
  calls=[];r=await handleRequest(request(rec,h));assert.equal(r.status,403);assert.equal((await r.json()).error,'guest_limit_reached');assert.ok(!calls.some(c=>c.u.pathname==='/v2/insights'));
  r=await handleRequest(request({action:'guest_status'},h));assert.equal((await r.json()).guestRemaining,0);
  assert.equal((await handleRequest(request(rec,{...h,'X-Guest-Taste-Id':'invalid'}))).status,401);
  assert.equal((await handleRequest(request(rec,{Authorization:'Bearer test-anon'}))).status,401);
 });
 await t.test('failed and empty guest recommendations refund their reserved use',async()=>{
  const id='b2345678-1234-4234-8234-123456789abc';const h={Authorization:'Bearer test-anon','X-Guest-Taste-Id':id};
  upstreamStatus=429;assert.equal((await handleRequest(request(rec,h))).status,429);assert.equal(guestUsage.get(id),0);upstreamStatus=200;
  const old=fixtures;fixtures=[];const r=await handleRequest(request(rec,h));assert.equal(r.status,200);assert.equal((await r.json()).guestRemaining,10);fixtures=old;
  assert.equal((await handleRequest(request({...rec,options:{radius:123}},h))).status,400);assert.equal(guestUsage.get(id),0);
 });
 await t.test('secondhand shopping rejects malls, bookstores, incidental tags and malformed hours',async()=>{
  const old=fixtures,oldUser=authUser;authUser='shopping-qa';
  const thrift={...old[0],name:'Vintage Fixture',properties:{...old[0].properties,primary_genre:{id:'urn:tag:genre:place:used_clothing_store'},hours:{monday:[{opens:'T10:00:00',closes:'T18:00:00'},null],sunday:[{closed:true}],unexpected:[{opens:'bad'}]}}};
  fixtures=[thrift,{...thrift,entity_id:'32345678-1234-4234-8234-123456789abc',name:'Church Fixture',tags:[{id:'urn:tag:category:place:thrift_store'}],properties:{primary_genre:{id:'urn:tag:genre:place:church'}}},{...thrift,name:'Mall Fixture',tags:[{id:'urn:tag:category:place:shopping_mall'}]}];
  try{calls=[];const r=await handleRequest(request({...rec,options:{category:'shopping',shoppingKind:'secondhand'}}));assert.equal(r.status,200);const data=await r.json();assert.deepEqual(data.places.map(p=>p.name),['Vintage Fixture']);assert.equal(data.places[0].hours.monday[0].opens,'T10:00:00');assert.equal(data.places[0].hours.unexpected,undefined);assert.ok(calls.some(c=>c.u.searchParams.get('filter.tags')?.includes('used_clothing_store')));
  assert.equal((await handleRequest(request({...rec,options:{category:'shopping',shoppingKind:'invented'}}))).status,400);
  }finally{fixtures=old;authUser=oldUser;}
 });
 await t.test('bounded requests reject excessive calls',async()=>{
  const statuses=[];for(let i=0;i<22;i++) statuses.push((await handleRequest(request(rec))).status);
  assert.ok(statuses.includes(429));
 });
});
