import assert from 'node:assert/strict';
import {test} from 'node:test';
const {URL,Request,Response}=globalThis;
const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'service',QLOO_API_KEY:'qloo',GOOGLE_PLACES_API_KEY:'places',GOOGLE_PLACES_HYBRID:'1'};
globalThis.Deno={env:{get:k=>env[k]},serve:()=>{}};
const {handleRequest}=await import('../supabase/functions/qloo-proxy/index.ts');
const seed='12345678-1234-4234-8234-123456789abc',a='22345678-1234-4234-8234-123456789abc',b='32345678-1234-4234-8234-123456789abc';
const place=(name,id,extra={})=>({id,displayName:{text:name},formattedAddress:'Irvine CA',location:{latitude:33.69,longitude:-117.83},businessStatus:'OPERATIONAL',types:['restaurant'],rating:4.5,userRatingCount:200,priceLevel:'PRICE_LEVEL_MODERATE',currentOpeningHours:{openNow:true},regularOpeningHours:{weekdayDescriptions:['Monday: 10:00 AM – 9:00 PM']},...extra});
let places=[],calls=[],qlooFails=false,googleFails=false,usage=0;
const one=place('Pho One','ChIJgoogle_pho_one'),two=place('Pho Two','ChIJgoogle_pho_two'),other=place('Independent Pho','ChIJgoogle_pho_other');
globalThis.fetch=async(url,opts={})=>{
 const u=new URL(String(url));calls.push({u,opts});
 if(u.pathname==='/auth/v1/user')return Response.json({id:'hybrid-user'});
 if(u.pathname==='/rest/v1/rpc/guest_taste_quota'){const op=JSON.parse(opts.body).p_operation;if(op==='consume')usage++;if(op==='refund')usage--;return Response.json(usage);}
 if(u.hostname==='places.googleapis.com')return Response.json(googleFails?{error:{message:'secret'}}:{places},{status:googleFails?503:200});
 if(qlooFails)return Response.json({error:'notavailable'},{status:503});
 if(u.pathname==='/search'){
  const query=u.searchParams.get('query');const id=query==='Pho One'?a:b;const google=query==='Pho One'?one.id:two.id;
  return Response.json({results:[{entity_id:id,name:query,properties:{external:{google_place:{place_id:google}}}},{entity_id:seed,name:query,external:{google_place:[{place_id:'WrongBranchId'}]}}]});
 }
 if(u.pathname==='/v2/insights')return Response.json({results:{entities:[{entity_id:seed},{entity_id:b},{entity_id:a},{entity_id:b}]}});
 throw new Error('unexpected upstream '+u.pathname);
};
const req=(options={},excludedNames=[],guest=false)=>new Request('https://example.supabase.co/functions/v1/qloo-proxy',{method:'POST',headers:{Origin:'https://slaptrip.com',apikey:'anon','Content-Type':'application/json',...(guest?{'X-Guest-Taste-Id':'42345678-1234-4234-8234-123456789abc'}:{Authorization:'Bearer user'})},body:JSON.stringify({action:'recommend',interests:[seed],location:{latitude:33.69,longitude:-117.83},options:{category:'food',cuisine:'vietnamese',foodQuery:'pho',radius:15000,priceMax:0,searchQuery:'Vietnamese pho restaurants',language:'ko',...options},excludedNames})});
test('Places hybrid boundary',async t=>{
 await t.test('candidate-only affinity keeps unconnected venues and real Google metadata',async()=>{
  places=[one,two,other];calls=[];const r=await handleRequest(req());assert.equal(r.status,200);const data=await r.json();
  assert.deepEqual(data.places.map(p=>p.name),['Pho Two','Pho One','Independent Pho']);assert.equal(data.places[0].rankingSource,'qloo');assert.equal(data.places[2].rankingSource,'google');
  assert.equal(data.places[0].ratingSource,'google');assert.equal(data.places[0].reviewCount,200);assert.equal(data.places[0].priceLevel,2);assert.equal(data.places[0].latitude,33.69);assert.equal(data.places[0].openNow,true);assert.equal(data.places[0].openingHoursText.length,1);
  const g=JSON.parse(calls.find(c=>c.u.hostname==='places.googleapis.com').opts.body);assert.equal(g.textQuery,'Vietnamese pho restaurants');assert.equal(g.languageCode,'ko');assert.equal(g.strictTypeFiltering,true);assert.equal(g.includedType,'restaurant');
  const q=calls.find(c=>c.u.pathname==='/v2/insights').u;assert.equal(q.searchParams.get('filter.type'),'urn:entity:place');assert.equal(q.searchParams.get('filter.results.entities'),[a,b].join(','));assert.equal(q.searchParams.get('signal.interests.entities'),seed);assert.ok(!JSON.stringify(data).includes('WrongBranchId'));
 });
 await t.test('radius, exclusions, open status and explicit price ceiling enforced',async()=>{
  places=[one,place('In-N-Out Burger Irvine','ChIJexclude_innout'),place('BCD Tofu House Irvine','ChIJexclude_bcd'),place('Far Pho','ChIJoutside_radius',{location:{latitude:34.7,longitude:-117.83}}),place('Closed Pho','ChIJclosed_pho',{currentOpeningHours:{openNow:false}}),place('Unknown Price','ChIJunknown_price',{priceLevel:undefined})];
  const r=await handleRequest(req({openNow:true,priceMax:2},['in n out','BCD']));assert.equal(r.status,200);assert.deepEqual((await r.json()).places.map(p=>p.name),['Pho One']);
 });
 await t.test('specific shopping rejects malls and schools',async()=>{
  places=[place('Vintage Store','ChIJvintage_store',{types:['clothing_store']}),place('Mall','ChIJshopping_mall',{types:['shopping_mall']}),place('College Bookstore','ChIJcollege_store',{types:['book_store']})];calls=[];
  const r=await handleRequest(req({category:'shopping',foodQuery:'',cuisine:'any',shoppingKind:'secondhand',searchQuery:'secondhand clothing stores'}));assert.deepEqual((await r.json()).places.map(p=>p.name),['Vintage Store']);assert.equal(JSON.parse(calls.find(c=>c.u.hostname==='places.googleapis.com').opts.body).textQuery,'secondhand clothing stores');
 });
 await t.test('Qloo failure preserves exact Google candidates with honest source',async()=>{places=[one];qlooFails=true;const data=await(await handleRequest(req())).json();assert.equal(data.places[0].rankingSource,'google');qlooFails=false;});
 await t.test('missing Google facts stay unknown',async()=>{places=[place('Unknown','ChIJunknown_facts',{rating:undefined,userRatingCount:undefined,currentOpeningHours:undefined,regularOpeningHours:undefined,priceLevel:undefined})];const p=(await(await handleRequest(req())).json()).places[0];assert.equal(p.rating,undefined);assert.equal(p.reviewCount,undefined);assert.equal(p.openNow,undefined);assert.equal(p.openingHoursText,undefined);});
 await t.test('Places failure never returns unrelated Qloo venues and refunds guest use',async()=>{places=[one];googleFails=true;calls=[];const r=await handleRequest(req({},[],true));assert.equal(r.status,502);assert.equal((await r.json()).error,'places_unavailable');assert.equal(usage,0);assert.ok(!calls.some(c=>c.u.pathname==='/v2/insights'));googleFails=false;});
 await t.test('non-English query rejected before upstream',async()=>{calls=[];const r=await handleRequest(req({searchQuery:'쌀국수'}));assert.equal(r.status,400);assert.ok(!calls.some(c=>c.u.hostname==='places.googleapis.com'));});
});
