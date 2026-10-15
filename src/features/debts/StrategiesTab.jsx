import { useState, useMemo } from 'react';
import { KV } from '../../components/ui';
import { apiSaveBudget } from '../../lib/api';
import { simulatePayoff } from '../../lib/finance';
import { f$, fmo } from '../../lib/format';

export function StrategiesTab({debts,budget,setBudget,householdId}){
  const[extra,setExtra]=useState(budget.committed_extra?.toString()||'100');
  const[committing,setCommitting]=useState(null);
  const xAmt=parseFloat(extra)||0;
  const av=useMemo(()=>simulatePayoff(debts,xAmt,'avalanche'),[debts,xAmt]);
  const sb2=useMemo(()=>simulatePayoff(debts,xAmt,'snowball'),[debts,xAmt]);

  async function commit(strategy,data){
    setCommitting(strategy);
    const cfg={...budget,committed_strategy:strategy,committed_extra:xAmt,committed_payment:data.monthlyTotal};
    const{error}=await apiSaveBudget(cfg,householdId);
    if(!error)setBudget(cfg);
    setCommitting(null);
  }

  async function uncommit(){
    const cfg={...budget,committed_strategy:null,committed_extra:0,committed_payment:0};
    const{error}=await apiSaveBudget(cfg,householdId);
    if(!error)setBudget(cfg);
  }

  if(debts.length<2)return(<div>
    <div className="st">Payoff Strategies</div>
    {budget.committed_strategy&&<div className="commit-badge"><span>✅</span><div><div style={{fontWeight:700}}>Committed to {budget.committed_strategy} plan</div><div style={{fontSize:12,color:'var(--muted)'}}>{f$(budget.committed_payment,2)}/mo flowing into budget + paycheck planner</div></div><button className="btn btn-d sm" style={{marginLeft:'auto'}} onClick={uncommit}>Cancel Plan</button></div>}
    <div className="card"><div className="empty"><div className="empty-icon">🎯</div><p>Add at least 2 debts to compare strategies.</p></div></div>
  </div>);

  const iDiff=sb2.totalInterest-av.totalInterest;
  const mDiff=sb2.months-av.months;
  const avWins=av.totalInterest<=sb2.totalInterest;
  const totalBal=debts.reduce((s,d)=>s+(parseFloat(d.balance)||0),0);

  return(<div>
    <div className="st">Payoff Strategies</div>
    {budget.committed_strategy&&<div className="commit-badge"><span>✅</span><div><div style={{fontWeight:700,fontSize:13}}>Committed to {budget.committed_strategy==='avalanche'?'Avalanche':'Snowball'}</div><div style={{fontSize:12,color:'var(--muted)'}}>{f$(budget.committed_payment,2)}/mo auto-included in budget and paycheck planner</div></div><button className="btn btn-d sm" style={{marginLeft:'auto',flexShrink:0}} onClick={uncommit}>Remove</button></div>}

    <div className="card" style={{marginBottom:16}}>
      <div style={{fontWeight:700,marginBottom:10,fontSize:13}}>Extra Monthly Payment (above minimums)</div>
      <div style={{display:'flex',gap:10,alignItems:'center'}}>
        <input type="number" min="0" step="10" value={extra} onChange={e=>setExtra(e.target.value)} style={{width:110}}/>
        <span className="muted" style={{fontSize:13}}>/month extra</span>
      </div>
    </div>

    <div className="cgrid" style={{marginBottom:14}}>
      {[
        {name:'Avalanche',emoji:'🏔',color:'var(--blue)',data:av,label:'Highest rate first',desc:'Mathematically optimal.',badge:avWins},
        {name:'Snowball',emoji:'⛄',color:'var(--green)',data:sb2,label:'Smallest balance first',desc:'Builds momentum.',badge:!avWins},
      ].map(({name,emoji,color,data,label,desc,badge})=>{
        const strategy=name.toLowerCase();
        const isCommitted=budget.committed_strategy===strategy;
        return(<div key={name} className="card" style={{border:`1px solid ${isCommitted?color:'var(--border)'}`}}>
          <div style={{fontSize:14,fontWeight:800,color,marginBottom:2}}>{emoji} {name}</div>
          <div style={{fontSize:11,color:'var(--muted)',marginBottom:10}}>{label} — {desc}</div>
          {badge&&<div style={{marginBottom:8}}><span className="tag" style={{background:`${color}20`,color}}>Saves most money ✓</span></div>}
          <KV label="Total Months" val={fmo(data.months)}/>
          <KV label="Monthly Payment" val={f$(data.monthlyTotal,2)} color={color}/>
          <KV label="Total Interest" val={f$(data.totalInterest)} color={color}/>
          <KV label="Total Paid" val={f$(totalBal+data.totalInterest)}/>
          <div className="divider"/>
          <div style={{fontSize:10,fontWeight:800,color:'var(--muted)',marginBottom:7}}>PAYOFF ORDER</div>
          {data.payoffOrder.map((d,i)=>(<div key={i} style={{display:'flex',justifyContent:'space-between',fontSize:12,padding:'3px 0',borderBottom:'1px solid var(--border)'}}><span><span style={{color:'var(--faint)',marginRight:5}}>{i+1}.</span>{d.name}</span><span className="muted">{fmo(d.paidOffMonth)}</span></div>))}
          <div style={{marginTop:12}}>
            {isCommitted?(<div style={{textAlign:'center',fontSize:12,color,fontWeight:700}}>✅ Active Plan</div>):(
              <button className="btn btn-p btn-full" onClick={()=>commit(strategy,data)} disabled={!!committing}>{committing===strategy?<span className="spinner"/>:`Commit to ${name} Plan`}</button>
            )}
          </div>
        </div>);
      })}
    </div>

    <div className="card">
      <div style={{fontSize:14,fontWeight:700,marginBottom:8}}>The Verdict</div>
      <div style={{fontSize:13,color:'var(--muted)',lineHeight:1.9}}>
        <p><strong style={{color:'var(--blue)'}}>Avalanche</strong> saves <strong style={{color:avWins?'var(--green)':'var(--red)'}}>{f$(Math.abs(iDiff))} {avWins?'more':'less'} in interest</strong> and takes <strong>{Math.abs(mDiff)} months {avWins&&mDiff>0?'less':'more'}</strong> than Snowball.</p>
        <br/><p style={{fontSize:11,color:'var(--faint)'}}>When you commit to a plan, the monthly payment amount automatically appears in your Budget tab and Paycheck Planner so you never have to enter it manually.</p>
      </div>
    </div>
  </div>);
}
