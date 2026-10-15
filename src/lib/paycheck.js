import { CAT_COLORS } from './constants';
import { getType } from './format';

export function checksPerPeriod(frequency){
  // Returns how many paychecks per month on average
  const map={weekly:52/12,biweekly:26/12,semimonthly:2,monthly:1};
  return map[frequency]||2;
}

export function varAmtPerCheck(monthlyAmt,frequency){
  return (parseFloat(monthlyAmt)||0)/checksPerPeriod(frequency);
}

export function getPayDates(frequency,nextDateStr,count=8){
  if(!nextDateStr)return[];
  const dates=[];
  let d=new Date(nextDateStr+'T00:00:00');
  for(let i=0;i<count;i++){
    dates.push(new Date(d));
    if(frequency==='weekly')d.setDate(d.getDate()+7);
    else if(frequency==='biweekly')d.setDate(d.getDate()+14);
    else if(frequency==='semimonthly'){
      if(d.getDate()<15){d.setDate(15)}
      else{d.setMonth(d.getMonth()+1);d.setDate(1)}
    }else{d.setMonth(d.getMonth()+1)}
  }
  return dates;
}

export function getBillsInPeriod(expenses,debts,startDate,endDate,committedPayment){
  const items=[];
  const start=new Date(startDate);start.setHours(0,0,0,0);
  const end=new Date(endDate);end.setHours(0,0,0,0);
  let cur=new Date(start);
  const seen=new Set();
  while(cur<end){
    const day=cur.getDate();
    const key=`${cur.getFullYear()}-${cur.getMonth()}`;
    for(const e of (expenses||[])){
      if(parseInt(e.due_day)===day&&!seen.has('e'+e.id+key)){
        seen.add('e'+e.id+key);
        items.push({id:'e'+e.id,name:e.label||e.category,amount:parseFloat(e.amount)||0,due:new Date(cur),type:'expense',color:CAT_COLORS[e.category]||'var(--amber)'});
      }
    }
    for(const d of (debts||[])){
      if(parseInt(d.due_day)===day&&!seen.has('d'+d.id+key)){
        seen.add('d'+d.id+key);
        items.push({id:'d'+d.id,name:d.name,amount:parseFloat(d.min_payment)||0,due:new Date(cur),type:'debt',color:getType(d.type).c});
      }
    }
    cur.setDate(cur.getDate()+1);
  }
  if(committedPayment>0){
    // Add payoff plan as first-of-period item if not already covered by debt minimums
    const debtMins=(debts||[]).filter(d=>d.due_day).reduce((s,d)=>s+(parseFloat(d.min_payment)||0),0);
    const extra=committedPayment-debtMins;
    if(extra>0.5){
      items.push({id:'plan',name:'💡 Extra Debt Payoff',amount:extra,due:new Date(start),type:'plan',color:'var(--green)'});
    }
  }
  return items.sort((a,b)=>a.due-b.due);
}

export function getCashFlow(expenses,debts,committedPayment,days=60){
  const items=[];
  const now=new Date();now.setHours(0,0,0,0);
  for(let i=0;i<days;i++){
    const d=new Date(now);d.setDate(d.getDate()+i);
    const day=d.getDate();
    for(const e of (expenses||[])){
      if(parseInt(e.due_day)===day){
        items.push({name:e.label||e.category,amount:parseFloat(e.amount)||0,date:new Date(d),type:'expense',color:'var(--amber)'});
      }
    }
    for(const debt of (debts||[])){
      if(parseInt(debt.due_day)===day){
        items.push({name:debt.name,amount:parseFloat(debt.min_payment)||0,date:new Date(d),type:'debt',color:getType(debt.type).c});
      }
    }
  }
  return items.sort((a,b)=>a.date-b.date);
}
