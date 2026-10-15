import { getPayDates } from './paycheck';

// How many paychecks per month for a given frequency
export function checksPerMonth(freq){
  if(freq==='weekly')return 52/12;
  if(freq==='biweekly')return 26/12;
  if(freq==='semimonthly')return 2;
  return 1;
}

// Monthly equivalent of a single check amount
export function monthlyFromSource(src){
  return(parseFloat(src.amount)||0)*checksPerMonth(src.frequency||'biweekly');
}

// Total monthly income across all income sources
export function totalMonthlyIncome(sources){
  return(sources||[]).reduce((s,src)=>s+monthlyFromSource(src),0);
}

// Get all upcoming pay dates across multiple sources, merged and sorted
export function getAllPayDates(sources,count=10){
  const all=[];
  for(const src of (sources||[])){
    if(!src.next_date||!src.amount)continue;
    const dates=getPayDates(src.frequency||'biweekly',src.next_date,count);
    for(const d of dates)all.push({date:d,source:src});
  }
  return all.sort((a,b)=>a.date-b.date);
}
