import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCurrentWeather,fetchCurrentWeather,weatherEmoji} from '../services/weatherService.ts';
const fixture=()=>({current:{temperature_2m:33.5,weather_code:0,is_day:1,time:'2026-10-06T16:45'},current_units:{temperature_2m:'°C'}});
test('valid weather and WMO conditions; no invented temperature',()=>{
 assert.deepEqual(parseCurrentWeather(fixture()),{tempC:33.5,emoji:'☀️',observedAt:'2026-10-06T16:45'});
 assert.equal(weatherEmoji(0,false),'🌙');assert.equal(weatherEmoji(95,true),'⛈️');assert.equal(weatherEmoji(71,true),'❄️');
 for(const change of [{temperature_2m:NaN},{temperature_2m:71},{temperature_2m:'22'},{weather_code:999},{is_day:null},{time:'invalid'}]){
  const data=fixture();Object.assign(data.current,change);assert.throws(()=>parseCurrentWeather(data),/weather_unavailable/);
 }
 const data=fixture();data.current_units.temperature_2m='°F';assert.throws(()=>parseCurrentWeather(data));assert.throws(()=>parseCurrentWeather(null));
});
test('location rounding, cache, failure retry, and obsolete request cancellation',async()=>{
 const original=globalThis.fetch;let calls=0;let seen;
 try{
  globalThis.fetch=async(url)=>{calls++;seen=new globalThis.URL(url);return globalThis.Response.json(fixture())};
  await fetchCurrentWeather({latitude:0,longitude:0});assert.equal(seen.searchParams.get('latitude'),'0.00');
  await fetchCurrentWeather({latitude:0.001,longitude:0.001});assert.equal(calls,1);
  const aborted=new globalThis.AbortController();aborted.abort();await assert.rejects(fetchCurrentWeather({latitude:0,longitude:0},aborted.signal),{name:'AbortError'});
  await assert.rejects(fetchCurrentWeather({latitude:NaN,longitude:0}));assert.equal(calls,1);
  globalThis.fetch=async()=>{calls++;return new globalThis.Response('',{status:503})};
  await assert.rejects(fetchCurrentWeather({latitude:1,longitude:1}),/weather_unavailable/);
  globalThis.fetch=async()=>{calls++;return globalThis.Response.json(fixture())};
  await fetchCurrentWeather({latitude:1,longitude:1});assert.equal(calls,3);
  const controller=new globalThis.AbortController();globalThis.fetch=async()=>{controller.abort();return globalThis.Response.json(fixture())};
  await assert.rejects(fetchCurrentWeather({latitude:2,longitude:2},controller.signal),{name:'AbortError'});
  globalThis.fetch=async()=>{calls++;return globalThis.Response.json(fixture())};
  await fetchCurrentWeather({latitude:2,longitude:2});assert.equal(calls,4);
 }finally{globalThis.fetch=original}
});
