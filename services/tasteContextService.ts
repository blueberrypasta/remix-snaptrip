import type { QlooOptions } from './qlooService';
import type { TasteDraft } from './tasteProfileService';
export const DEFAULT_TASTE_OPTIONS:QlooOptions={category:'food',mode:'balanced',cuisine:'any',priceMax:0,radius:15000};
export function mergeTasteOptions(previous:QlooOptions|undefined,next:TasteDraft['options']):QlooOptions {
  const merged={...DEFAULT_TASTE_OPTIONS,...previous,...next};
  const categoryChanged=next.category && previous && next.category!==previous.category;
  if(categoryChanged){merged.michelin=null;merged.foodQuery='';merged.drink='any';merged.cuisine='any';merged.shoppingKind='any';merged.searchQuery=undefined;merged.openNow=false;Object.assign(merged,next);}
  if(next.cuisine && next.cuisine!==previous?.cuisine && next.foodQuery===undefined){merged.foodQuery='';if(next.drink===undefined)merged.drink='any';}
  if(next.foodQuery){if(next.foodQuery!==previous?.foodQuery && next.searchQuery===undefined)merged.searchQuery=undefined;merged.category='food';merged.shoppingKind='any';if(!next.cuisine)merged.cuisine='any';if(!next.drink)merged.drink='any';}
  if(next.category==='shopping' || next.category==='visits'){merged.michelin=null;merged.foodQuery='';merged.cuisine='any';merged.drink='any';if(next.category==='visits')merged.shoppingKind='any';}
  return merged;
}
export function tasteContextInput(previous:{summary:string;stablePreferences?:string[]}|null,latest:string):string {
  if(!previous)return latest;
  return `Explicit usual likes (retain unless changed): ${JSON.stringify(previous.stablePreferences||[])}\nPrevious current request (replace any conflicting conditions): ${previous.summary.slice(0,500)}\nLATEST request, takes precedence: ${latest.slice(0,600)}`;
}
