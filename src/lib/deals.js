import { fdate, today } from './format';

// Deal types that can be attached to a store price entry
export const DEAL_TYPES=[
  {v:'pct_off', l:'% Off',       hint:'e.g. 25 for 25% off'},
  {v:'amt_off', l:'$ Off',       hint:'e.g. 1.00 for $1 off'},
  {v:'bogo',    l:'BOGO (Buy 1 Get 1 Free)', hint:'Effective price = half off'},
  {v:'buy_for', l:'Buy X for $Y',hint:'Enter the total price for the bundle'},
];

// Calculate the effective (post-deal) total price from a price entry
export function calcEffectivePrice(entry){
  const normal=parseFloat(entry.price)||0;
  const deal=entry.deal;
  if(!deal||!deal.type)return normal;
  if(deal.expires&&deal.expires<today())return normal; // expired — fall back to normal
  const val=parseFloat(deal.value)||0;
  switch(deal.type){
    case'pct_off': return Math.max(0,normal*(1-val/100));
    case'amt_off': return Math.max(0,normal-val);
    case'bogo':    return normal/2; // buy 1 get 1 → effective per-package price is half
    case'buy_for': return val>0?val:normal; // bundle price replaces total price
    default:       return normal;
  }
}

// Is there an active (non-expired) deal on this entry?
export function hasActiveDeal(entry){
  if(!entry?.deal?.type)return false;
  if(entry.deal.expires&&entry.deal.expires<today())return false;
  return true;
}

export function dealLabel(entry){
  if(!hasActiveDeal(entry))return null;
  const{type,value,expires}=entry.deal;
  const exp=expires?` · exp ${fdate(expires)}`:'';
  if(type==='pct_off')return`${value}% off${exp}`;
  if(type==='amt_off')return`$${parseFloat(value).toFixed(2)} off${exp}`;
  if(type==='bogo')return`BOGO${exp}`;
  if(type==='buy_for')return`Buy for $${parseFloat(value).toFixed(2)}${exp}`;
  return null;
}
