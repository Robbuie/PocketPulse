import { useEffect, useRef, useMemo } from 'react';
import Chart from 'chart.js/auto';
import { CAT_COLORS } from '../../lib/constants';
import { catIcon, f$, fshort } from '../../lib/format';
import { totalMonthlyIncome } from '../../lib/income';

export function Dashboard({debts,transactions,budget,kids,kidExpenses,userName}){
  const totalDebt=debts.reduce((s,d)=>s+(parseFloat(d.balance)||0),0);
  // Income: prefer income_sources derived total, fall back to manual budget.income
  const incomeSources=budget.income_sources||[];
  const income=incomeSources.length>0?totalMonthlyIncome(incomeSources):(parseFloat(budget.income)||0);
  const thisMonth=new Date().toISOString().slice(0,7);
  const monthTx=transactions.filter(t=>t.date?.startsWith(thisMonth));
  const monthSpend=monthTx.reduce((s,t)=>s+(parseFloat(t.amount)||0),0);
  const monthKidSpend=kidExpenses.filter(k=>k.date?.startsWith(thisMonth)).reduce((s,k)=>s+(parseFloat(k.amount)||0),0);
  // "Left this month" = income minus everything actually spent (including logged debt payments)
  const netActual=income-monthSpend-monthKidSpend;
  const recent=transactions.slice(0,4);
  const chartRef=useRef(null);const chartInst=useRef(null);
  const catSpend=useMemo(()=>{
    const map={};
    for(const t of monthTx){const c=t.category||'🧾 Other';map[c]=(map[c]||0)+(parseFloat(t.amount)||0);}
    // Include kid expenses as their own categories
    for(const ke of (kidExpenses||[]).filter(k=>k.date?.startsWith(thisMonth))){
      const c=ke.category||'👨‍👩‍👧‍👦 Family';map[c]=(map[c]||0)+(parseFloat(ke.amount)||0);
    }
    return Object.entries(map).sort((a,b)=>b[1]-a[1]).slice(0,6);
  },[monthTx,kidExpenses,thisMonth]);
  useEffect(()=>{
    if(!chartRef.current||!catSpend.length)return;
    if(chartInst.current)chartInst.current.destroy();
    chartInst.current=new Chart(chartRef.current,{type:'doughnut',data:{labels:catSpend.map(([c])=>c),datasets:[{data:catSpend.map(([,v])=>v),backgroundColor:catSpend.map(([c])=>CAT_COLORS[c]||'#7a86a8'),borderWidth:0,hoverOffset:4}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},cutout:'68%'}});
    return()=>{if(chartInst.current)chartInst.current.destroy()};
  },[catSpend]);

  return(<div>
    <div style={{marginBottom:18}}><div style={{fontSize:20,fontWeight:800}}>Hey{userName?`, ${userName.split(' ')[0]}`:''}! 👋</div><div style={{fontSize:13,color:'var(--muted)'}}>Here's your financial pulse.</div></div>
    <div className="grid g4" style={{marginBottom:14}}>
      {[{label:'Total Debt',val:f$(totalDebt),color:'var(--red)'},{label:'Spent This Month',val:f$(monthSpend+monthKidSpend),color:'var(--amber)'},{label:'Left This Month',val:income>0?f$(netActual):'-',color:netActual>=0?'var(--green)':'var(--red)'},{label:'Family Spending',val:f$(monthKidSpend),color:'var(--purple)'}].map(m=>(<div key={m.label} className="mcard"><div className="mlabel">{m.label}</div><div className="mval" style={{color:m.color,fontSize:19}}>{m.val}</div></div>))}
    </div>
    {budget.committed_strategy&&<div className="commit-badge"><span style={{fontSize:20}}>✅</span><div><div style={{fontWeight:700,fontSize:13}}>Committed to {budget.committed_strategy==='avalanche'?'Avalanche':'Snowball'} Plan</div><div style={{fontSize:12,color:'var(--muted)'}}>Paying {f$(budget.committed_payment||0,2)}/mo toward debt · included in budget above</div></div></div>}
    <div className="cgrid" style={{marginBottom:14}}>
      <div className="card">
        <div style={{fontWeight:700,marginBottom:10,fontSize:13}}>This Month's Spending</div>
        {catSpend.length?(<><div className="chwrap"><canvas ref={chartRef}/></div><div style={{marginTop:10}}>{catSpend.map(([cat,amt])=>(<div key={cat} className="kv" style={{padding:'4px 0'}}><span style={{fontSize:12}}>{cat}</span><span style={{fontFamily:'var(--mono)',fontSize:12,color:CAT_COLORS[cat]||'var(--muted)'}}>{f$(amt,2)}</span></div>))}</div></>):<div className="empty"><div className="empty-icon">📊</div><p>No spending logged yet.</p></div>}
      </div>
      <div className="card">
        <div style={{fontWeight:700,marginBottom:10,fontSize:13}}>Recent Transactions</div>
        {recent.length?recent.map(t=>(<div key={t.id} className="tx-item"><div className="tx-icon" style={{background:`${CAT_COLORS[t.category]||'var(--bl)'}22`}}>{catIcon(t.category||'Other')}</div><div className="tx-info"><div className="tx-name">{t.merchant||t.description||t.category}</div><div className="tx-meta">{fshort(t.date)}</div></div><div className="tx-amt red">-{f$(t.amount,2)}</div></div>)):<div className="empty" style={{padding:24}}><div className="empty-icon">🧾</div><p>No transactions yet.</p></div>}
      </div>
    </div>
    {kids.length>0&&<div className="card"><div style={{fontWeight:700,marginBottom:10,fontSize:13}}>Family Spending This Month</div><div style={{display:'flex',gap:10,flexWrap:'wrap'}}>{kids.map(kid=>{const spend=kidExpenses.filter(ke=>ke.kid_id===kid.id&&ke.date?.startsWith(thisMonth)).reduce((s,ke)=>s+(parseFloat(ke.amount)||0),0);return(<div key={kid.id} style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:9,padding:'10px 14px',minWidth:100}}><div style={{fontSize:22,marginBottom:4}}>{kid.emoji||'👤'}</div><div style={{fontWeight:600,fontSize:13}}>{kid.name}</div><div style={{fontFamily:'var(--mono)',fontSize:15,color:kid.color||'var(--purple)',fontWeight:800}}>{f$(spend,2)}</div></div>)})}</div></div>}
  </div>);
}
