import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mergeTasteOptions,tasteContextInput,DEFAULT_TASTE_OPTIONS} from '../services/tasteContextService.ts';
test('latest meal replaces old dish and incompatible constraints, preserving unchanged distance/budget',()=>{
 const old={...DEFAULT_TASTE_OPTIONS,foodQuery:'burger',cuisine:'american',drink:'matcha',radius:5000,priceMax:2,searchQuery:'burger restaurants'};
 const next=mergeTasteOptions(old,{foodQuery:'pho',cuisine:'vietnamese',searchQuery:'Vietnamese pho restaurants'});
 assert.equal(next.foodQuery,'pho');assert.equal(next.cuisine,'vietnamese');assert.equal(next.drink,'any');assert.equal(next.radius,5000);assert.equal(next.priceMax,2);assert.equal(next.searchQuery,'Vietnamese pho restaurants');
 assert.equal(mergeTasteOptions(old,{foodQuery:'pho'}).searchQuery,undefined);
});
test('switch to shopping removes meal filters; refinement retains current meal',()=>{
 const old={...DEFAULT_TASTE_OPTIONS,foodQuery:'burger',cuisine:'american',drink:'matcha',searchQuery:'burgers'};
 const shop=mergeTasteOptions(old,{category:'shopping',shoppingKind:'vintage'});
 assert.equal(shop.foodQuery,'');assert.equal(shop.cuisine,'any');assert.equal(shop.drink,'any');assert.equal(shop.searchQuery,undefined);assert.equal(shop.shoppingKind,'vintage');
 const nearby=mergeTasteOptions(old,{radius:5000,priceMax:1});assert.equal(nearby.foodQuery,'burger');assert.equal(nearby.searchQuery,'burgers');
});
test('context labels usual likes separately and marks latest request as overriding',()=>{
 const text=tasteContextInput({summary:'Burger today',stablePreferences:['Usually like mild food']},'Actually pho instead');
 assert.match(text,/Explicit usual likes.*Usually like mild food/);assert.match(text,/Previous current request.*Burger today/);assert.match(text,/LATEST request, takes precedence: Actually pho instead/);
 assert.equal(tasteContextInput(null,'burger'),'burger');
});
