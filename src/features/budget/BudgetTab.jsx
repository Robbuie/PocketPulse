import { useState, useEffect, useRef, useMemo } from 'react';
import Chart from 'chart.js/auto';
import { KV } from '../../components/ui';
import { apiSaveBudget } from '../../lib/api';
import { rollingAvgByCategory, spentByLine } from '../../lib/budget';
import { monthPace } from '../../lib/pacing';
import { carryover } from '../../lib/rollover';
import { CATS, CAT_COLORS } from '../../lib/constants';
import { catIcon, f$, fshort, monthKey, ordinal, uid } from '../../lib/format';
import { totalMonthlyIncome } from '../../lib/income';

export function BudgetTab({budget,setBudget,householdId,debts,transactions,kids,kidExpenses}){
  const[editing,setEditing]=useState(false);
  const[budgetView,setBudgetView]=useState('current'); // current | history
  const[expandedMonth,setExpandedMonth]=useState(null);
  const[form,setForm]=useState({income:'',expenses:[]});
  const[saving,setSaving]=useState(false);
  const[showSuggestions,setShowSuggestions]=useState(false);

  function openEdit(){setForm({income:budget.income||'',expenses:(budget.expenses||[]).map(e=>({...e,id:e.id||uid()}))});setEditing(true)}
  function addExpense(){setForm(f=>({...f,expenses:[...f.expenses,{id:uid(),label:'',amount:'',category:CATS[12],due_day:'',is_variable:false}]}))}
  function updateExp(id,field,val){setForm(f=>({...f,expenses:f.expenses.map(e=>e.id===id?{...e,[field]:val}:e)}))}
  function removeExp(id){setForm(f=>({...f,expenses:f.expenses.filter(e=>e.id!==id)}))}
  async function save(){
    setSaving(true);
    // Preserve income derived from income_sources — only use form.income if no sources configured
    const savedIncome=hasIncomeSources?income:(parseFloat(form.income)||0);
    const cfg={...budget,income:savedIncome,expenses:form.expenses.map(e=>({...e,amount:parseFloat(e.amount)||0,due_day:e.is_variable?null:parseInt(e.due_day)||null}))};
    const{error}=await apiSaveBudget(cfg,householdId);
    if(!error){setBudget(cfg);setEditing(false)}
    setSaving(false);
  }

  const thisMonth=monthKey();
  // Actual spending this month — keyed by budget_line_id first, then category
  const actualByLineId=useMemo(()=>spentByLine(transactions,thisMonth),[transactions,thisMonth]);
  // Daily allowance and pace for flexible lines, as on Home.
  const carry=useMemo(()=>carryover(budget.expenses,transactions,thisMonth),[budget.expenses,transactions,thisMonth]);
  const paceById=useMemo(()=>Object.fromEntries(monthPace(budget.expenses,actualByLineId,new Date(),carry).flex.map(x=>[x.line.id,x])),[budget.expenses,actualByLineId,carry]);

  const actualByCategory=useMemo(()=>{
    const map={};
    for(const t of (transactions||[])){
      if(!t.date?.startsWith(thisMonth))continue;
      if(!t.budget_line_id){
        // only count toward category if not linked to a budget line
        const c=t.category||'🧾 Other';
        map[c]=(map[c]||0)+(parseFloat(t.amount)||0);
      }
    }
    return map;
  },[transactions,thisMonth]);

  // Rolling 3-month averages for suggestions
  const rollingAvgs=useMemo(()=>rollingAvgByCategory(transactions||[],3),[transactions]);

  const totalExp=(budget.expenses||[]).reduce((s,e)=>s+(parseFloat(e.amount)||0),0);
  // Income: derived from income_sources if set, otherwise manual budget.income
  const sources=budget.income_sources||[];
  const derivedIncome=sources.length>0?totalMonthlyIncome(sources):0;
  const income=derivedIncome>0?derivedIncome:(parseFloat(budget.income)||0);
  const hasIncomeSources=sources.length>0;
  const debtMins=debts.reduce((s,d)=>s+(parseFloat(d.min_payment)||0),0);
  const committed=budget.committed_payment||0;
  // Only add debt minimums that DON'T already have a budget line (those are counted in totalExp)
  const debtsWithLine=new Set((budget.expenses||[]).filter(e=>e.debt_id).map(e=>e.debt_id));
  const orphanDebtMins=debts.filter(d=>!debtsWithLine.has(d.id)).reduce((s,d)=>s+(parseFloat(d.min_payment)||0),0);
  const committedExtra=Math.max(0,committed-debtMins); // extra above all minimums
  const debtLine=orphanDebtMins+committedExtra;

  // Kids spending this month
  const kidMonthTotal=useMemo(()=>(kidExpenses||[]).filter(ke=>ke.date?.startsWith(thisMonth)).reduce((s,ke)=>s+(parseFloat(ke.amount)||0),0),[kidExpenses,thisMonth]);
  const kidByName=useMemo(()=>{
    const m={};
    for(const ke of (kidExpenses||[]).filter(ke=>ke.date?.startsWith(thisMonth))){
      const kid=(kids||[]).find(k=>k.id===ke.kid_id);
      const name=kid?`${kid.emoji||'👦'} ${kid.name}`:'Unknown';
      m[name]=(m[name]||0)+(parseFloat(ke.amount)||0);
    }
    return Object.entries(m).sort((a,b)=>b[1]-a[1]);
  },[kidExpenses,kids,thisMonth]);

  const net=income-totalExp-debtLine-kidMonthTotal;

  // Unassigned = ALL spending not explicitly linked to a budget line via budget_line_id.
  // Category matching is intentionally NOT used — only explicit links count against a line.
  const miscByCat=useMemo(()=>Object.entries(actualByCategory).sort((a,b)=>b[1]-a[1]),[actualByCategory]);
  const miscTransactions=useMemo(()=>(transactions||[]).filter(t=>t.date?.startsWith(thisMonth)&&!t.budget_line_id).sort((a,b)=>new Date(b.date)-new Date(a.date)),[transactions,thisMonth]);
  const miscTotal=miscByCat.reduce((s,[,v])=>s+v,0);

  const netActual=net-miscTotal;

  // History computation
  const allMonths=useMemo(()=>{
    const seen=new Set();
    for(const t of (transactions||[]))if(t.date?.slice(0,7))seen.add(t.date.slice(0,7));
    for(const ke of (kidExpenses||[]))if(ke.date?.slice(0,7))seen.add(ke.date.slice(0,7));
    return[...seen].sort((a,b)=>b.localeCompare(a)); // newest first
  },[transactions,kidExpenses]);

  function computeMonth(month){
    const txs=(transactions||[]).filter(t=>t.date?.startsWith(month));
    const kes=(kidExpenses||[]).filter(ke=>ke.date?.startsWith(month));
    const byLineId={};
    const byCategory={};
    for(const t of txs){
      if(t.budget_line_id)byLineId[t.budget_line_id]=(byLineId[t.budget_line_id]||0)+(parseFloat(t.amount)||0);
      else{const c=t.category||'🧾 Other';byCategory[c]=(byCategory[c]||0)+(parseFloat(t.amount)||0);}
    }
    const totalSpent=txs.reduce((s,t)=>s+(parseFloat(t.amount)||0),0);
    const totalKids=kes.reduce((s,ke)=>s+(parseFloat(ke.amount)||0),0);
    const totalUnassigned=Object.values(byCategory).reduce((s,v)=>s+v,0);
    const inc=sources.length>0?totalMonthlyIncome(sources):(parseFloat(budget.income)||0);
    const net2=inc-totalSpent-totalKids;
    return{totalSpent,totalKids,totalUnassigned,byLineId,byCategory,net:net2,income:inc,txCount:txs.length};
  }

  const chartRef=useRef(null);const chartInst=useRef(null);
  const trendChartRef=useRef(null);const trendChartInst=useRef(null);
  useEffect(()=>{
    if(!trendChartRef.current||budgetView!=='history')return;
    if(trendChartInst.current)trendChartInst.current.destroy();
    const months=[...allMonths].reverse().slice(-6); // oldest first, last 6
    const labels=months.map(m=>new Date(m+'-01').toLocaleDateString('en-US',{month:'short',year:'2-digit'}));
    const inc=sources.length>0?totalMonthlyIncome(sources):(parseFloat(budget.income)||0);
    const spent=months.map(m=>computeMonth(m).totalSpent+computeMonth(m).totalKids);
    trendChartInst.current=new Chart(trendChartRef.current,{
      type:'bar',
      data:{labels,datasets:[
        {label:'Income',data:months.map(()=>inc),type:'line',borderColor:'#10d070',backgroundColor:'transparent',borderWidth:2,pointRadius:3,pointBackgroundColor:'#10d070',tension:.3,order:0},
        {label:'Spent',data:spent,backgroundColor:spent.map(s=>s>inc?'rgba(240,80,85,.7)':'rgba(96,128,240,.6)'),borderRadius:5,borderWidth:0,order:1},
      ]},
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:'#7a86a8',font:{size:10}}}},scales:{x:{ticks:{color:'#7a86a8',font:{size:10}},grid:{display:false}},y:{ticks:{color:'#7a86a8',font:{size:10},callback:v=>'$'+v},grid:{color:'rgba(255,255,255,.05)'}}}}
    });
    return()=>{if(trendChartInst.current)trendChartInst.current.destroy()};
  },[budgetView,allMonths,budget.income,transactions,kidExpenses]);
  useEffect(()=>{
    if(!chartRef.current)return;if(chartInst.current)chartInst.current.destroy();
    const exps=(budget.expenses||[]).filter(e=>e.amount>0);
    if(!exps.length)return;
    const labels=exps.map(e=>e.label||e.category);
    const budgeted=exps.map(e=>e.amount);
    const actual=exps.map(e=>actualByLineId[e.id]||0);
    chartInst.current=new Chart(chartRef.current,{
      type:'bar',
      data:{labels,datasets:[
        {label:'Budgeted',data:budgeted,backgroundColor:exps.map(e=>`${CAT_COLORS[e.category]||'#6080f0'}55`),borderColor:exps.map(e=>CAT_COLORS[e.category]||'#6080f0'),borderWidth:1,borderRadius:4},
        {label:'Actual',data:actual,backgroundColor:exps.map((e,i)=>actual[i]>budgeted[i]?'rgba(240,80,85,.7)':'rgba(16,208,112,.7)'),borderWidth:0,borderRadius:4},
      ]},
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:'#7a86a8',font:{size:10}}}},scales:{x:{ticks:{color:'#7a86a8',font:{size:10}},grid:{display:false}},y:{ticks:{color:'#7a86a8',font:{size:10},callback:v=>'$'+v},grid:{color:'rgba(255,255,255,.05)'}}}}
    });
    return()=>{if(chartInst.current)chartInst.current.destroy()};
  },[budget.expenses,actualByCategory]);

  if(editing)return(<div>
    <div className="st-row"><div className="st">Edit Budget</div><button className="btn btn-s sm" onClick={()=>setEditing(false)}>Cancel</button></div>

    {Object.keys(rollingAvgs).length>0&&(<div className="card" style={{marginBottom:12}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:showSuggestions?10:0}}>
        <div style={{fontSize:13,fontWeight:700}}>💡 Suggestions from your spending history</div>
        <button className="btn btn-s sm" onClick={()=>setShowSuggestions(s=>!s)}>{showSuggestions?'Hide':'Show'}</button>
      </div>
      {showSuggestions&&Object.entries(rollingAvgs).filter(([,v])=>v>5).sort((a,b)=>b[1]-a[1]).map(([cat,avg])=>(
        <div key={cat} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'5px 0',borderBottom:'1px solid var(--border)',fontSize:12}}>
          <span>{cat} <span style={{fontSize:10,color:'var(--muted)'}}>3-mo avg</span></span>
          <div style={{display:'flex',gap:8,alignItems:'center'}}>
            <span style={{fontFamily:'var(--mono)',color:'var(--amber)'}}>{f$(avg,0)}/mo</span>
            <button className="btn btn-s sm" style={{padding:'2px 7px',fontSize:10}} onClick={()=>{
              const match=form.expenses.find(e=>e.category===cat);
              if(match)updateExp(match.id,'amount',Math.round(avg).toString());
              else setForm(f=>({...f,expenses:[...f.expenses,{id:uid(),label:cat.split(' ').slice(1).join(' '),amount:Math.round(avg).toString(),category:cat,due_day:'',is_variable:true}]}));
            }}>Use</button>
          </div>
        </div>
      ))}
    </div>)}

    <div className="card" style={{marginBottom:12}}>
      {hasIncomeSources
        ?<div style={{padding:'10px 0'}}>
           <label>Monthly Take-Home Income</label>
           <div style={{fontFamily:'var(--mono)',fontSize:22,fontWeight:800,color:'var(--green)',marginTop:4}}>{f$(income,2)}</div>
           <div style={{fontSize:11,color:'var(--muted)',marginTop:4}}>Auto-calculated from {sources.length} income source{sources.length!==1?'s':''} in Paycheck Planner. Go to <strong>Money → Paychecks</strong> to edit.</div>
         </div>
        :<div className="fr" style={{margin:0}}><label>Monthly Take-Home Income ($)</label><input type="number" min="0" step="100" placeholder="0" value={form.income} onChange={e=>setForm(f=>({...f,income:e.target.value}))}/><div style={{fontSize:11,color:'var(--muted)',marginTop:4}}>Or set up income sources in <strong>Paycheck Planner</strong> to auto-calculate this.</div></div>}
    </div>
    <div className="card">
      <div style={{fontWeight:700,marginBottom:10}}>Monthly Expenses</div>
      <div style={{fontSize:11,color:'var(--muted)',marginBottom:12}}>Mark an expense <strong>Variable</strong> if it has no fixed due date (gas, groceries, dining). It will be distributed across your paychecks automatically.</div>
      {form.expenses.map(e=>(<div key={e.id} style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,padding:'10px',marginBottom:8}}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 80px',gap:7,marginBottom:7,alignItems:'end'}}>
          <div><label>Label</label><input placeholder="e.g. Groceries" value={e.label} onChange={ev=>updateExp(e.id,'label',ev.target.value)}/></div>
          <div><label>Category</label><select value={e.category} onChange={ev=>updateExp(e.id,'category',ev.target.value)}>{CATS.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
          <div><label>$/mo</label><input type="number" min="0" step="1" value={e.amount} onChange={ev=>updateExp(e.id,'amount',ev.target.value)}/></div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
          <label style={{display:'flex',alignItems:'center',gap:5,cursor:'pointer',textTransform:'none',letterSpacing:0,fontWeight:500,fontSize:12,marginBottom:0}}>
            <input type="checkbox" checked={!!e.is_variable} onChange={ev=>updateExp(e.id,'is_variable',ev.target.checked)} style={{width:'auto',accentColor:'var(--amber)'}}/>
            Variable (no fixed due date)
          </label>
          {(e.is_variable||!e.due_day)&&<label style={{display:'flex',alignItems:'center',gap:5,cursor:'pointer',textTransform:'none',letterSpacing:0,fontWeight:500,fontSize:12,marginBottom:0}}>
            <input type="checkbox" checked={!!e.rollover} onChange={ev=>setForm(f=>({...f,expenses:f.expenses.map(x=>x.id===e.id?{...x,rollover:ev.target.checked,rollover_from:ev.target.checked?(x.rollover_from||monthKey()):null}:x)}))} style={{width:'auto',accentColor:'var(--green)'}}/>
            Roll over unspent money
          </label>}
          {!e.is_variable&&<div style={{display:'flex',alignItems:'center',gap:6,flex:1}}>
            <label style={{marginBottom:0,whiteSpace:'nowrap',fontSize:11}}>Due Day</label>
            <input type="number" min="1" max="31" placeholder="—" value={e.due_day||''} onChange={ev=>updateExp(e.id,'due_day',ev.target.value)} style={{width:60}}/>
          </div>}
          <button className="btn btn-d sm" style={{marginLeft:'auto'}} onClick={()=>removeExp(e.id)}>✕ Remove</button>
        </div>
      </div>))}
      <button className="btn btn-s sm" onClick={addExpense}>+ Add Expense</button>
      <div className="divider"/>
      <button className="btn btn-p btn-full" onClick={save} disabled={saving}>{saving?<span className="spinner"/>:'Save Budget'}</button>
    </div>
  </div>);

  return(<div>
    <div className="st-row">
      <div className="st">Budget</div>
      <div style={{display:'flex',gap:6}}>
        <div style={{display:'flex',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,overflow:'hidden'}}>
          <button className={`btn sm ${budgetView==='current'?'btn-p':'btn-s'}`} style={{borderRadius:0,border:'none'}} onClick={()=>setBudgetView('current')}>This Month</button>
          <button className={`btn sm ${budgetView==='history'?'btn-p':'btn-s'}`} style={{borderRadius:0,border:'none'}} onClick={()=>setBudgetView('history')}>📅 History</button>
        </div>
        {budgetView==='current'&&<button className="btn btn-s sm" onClick={openEdit}>Edit</button>}
      </div>
    </div>

    {/* HISTORY VIEW */}
    {budgetView==='history'&&(<>
      {allMonths.length===0
        ?<div className="card"><div className="empty"><div className="empty-icon">📅</div><p>No spending history yet.</p></div></div>
        :(<>
          <div className="card" style={{marginBottom:12}}>
            <div style={{fontWeight:700,fontSize:13,marginBottom:10}}>Spending vs Income — Last 6 Months</div>
            <div className="chwrap"><canvas ref={trendChartRef}/></div>
          </div>
          {allMonths.map(month=>{
            const{totalSpent,totalKids,byLineId,byCategory,net:mnet,income:minc,txCount}=computeMonth(month);
            const isExpanded=expandedMonth===month;
            const isOver=totalSpent+totalKids>minc;
            const label=new Date(month+'-01').toLocaleDateString('en-US',{month:'long',year:'numeric'});
            const pct=minc>0?Math.min(100,Math.round((totalSpent+totalKids)/minc*100)):0;
            return(<div key={month} style={{marginBottom:8}}>
              <div style={{background:'var(--surface)',border:`1px solid ${isOver?'rgba(240,80,85,.3)':'var(--border)'}`,borderRadius:10,padding:'12px 14px',cursor:'pointer'}} onClick={()=>setExpandedMonth(isExpanded?null:month)}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:14}}>{label}</div>
                    <div style={{fontSize:11,color:'var(--muted)',marginTop:2}}>{txCount} transaction{txCount!==1?'s':''}</div>
                  </div>
                  <div style={{textAlign:'right'}}>
                    <div style={{fontFamily:'var(--mono)',fontSize:15,fontWeight:800,color:isOver?'var(--red)':'var(--text)'}}>{f$(totalSpent+totalKids,2)}</div>
                    <div style={{fontSize:11,fontFamily:'var(--mono)',color:mnet>=0?'var(--green)':'var(--red)',fontWeight:700}}>{mnet>=0?'+':''}{f$(mnet,2)} {mnet>=0?'under':'over'}</div>
                  </div>
                  <div style={{fontSize:16,color:'var(--muted)'}}>{isExpanded?'▲':'▼'}</div>
                </div>
                <div className="pgbar-wrap" style={{marginTop:8}}>
                  <div className="pgbar-fill" style={{width:`${pct}%`,background:isOver?'var(--red)':pct>85?'var(--amber)':'var(--green)'}}/>
                </div>
                <div style={{fontSize:10,color:'var(--muted)',marginTop:4}}>{pct}% of income ({f$(minc,0)})</div>
              </div>
              {isExpanded&&(<div style={{background:'var(--card)',border:'1px solid var(--border)',borderTop:'none',borderRadius:'0 0 10px 10px',padding:'12px 14px'}}>
                {/* Budget lines */}
                {(budget.expenses||[]).length>0&&(<>
                  <div style={{fontSize:11,fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.5px',marginBottom:8}}>Budget Lines</div>
                  {(budget.expenses||[]).map(e=>{
                    const actual=byLineId[e.id]||0;
                    const budgeted=parseFloat(e.amount)||0;
                    const over=actual>budgeted&&budgeted>0;
                    return(<div key={e.id} className="kv" style={{padding:'4px 0',borderBottom:'1px solid var(--border)'}}>
                      <span style={{fontSize:12}}>{e.label||e.category}</span>
                      <span style={{fontFamily:'var(--mono)',fontSize:12,color:over?'var(--red)':actual>0?'var(--text)':'var(--faint)',fontWeight:over?700:400}}>
                        {f$(actual,2)}<span style={{color:'var(--faint)',fontWeight:400}}> / {f$(budgeted,2)}</span>
                      </span>
                    </div>);
                  })}
                </>)}
                {/* Category breakdown for unassigned */}
                {Object.keys(byCategory).length>0&&(<>
                  <div style={{fontSize:11,fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.5px',margin:'10px 0 6px'}}>⚠️ Unassigned</div>
                  {Object.entries(byCategory).sort((a,b)=>b[1]-a[1]).map(([cat,amt])=>(
                    <div key={cat} className="kv" style={{padding:'3px 0'}}>
                      <span style={{fontSize:12}}>{cat}</span>
                      <span style={{fontFamily:'var(--mono)',fontSize:12,color:'var(--amber)'}}>{f$(amt,2)}</span>
                    </div>
                  ))}
                </>)}
                {/* Kids */}
                {totalKids>0&&<><div style={{fontSize:11,fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.5px',margin:'10px 0 6px'}}>👨‍👩‍👧‍👦 Family</div>
                  <div className="kv" style={{padding:'3px 0'}}><span style={{fontSize:12}}>Total family spending</span><span style={{fontFamily:'var(--mono)',fontSize:12,color:'var(--purple)'}}>{f$(totalKids,2)}</span></div></>}
                {/* Summary */}
                <div style={{marginTop:10,padding:'8px 10px',background:'var(--surface)',borderRadius:7}}>
                  <div className="kv" style={{padding:'2px 0'}}><span style={{fontSize:12,fontWeight:700}}>Total spent</span><span style={{fontFamily:'var(--mono)',fontWeight:700}}>{f$(totalSpent+totalKids,2)}</span></div>
                  {minc>0&&<div className="kv" style={{padding:'2px 0'}}><span style={{fontSize:12,fontWeight:700}}>Net</span><span style={{fontFamily:'var(--mono)',fontWeight:800,color:mnet>=0?'var(--green)':'var(--red)'}}>{f$(mnet,2)}</span></div>}
                </div>
              </div>)}
            </div>);
          })}
        </>)}
    </>)}

    {/* CURRENT MONTH VIEW */}
    {budgetView==='current'&&(<>
      <div className="grid g3" style={{marginBottom:12}}>
      <div className="mcard"><div className="mlabel">Income</div><div className="mval green">{f$(income)}</div>{hasIncomeSources&&<div className="msub">{(budget.income_sources||[]).length} sources</div>}</div>
      <div className="mcard"><div className="mlabel">Budgeted Out</div><div className="mval red">{f$(totalExp+debtLine+kidMonthTotal,2)}</div><div className="msub">expenses + debt + family</div></div>
      <div className="mcard"><div className="mlabel">Remaining</div><div className="mval" style={{color:netActual>=0?'var(--green)':'var(--red)'}}>{f$(netActual)}</div><div className="msub">after actual spending</div></div>
    </div>
    {budget.committed_strategy&&<div className="commit-badge"><span style={{fontSize:18}}>✅</span><div style={{fontSize:12}}><strong>{budget.committed_strategy==='avalanche'?'Avalanche':'Snowball'} plan active</strong> — {f$(committed,2)}/mo debt payment included</div></div>}

    {(budget.expenses||[]).length?(<>
      <div className="card" style={{marginBottom:12}}><div style={{fontSize:13,fontWeight:700,marginBottom:10}}>Budgeted vs Actual — {new Date(thisMonth+'-01').toLocaleDateString('en-US',{month:'long',year:'numeric'})}</div><div className="chwrap"><canvas ref={chartRef}/></div></div>

      <div className="card">
        <div style={{fontSize:13,fontWeight:700,marginBottom:8}}>By Line Item</div>
        {(budget.expenses||[]).map(e=>{
          const actual=actualByLineId[e.id]||0;
          // With rollover, this month has the line's amount plus what carried in.
          const carried=carry[e.id]||0;
          const budgeted=Math.max(0,(parseFloat(e.amount)||0)+carried);
          const pct=budgeted>0?Math.min(actual/budgeted*100,100):0;
          const over=actual>budgeted&&budgeted>0;
          return(<div key={e.id} className="bva-row">
            <div className="bva-labels">
              <div className="bva-name">
                {e.label||e.category}
                {e.is_variable&&<span className="var-badge" style={{marginLeft:6}}>VAR</span>}
                {carried!==0&&<span style={{fontSize:10,color:carried>0?'var(--green)':'var(--red)',marginLeft:6}}>{carried>0?'+':'-'}{f$(Math.abs(carried))} carried</span>}
                {e.due_day&&!e.is_variable&&<span style={{fontSize:10,color:'var(--muted)',marginLeft:6}}>due {ordinal(e.due_day)}</span>}
              </div>
              <div className="bva-nums">
                <span style={{color:over?'var(--red)':'var(--text)',fontFamily:'var(--mono)',fontWeight:700}}>{f$(actual,2)}</span>
                <span>/ {f$(budgeted,2)}</span>
                {over&&<span style={{color:'var(--red)',fontWeight:700}}>+{f$(actual-budgeted,2)}</span>}
                {!over&&budgeted>0&&<span style={{color:'var(--green)'}}>{f$(budgeted-actual,2)} left</span>}
                {!over&&paceById[e.id]?.perDay>0&&<span>{f$(paceById[e.id].perDay)}/day</span>}
                {paceById[e.id]?.status==='ahead'&&<span style={{color:'var(--amber)',fontWeight:700}}>ahead of pace</span>}
              </div>
            </div>
            <div className="bva-track"><div className="bva-fill" style={{width:`${pct}%`,background:over?'var(--red)':pct>80||paceById[e.id]?.status==='ahead'?'var(--amber)':'var(--green)'}}/></div>
          </div>);
        })}
        {(()=>{
          return(<>
            {orphanDebtMins>0&&<><div className="divider"/><div className="kv" style={{padding:'6px 0'}}><span>🏦 Other Debt Minimums <span style={{fontSize:10,color:'var(--muted)'}}>(no budget line — edit debt to create one)</span></span><span style={{fontFamily:'var(--mono)',color:'var(--red)'}}>{f$(orphanDebtMins,2)}/mo</span></div></>}
            {committedExtra>0&&<><div className="divider"/><div className="kv" style={{padding:'6px 0'}}><span>💡 Extra Payoff ({budget.committed_strategy})</span><span style={{fontFamily:'var(--mono)',color:'var(--green)'}}>{f$(committedExtra,2)}/mo</span></div></>}
          </>);
        })()}
        {kidMonthTotal>0&&(<>
          <div className="divider"/>
          <div style={{marginBottom:4}}>
            <div className="kv" style={{padding:'4px 0'}}>
              <span style={{fontWeight:700}}>👨‍👩‍👧‍👦 Family Spending</span>
              <span style={{fontFamily:'var(--mono)',color:'var(--purple)',fontWeight:700}}>{f$(kidMonthTotal,2)}</span>
            </div>
            {kidByName.map(([name,amt])=>(
              <div key={name} className="kv" style={{padding:'2px 0 2px 12px'}}>
                <span style={{fontSize:12,color:'var(--muted)'}}>{name}</span>
                <span style={{fontFamily:'var(--mono)',fontSize:12,color:'var(--purple)'}}>{f$(amt,2)}</span>
              </div>
            ))}
          </div>
        </>)}
        {miscTotal>0&&(<>
          <div className="divider"/>
          <div>
            <div className="kv" style={{padding:'4px 0 8px'}}>
              <span style={{fontWeight:700}}>⚠️ Unassigned Spending</span>
              <span style={{fontFamily:'var(--mono)',color:'var(--amber)',fontWeight:700}}>{f$(miscTotal,2)}</span>
            </div>
            <div style={{fontSize:11,color:'var(--muted)',marginBottom:8}}>Spending not linked to any budget line. Tap a transaction in the Spending tab to assign it.</div>
            {miscTransactions.map(t=>(
              <div key={t.id} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 0',borderBottom:'1px solid var(--border)'}}>
                <div style={{fontSize:15}}>{catIcon(t.category||'Other')}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:12,fontWeight:600,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{t.merchant||t.description||t.category}</div>
                  <div style={{fontSize:10,color:'var(--muted)'}}>{t.category} · {fshort(t.date)}</div>
                </div>
                <div style={{fontFamily:'var(--mono)',fontSize:12,fontWeight:700,color:'var(--amber)',whiteSpace:'nowrap'}}>{f$(t.amount,2)}</div>
              </div>
            ))}
          </div>
        </>)}
        <div className="divider"/>
        <KV label="Net (after all spending)" val={f$(netActual)} color={netActual>=0?'var(--green)':'var(--red)'}/>
      </div>
    </>):<div className="card"><div className="empty"><div className="empty-icon">📊</div><p>No budget set up yet.</p><button className="btn btn-p" style={{marginTop:12}} onClick={openEdit}>Set Up Budget</button></div></div>}
    </>)}
  </div>);
}
