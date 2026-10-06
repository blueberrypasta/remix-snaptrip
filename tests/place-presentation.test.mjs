import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const dir=await mkdtemp(join(tmpdir(),'slaptrip-presentation-'));
await build({entryPoints:['services/placePresentationService.ts'],bundle:true,platform:'node',format:'esm',outfile:join(dir,'service.mjs'),define:{'import.meta.env':JSON.stringify({VITE_SUPABASE_URL:'https://example.supabase.co',VITE_SUPABASE_ANON_KEY:'public-fixture'})}});
const {formatOpeningHours,localizePlaceDescriptions}=await import(pathToFileURL(join(dir,'service.mjs')));
await rm(dir,{recursive:true,force:true});
const place={id:'a',name:'Original Store',address:'123 Original St',description:'Used clothing store.',url:'https://example.com',hours:{monday:[{opens:'T10:00:00',closes:'T18:30:00'}]}};
test('weekly local hours handle split, overnight, closed and unknown hours honestly',()=>{
 const rows=formatOpeningHours({...place.hours,tuesday:[{closed:true}],wednesday:[{opens:'T22:00:00',closes:'T02:00:00'}],thursday:[{opens:'00:00',closes:'00:00'}],friday:[{opens:'bad',closes:'99:99'}]},'ko');
 assert.equal(rows[0].value,'10:00–18:30');assert.equal(rows[1].value,'휴무');assert.equal(rows[2].value,'22:00–02:00 (다음 날)');assert.equal(rows[3].value,'시간 미제공');assert.equal(rows[4].value,'시간 미제공');assert.deepEqual(formatOpeningHours(null,'ko'),[]);
});
test('translation preserves facts and handles missing IDs or failures without losing places',async()=>{
 const original=globalThis.fetch;let body;
 try{
 globalThis.fetch=async(_,opts)=>{body=JSON.parse(opts.body);return globalThis.Response.json({candidates:[{content:{parts:[{text:JSON.stringify({translations:[{id:'wrong',description:'Invented'},{id:'a',description:'중고 의류 매장입니다.'}]})}]}}]})};
 const translated=await localizePlaceDescriptions([place],'ko');assert.equal(translated[0].description,'중고 의류 매장입니다.');assert.equal(translated[0].name,place.name);assert.equal(translated[0].address,place.address);assert.deepEqual(translated[0].hours,place.hours);assert.equal(body.generationConfig.responseMimeType,'application/json');
 globalThis.fetch=async()=>{throw Error('offline')};const failed=await localizePlaceDescriptions([place],'ko');assert.equal(failed.length,1);assert.equal(failed[0].descriptionUnavailable,true);assert.equal(failed[0].description,'');assert.deepEqual(await localizePlaceDescriptions([place],'en'),[place]);
 }finally{globalThis.fetch=original}
});
