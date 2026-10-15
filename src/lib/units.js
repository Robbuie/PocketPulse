import { f$ } from './format';

export const UNITS=['count','lbs','oz','kg','g','gal','fl oz','L','mL','ct','pkg','box','bag','can','bottle','each'];

// Unit normalization — everything converts to a base unit within its group for fair comparison
export const UNIT_CONV={
  // Weight → base: oz
  'oz':    {group:'weight',base:'oz',factor:1},
  'lbs':   {group:'weight',base:'oz',factor:16},
  'lb':    {group:'weight',base:'oz',factor:16},
  'g':     {group:'weight',base:'oz',factor:0.035274},
  'kg':    {group:'weight',base:'oz',factor:35.274},
  // Volume → base: fl oz
  'fl oz': {group:'volume',base:'fl oz',factor:1},
  'mL':    {group:'volume',base:'fl oz',factor:0.033814},
  'L':     {group:'volume',base:'fl oz',factor:33.814},
  'gal':   {group:'volume',base:'fl oz',factor:128},
  // Count — no conversion
  'count': {group:'count',base:'count',factor:1},
  'each':  {group:'count',base:'count',factor:1},
  'ct':    {group:'count',base:'count',factor:1},
  'pkg':   {group:'count',base:'count',factor:1},
  'box':   {group:'count',base:'count',factor:1},
  'bag':   {group:'count',base:'count',factor:1},
  'can':   {group:'count',base:'count',factor:1},
  'bottle':{group:'count',base:'count',factor:1},
};

// Normalize a unit price to the base unit of its group (for cross-unit comparison)
export function normalizeUnitPrice(pricePerPkgUnit,pkgUnit){
  const c=UNIT_CONV[pkgUnit];
  if(!c||c.group==='count')return{normalized:pricePerPkgUnit,base:pkgUnit||'unit'};
  // price per pkgUnit ÷ factor = price per oz (or fl oz)
  return{normalized:pricePerPkgUnit/c.factor,base:c.base};
}

// Human-readable display of a normalized base price back in a friendlier unit
export function friendlyBasePrice(pricePerBase,baseUnit){
  // If base is oz, also show per lb if >$0.50
  if(baseUnit==='oz'&&pricePerBase>0){
    const perLb=pricePerBase*16;
    return`${f$(perLb,2)}/lb (${f$(pricePerBase,3)}/oz)`;
  }
  if(baseUnit==='fl oz'&&pricePerBase>0){
    const perL=pricePerBase*33.814;
    return`${f$(perL,2)}/L (${f$(pricePerBase,3)}/fl oz)`;
  }
  return`${f$(pricePerBase,3)}/${baseUnit}`;
}

// Check if two units are in the same group (can be compared)
export function sameUnitGroup(a,b){
  if(!a||!b)return false;
  if(a===b)return true;
  const ca=UNIT_CONV[a],cb=UNIT_CONV[b];
  if(!ca||!cb)return false;
  return ca.group===cb.group;
}

export function fUnit(qty,unit){
  if(!qty&&!unit)return null;
  if(!unit||unit==='count'||unit==='each')return qty||null;
  return`${qty||''}${qty?' ':''}${unit}`;
}
