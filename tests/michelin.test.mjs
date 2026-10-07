import assert from 'node:assert/strict';
import {test} from 'node:test';
const {URL,Request,Response}=globalThis;
const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'service',QLOO_API_KEY:'qloo',PARSE_API_KEY:'parse'};
globalThis.Deno={env:{get:k=>env[k]},serve:()=>{}};
const {handleRequest}=await import('../supabase/functions/qloo-proxy/index.ts');
let calls=[],region='QA Michelin',parseStatus=200,used=0;
const hit=(id,slug,green=false)=>({objectID:id,name:'Venue '+id,distinction:{slug},green_star:green,guide_year:2026,_geoloc:{lat:33.75,lng:-117.95},url:'https://guide.michelin.com/us/en/restaurant/test'});
let hits=[hit('101','bib-gourmand',null),hit('102','1-star-michelin'),hit('103','2-stars-michelin',true),hit('104','the-plate-michelin',null)];
const place=(id)=>({entity_id:`${id.padStart(8,'0')}-1234-4234-8234-123456789abc`,name:'Venue '+id,external:{michelin:[{id}]},location:{lat:33.75,lon:-117.95},properties:{geocode:{admin2_region:region,country_code:'US'},address:'QA address'}});
let places=[];
globalThis.fetch=async(url,opts={})=>{
 const u=new URL(url);calls.push(u);
 if(u.pathname==='/rest/v1/rpc/guest_taste_quota'){const op=JSON.parse(opts.body).p_operation;if(op==='consume')used++;if(op==='refund')used--;return Response.json(used);}
 if(u.pathname==='/auth/v1/user')return Response.json({id:'user'});
 if(u.hostname==='api.parse.bot'){assert.equal(opts.headers['X-API-Key'],'parse');assert.equal(u.searchParams.get('query'),region);assert.equal(u.searchParams.get('limit'),'100');return Response.json({status:'success',data:{hits,nbHits:hits.length,nbPages:1}},{status:parseStatus});}
 assert.equal(u.searchParams.get('filter.external.exists'),'michelin');return Response.json({results:{entities:places}});
};
const request=(michelin,category='food')=>new Request('https://example.supabase.co/functions/v1/qloo-proxy',{method:'POST',headers:{Origin:'https://slaptrip.com',apikey:'anon','X-Guest-Taste-Id':'12345678-1234-4234-8234-123456789abc','Content-Type':'application/json'},body:JSON.stringify({action:'recommend',interests:[],location:{latitude:33.75,longitude:-117.95},options:{category,mode:'popular',michelin}})});
test('Michelin IDs, award union, star cap and successful cache; no inferred Green Star',async()=>{
 places=['101','102','103','104','999'].map(place);const filter={awards:['bib','green','star'],maxStars:1};
 let r=await handleRequest(request(filter));assert.equal(r.status,200);let d=await r.json();assert.deepEqual(d.places.map(p=>p.michelin.stars),[0,1]);assert.equal(d.places[0].michelin.bib,true);assert.equal(d.places[0].michelin.green,false);assert.equal(d.places[0].michelin.year,2026);
 const before=calls.filter(u=>u.hostname==='api.parse.bot').length;await handleRequest(request(filter));assert.equal(calls.filter(u=>u.hostname==='api.parse.bot').length,before);
 r=await handleRequest(request({awards:['green'],maxStars:1}));d=await r.json();assert.deepEqual(d.places,[]); // Verified two-star Green cannot bypass cap.
 const baseline=used;region='Unknown Green';hits=[hit('101','bib-gourmand',null)];places=['101'].map(place);r=await handleRequest(request({awards:['green'],maxStars:1}));assert.equal((await r.json()).error,'michelin_green_unavailable');assert.equal(used,baseline);
});
test('Michelin cannot apply to shopping or silently survive API quota failure',async()=>{
 let r=await handleRequest(request({awards:['bib'],maxStars:0},'shopping'));assert.equal(r.status,400);
 region='Quota Michelin';places=['101'].map(place);parseStatus=402;const baseline=used;r=await handleRequest(request({awards:['bib'],maxStars:0}));assert.equal((await r.json()).error,'michelin_quota');assert.equal(used,baseline);
 parseStatus=200;region='Different outlet';places=['101'].map(place);hits=[{...hit('101','bib-gourmand'),_geoloc:{lat:37,lng:-122}}];r=await handleRequest(request({awards:['bib'],maxStars:0}));assert.deepEqual((await r.json()).places,[]);
});
