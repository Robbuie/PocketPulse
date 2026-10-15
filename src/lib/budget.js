import { monthKey } from './format';

export function guessItemBudgetLine(itemName,budgetExpenses){
  if(!itemName||!budgetExpenses?.length)return null;
  const name=itemName.toLowerCase();
  // keyword groups → hints
  const hints=[
    {words:['gas','fuel','unleaded','diesel','gallon','87','89','93'],hints:['gas','fuel','transport']},
    {words:['milk','bread','egg','cheese','meat','chicken','beef','pork','produce','veggie','fruit','grocery','grocer','cereal','butter','cream','flour','sugar','pasta','rice'],hints:['grocery','food','grocer']},
    {words:['restaurant','pizza','burger','taco','sandwich','sub','coffee','latte','espresso','donut','bakery','dining'],hints:['dining','food','restaurant','coffee']},
    {words:['medicine','prescription','vitamin','supplement','pharmacy','rx'],hints:['health','medical','pharmacy']},
    {words:['amazon','shipping','online','prime'],hints:['shop','amazon']},
    {words:['electric','water','gas bill','internet','cable','phone bill','utility'],hints:['utility','electric','internet']},
    {words:['insurance','premium','policy'],hints:['insurance']},
    {words:['school','tuition','book','supply','pencil','backpack'],hints:['school','education']},
    {words:['clothes','shirt','pants','shoes','jacket','dress'],hints:['cloth','wear','apparel']},
  ];
  for(const g of hints){
    if(g.words.some(w=>name.includes(w))){
      // find budget expense whose label/category contains any of the hints
      const match=budgetExpenses.find(e=>{
        const lbl=(e.label||'').toLowerCase()+(e.category||'').toLowerCase();
        return g.hints.some(h=>lbl.includes(h));
      });
      if(match)return match.id;
    }
  }
  return null;
}

export function rollingAvgByCategory(transactions,numMonths=3){
  if(!transactions.length)return{};
  const now=new Date();
  const months={};
  for(let i=0;i<numMonths;i++){
    const d=new Date(now.getFullYear(),now.getMonth()-i,1);
    months[monthKey(d)]=true;
  }
  const byMonthCat={};
  for(const t of transactions){
    const m=t.date?.slice(0,7);
    if(!m||!months[m])continue;
    const c=t.category||'🧾 Other';
    if(!byMonthCat[c])byMonthCat[c]={};
    byMonthCat[c][m]=(byMonthCat[c][m]||0)+(parseFloat(t.amount)||0);
  }
  const avgs={};
  for(const[cat,byMonth] of Object.entries(byMonthCat)){
    const vals=Object.values(byMonth);
    avgs[cat]=vals.reduce((s,v)=>s+v,0)/numMonths;
  }
  return avgs;
}

export function buildItemHistory(transactions){
  const map={};
  for(const t of transactions){
    if(!t.items?.length)continue;
    for(const item of t.items){
      const key=(item.name||'').toLowerCase().trim();
      if(!key||key.length<2)continue;
      if(!map[key])map[key]={name:item.name,times:0,totalPrice:0,lastDate:'',lastMerchant:'',merchants:new Set()};
      map[key].times++;
      map[key].totalPrice+=(parseFloat(item.price)||0);
      if(!map[key].lastDate||t.date>map[key].lastDate){map[key].lastDate=t.date;map[key].lastMerchant=t.merchant||'';}
      if(t.merchant)map[key].merchants.add(t.merchant);
    }
  }
  return Object.values(map).map(i=>({...i,merchants:[...i.merchants],avgPrice:i.totalPrice/i.times})).sort((a,b)=>b.lastDate.localeCompare(a.lastDate));
}

// What has been spent against each budget line in a month ("YYYY-MM"),
// keyed by line id. Only transactions linked by budget_line_id count; a
// receipt whose items carry their own lines is split across them, the rest
// of the receipt staying on the transaction's line. Moved here unchanged
// from BudgetTab in 0.7.0 so Home and Budget use the same numbers.
export function spentByLine(transactions,month){
  const map={};
  for(const t of (transactions||[])){
    if(!t.date?.startsWith(month))continue;
    if(t.budget_line_id){
      map[t.budget_line_id]=(map[t.budget_line_id]||0)+(parseFloat(t.amount)||0);
      if(t.items?.length){
        const itemTotal=t.items.filter(i=>i.included!==false&&i.budget_line_id).reduce((s,i)=>s+(parseFloat(i.price)||0),0);
        if(itemTotal>0){
          const overrides={};
          for(const item of t.items){
            if(item.included===false||!item.budget_line_id)continue;
            overrides[item.budget_line_id]=(overrides[item.budget_line_id]||0)+(parseFloat(item.price)||0);
          }
          const unassigned=parseFloat(t.amount)-itemTotal;
          map[t.budget_line_id]=Math.max(0,(map[t.budget_line_id]||0)-(parseFloat(t.amount)||0)+unassigned);
          for(const[blid,amt] of Object.entries(overrides)){
            map[blid]=(map[blid]||0)+amt;
          }
        }
      }
    }
  }
  return map;
}
