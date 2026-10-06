import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const {Response}=globalThis;
const dir=await mkdtemp(join(tmpdir(),'slaptrip-taste-test-'));
await build({entryPoints:['services/tasteProfileService.ts'],bundle:true,platform:'node',format:'esm',outfile:join(dir,'service.mjs'),define:{'import.meta.env':JSON.stringify({VITE_SUPABASE_URL:'https://example.supabase.co',VITE_SUPABASE_ANON_KEY:'public-fixture'})},plugins:[{name:'auth-fixture',setup(b){b.onResolve({filter:/^\.\/supabaseClient$/},()=>({path:'auth',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const supabase={auth:{getSession:async()=>({data:{session:globalThis.testTasteSession?{access_token:"fixture"}:null},error:null})}}'}));}}]});
const {normalizeTasteDraft,interpretTaste}=await import(pathToFileURL(join(dir,'service.mjs')));
await rm(dir,{recursive:true,force:true});
test('taste input validation and request boundary',async t=>{
 await t.test('empty speech or empty preference summary cannot become a profile',()=>{
  for(const value of [null,{}, {summary:''},{summary:'no_preferences'}])assert.throws(()=>normalizeTasteDraft(value),/no_preferences/);
 });
 await t.test('unknown inferred constraints and malformed fields are not applied',()=>{
  const d=normalizeTasteDraft({summary:'I like noodles',favorites:[{name:'Muji',type:'brand'},{name:'muji',type:'brand'},{name:'fake',type:'url'}],options:{cuisine:'japanese',radius:999999,priceMax:'2',mode:'quiet',category:'shopping',allergy:'safe',ethnicity:'invented',foodApproach:'invented'}});
  assert.deepEqual(d.options,{cuisine:'japanese',category:'shopping'});assert.equal(d.favorites.length,1);
 });
 await t.test('food and drink terms are taste filters, never named favorite places',()=>{
  const d=normalizeTasteDraft({summary:'Likes Korean food and matcha latte',favorites:[{name:'한식',type:'place'},{name:'말차 라떼',type:'place'},{name:'Muji',type:'brand'}],options:{}});
  assert.deepEqual(d.favorites,[{name:'Muji',type:'brand'}]);assert.deepEqual(d.options,{cuisine:'korean',drink:'matcha'});
  const specific=normalizeTasteDraft({summary:'Likes named businesses',favorites:[{name:'Matcha Cafe Maiko',type:'place'},{name:'Korean BBQ House',type:'place'}]});assert.equal(specific.favorites.length,2);
 });
 await t.test('profile bounds and valid filter settings',()=>{
  const d=normalizeTasteDraft({summary:'x'.repeat(700),favorites:Array.from({length:5},(_,i)=>({name:'Name '+i,type:'place'})),options:{priceMax:2,radius:5000,mode:'discover'}});
  assert.equal(d.summary.length,600);assert.equal(d.favorites.length,3);assert.deepEqual(d.options,{priceMax:2,mode:'discover',radius:5000});
 });
 let calls=[];let guestRemaining=10;
 globalThis.fetch=async(url,opts)=>{calls.push({url,opts});if(JSON.parse(opts.body).action==='guest_status')return Response.json({guestRemaining});return Response.json({candidates:[{content:{parts:[{text:JSON.stringify({summary:'Likes Japanese food',favorites:[{name:'Muji',type:'brand'}],options:{cuisine:'japanese'}})}]}}]})};
 await t.test('guests can interpret preferences until their ten-use trial is exhausted',async()=>{
  globalThis.testTasteSession=false;const d=await interpretTaste({text:'I like Muji'},'en');assert.equal(d.favorites[0].name,'Muji');assert.ok(calls[0].opts.headers['X-Guest-Taste-Id']);
  calls=[];guestRemaining=0;await assert.rejects(interpretTaste({text:'I like Muji'},'en'),/guest_limit_reached/);assert.equal(calls.length,1);assert.equal(JSON.parse(calls[0].opts.body).action,'guest_status');calls=[];
 });
 globalThis.testTasteSession=true;
 await t.test('invalid or oversized input cannot call external AI',async()=>{
  for(const input of [{text:'x'},{text:' a '},{text:'x'.repeat(1201)},{audio:{data:'x',mimeType:'text/plain'}},{audio:{data:'x'.repeat(2800000),mimeType:'audio/wav'}}])await assert.rejects(interpretTaste(input,'en'),/invalid_input/);
  assert.equal(calls.length,0);
 });
 await t.test('text is passed to proxy, not directly to Qloo',async()=>{
  const d=await interpretTaste({text:'I like Muji'},'en');assert.equal(d.favorites[0].type,'brand');
  assert.equal(calls[0].url,'https://example.supabase.co/functions/v1/gemini-proxy');const body=JSON.parse(calls[0].opts.body);assert.ok(body.contents[0].parts.some(p=>p.text?.includes('I like Muji')));
 });
 await t.test('audio MIME is normalized and sent through server proxy',async()=>{
  await interpretTaste({audio:{data:'YWJj',mimeType:'audio/webm;codecs=opus'}},'ko');const body=JSON.parse(calls[1].opts.body);assert.deepEqual(body.contents[0].parts.find(p=>p.inlineData)?.inlineData,{data:'YWJj',mimeType:'audio/webm'});
 });
 await t.test('upstream failure is surfaced, not replaced with invented preferences',async()=>{
  globalThis.fetch=async()=>Response.json({error:'private-upstream-info'},{status:503});await assert.rejects(interpretTaste({text:'I like Muji'},'en'),/^Error: unavailable$/);
 });
});
