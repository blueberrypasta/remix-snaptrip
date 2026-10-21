import {test} from 'node:test';
import assert from 'node:assert/strict';
const {URL,Request,Response}=globalThis;
const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'service',GOOGLE_PLACES_API_KEY:'secret-google'};
globalThis.Deno={env:{get:k=>env[k]},serve:()=>{}};
const {handleRequest}=await import('../supabase/functions/qloo-proxy/index.ts');
const {isSafeGoogleUri}=await import('../supabase/functions/qloo-proxy/menu.ts');
let count=0,usage=0,status=200,calls=[],mismatch=false,empty=false,malformed=false;
const placeId='ChIJ_test_branch';
globalThis.fetch=async(url,opts={})=>{
 const u=new URL(String(url));
 if(u.pathname==='/auth/v1/user')return Response.json({id:`user-${count++}`});
 if(u.pathname==='/rest/v1/rpc/guest_taste_quota'){
  const {p_operation:op}=JSON.parse(opts.body);
  if(op==='consume'){if(usage===10)return Response.json(-1);usage++;}
  if(op==='refund')usage--;
  return Response.json(usage);
 }
 assert.equal(u.hostname,'places.googleapis.com');calls.push({u,opts});
 if(status!==200)return Response.json({error:{message:'secret-google'}},{status});
 if(u.pathname.endsWith('searchText'))return Response.json({places:[{id:placeId,displayName:{text:'Pho Place'},formattedAddress:'123 Irvine CA',googleMapsUri:'https://maps.google.com/?cid=123'}]});
 return Response.json({id:mismatch?'wrong':placeId,displayName:{text:'Pho Place'},googleMapsUri:'https://maps.google.com/?cid=123',reviews:empty?[]:[{name:'review-1',rating:malformed?3.8:5,originalText:{text:'Pho is excellent.'},text:{text:'Translated text'},authorAttribution:{displayName:'Visitor',uri:'https://www.google.com/maps/contrib/123'},googleMapsUri:'https://www.google.com/maps/reviews/123',publishTime:'2026-10-01T00:00:00Z',visitDate:{year:2026,month:9}}]});
};
const req=(body,guest=false)=>new Request('https://example.supabase.co/functions/v1/qloo-proxy',{method:'POST',headers:{Origin:'https://slaptrip.com','Content-Type':'application/json',...(guest?{'X-Guest-Taste-Id':'12345678-1234-4234-8234-123456789abc'}:{Authorization:'Bearer session'})},body:JSON.stringify(body)});
test('menu server boundary and quota',async t=>{
 await t.test('search independent of Qloo key, masks fields and filters restaurant',async()=>{
  calls=[];const r=await handleRequest(req({action:'menu_search',query:'Pho Irvine'}));assert.equal(r.status,200);
  const b=await r.json();assert.equal(b.places[0].id,placeId);assert.equal(JSON.stringify(b).includes('secret-google'),false);
  const query=JSON.parse(calls[0].opts.body);assert.equal(query.includedType,'restaurant');assert.equal(query.pageSize,5);assert.equal(query.strictTypeFiltering,true);
  assert.equal(calls[0].opts.headers['X-Goog-FieldMask'].includes('reviews'),false);
  assert.equal(r.headers.get('Cache-Control'),'no-store');
 });
 await t.test('invalid queries and place IDs never call Google',async()=>{
  calls=[];for(const payload of [{action:'menu_search',query:''},{action:'menu_search',query:'x'.repeat(201)},{action:'menu_reviews',placeId:'../other'},{action:'menu_reviews',placeId:2}])assert.equal((await handleRequest(req(payload))).status,400);
  assert.equal(calls.length,0);
 });
 await t.test('exact branch and original review with author/date returned',async()=>{
  calls=[];const r=await handleRequest(req({action:'menu_reviews',placeId}));assert.equal(r.status,200);
  const b=await r.json();assert.equal(b.place.id,placeId);assert.equal(b.reviews[0].text,'Pho is excellent.');assert.equal(b.reviews[0].authorName,'Visitor');assert.equal(b.reviews[0].visitDate,'2026-09');
  assert.equal(calls[0].u.pathname,`/v1/places/${placeId}`);assert.equal(calls[0].opts.headers['X-Goog-FieldMask'].includes('reviews'),true);
 });
 await t.test('wrong branch rejected and errors never leak upstream key',async()=>{
  mismatch=true;assert.equal((await handleRequest(req({action:'menu_reviews',placeId}))).status,502);mismatch=false;
  for(const code of [429,503]){status=code;const r=await handleRequest(req({action:'menu_reviews',placeId}));assert.equal(r.status,code===429?429:502);assert.equal((await r.text()).includes('secret-google'),false);}status=200;
 });
 await t.test('invalid fractional rating not rounded into praise',async()=>{
  malformed=true;const b=await (await handleRequest(req({action:'menu_reviews',placeId}))).json();assert.deepEqual(b.reviews,[]);malformed=false;
 });
 await t.test('guest success consumes once, empty/error refunds, limit prevents Google',async()=>{
  usage=0;await handleRequest(req({action:'menu_reviews',placeId},true));assert.equal(usage,1);
  empty=true;await handleRequest(req({action:'menu_reviews',placeId},true));assert.equal(usage,1);empty=false;
  status=503;await handleRequest(req({action:'menu_reviews',placeId},true));assert.equal(usage,1);status=200;
  usage=10;calls=[];assert.equal((await handleRequest(req({action:'menu_reviews',placeId},true))).status,403);assert.equal(calls.length,0);usage=0;
 });
 await t.test('missing Places configuration explicit with no upstream call',async()=>{
  delete env.GOOGLE_PLACES_API_KEY;calls=[];assert.equal((await handleRequest(req({action:'menu_search',query:'Pho'}))).status,503);assert.equal(calls.length,0);env.GOOGLE_PLACES_API_KEY='secret-google';
 });
 await t.test('anonymous missing guest ID rejected',async()=>{
  const r=new Request('https://example.supabase.co/functions/v1/qloo-proxy',{method:'POST',headers:{Origin:'https://slaptrip.com'},body:JSON.stringify({action:'menu_reviews',placeId})});assert.equal((await handleRequest(r)).status,401);
 });
});
test('Google links require https and exact domain boundary',()=>{
 assert.ok(isSafeGoogleUri('https://www.google.com/maps/reviews/123'));
 for(const bad of ['javascript:alert(1)','https://google.com.evil.example','http://google.com','https://user:pass@google.com'])assert.equal(isSafeGoogleUri(bad),undefined);
});
