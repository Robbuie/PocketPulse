import { localDate } from './format';

export function amortize(balance,annualRate,monthlyPayment,extra=0){
  const r=(parseFloat(annualRate)||0)/100/12;
  const pmt=(parseFloat(monthlyPayment)||0)+(parseFloat(extra)||0);
  let rem=Math.abs(parseFloat(balance)||0);
  if(rem<=0)return{schedule:[],totalInterest:0,months:0};
  if(pmt<=0||(r>0&&pmt<rem*r+0.01))return{schedule:[],totalInterest:0,months:Infinity};
  let ti=0;const s=[];
  for(let mo=1;mo<=600;mo++){
    const int=rem*r,ap=Math.min(pmt,rem+int),pr=ap-int;
    rem=Math.max(0,rem-pr);ti+=int;
    s.push({month:mo,payment:ap,interest:int,principal:pr,balance:rem,totalInterest:ti});
    if(rem<0.01)break;
  }
  return{schedule:s,totalInterest:ti,months:s.length};
}

// Get the most recent due date that has already passed for a debt
export function getLastDueDate(dueDay){
  if(!dueDay)return null;
  const now=new Date();now.setHours(0,0,0,0);
  let d=new Date(now.getFullYear(),now.getMonth(),parseInt(dueDay));
  d.setHours(0,0,0,0);
  if(d>now)d.setMonth(d.getMonth()-1);
  return localDate(d);
}

// Calculate daily interest accrued on a balance since a given date
export function calcDebtInterest(balance,apr,sinceDate){
  const bal=parseFloat(balance)||0;
  const rate=parseFloat(apr)||0;
  if(!rate||!bal||!sinceDate)return{accrued:0,daysSince:0,currentTotal:bal};
  const dailyRate=rate/100/365;
  const since=new Date(sinceDate+'T00:00:00');
  const now=new Date();now.setHours(0,0,0,0);
  const daysSince=Math.max(0,Math.floor((now-since)/86400000));
  const accrued=bal*dailyRate*daysSince;
  return{accrued,daysSince,currentTotal:bal+accrued,dailyRate};
}

// Split a payment into interest and principal portions (simple monthly interest)
export function splitPayment(paymentAmt,balance,apr){
  const monthlyInterest=(parseFloat(balance)||0)*((parseFloat(apr)||0)/100/12);
  const interestPortion=Math.min(parseFloat(paymentAmt)||0,monthlyInterest);
  const principalPortion=Math.max(0,(parseFloat(paymentAmt)||0)-interestPortion);
  const newBalance=Math.max(0,(parseFloat(balance)||0)-principalPortion);
  return{interestPortion,principalPortion,newBalance,monthlyInterest};
}

export function simulatePayoff(debtsIn,extra,strategy){
  if(!debtsIn?.length)return{months:0,totalInterest:0,payoffOrder:[],monthlyTotal:0};
  let debts=debtsIn.map(d=>({
    id:d.id,name:d.name,
    remaining:Math.max(0,parseFloat(d.balance)||0),
    rate:parseFloat(d.rate)||0,
    minPmt:Math.max(1,parseFloat(d.min_payment||d.minPayment)||0),
    paidOff:false,paidOffMonth:null
  })).filter(d=>d.remaining>0);
  if(!debts.length)return{months:0,totalInterest:0,payoffOrder:[],monthlyTotal:0};
  const totalMin=debts.reduce((s,d)=>s+d.minPmt,0);
  let month=0,ti=0,bonus=parseFloat(extra)||0;
  while(debts.some(d=>!d.paidOff)&&month<600){
    month++;
    const unpaid=debts.filter(d=>!d.paidOff);
    const sorted=[...unpaid].sort((a,b)=>strategy==='avalanche'?b.rate-a.rate:a.remaining-b.remaining);
    const targetId=sorted[0].id;
    for(const d of unpaid){
      const r=d.rate/100/12;
      const int=d.remaining*r;
      ti+=int;
      const isT=d.id===targetId;
      const pmt=isT?Math.min(d.minPmt+bonus,d.remaining+int):Math.min(d.minPmt,d.remaining+int);
      const pr=Math.max(0,pmt-int);
      d.remaining=Math.max(0,d.remaining-pr);
      if(d.remaining<0.01&&!d.paidOff){d.paidOff=true;d.paidOffMonth=month;bonus+=d.minPmt}
    }
  }
  return{months:month,totalInterest:ti,monthlyTotal:totalMin+(parseFloat(extra)||0),payoffOrder:debts.filter(d=>d.paidOffMonth).sort((a,b)=>a.paidOffMonth-b.paidOffMonth)};
}
