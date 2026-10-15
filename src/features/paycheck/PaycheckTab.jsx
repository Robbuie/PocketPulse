import { useState, useEffect, useMemo } from 'react';
import { Modal } from '../../components/ui';
import { apiSaveBudget } from '../../lib/api';
import { CAT_COLORS, FREQS } from '../../lib/constants';
import { f$, today, uid } from '../../lib/format';
import { checksPerMonth, getAllPayDates, monthlyFromSource, totalMonthlyIncome } from '../../lib/income';
import { getBillsInPeriod, getCashFlow, getPayDates } from '../../lib/paycheck';

export function PaycheckTab({budget,setBudget,householdId,debts}){
  const sources=budget.income_sources||[];
  const[showAddSource,setShowAddSource]=useState(false);
  const[editingSource,setEditingSource]=useState(null);
  const[srcForm,setSrcForm]=useState({name:'',frequency:'biweekly',next_date:today(),amount:''});
  const[saving,setSaving]=useState(false);
  const[view,setView]=useState('paychecks');

  // Migrate legacy single-source config on first load
  useEffect(()=>{
    if(sources.length===0&&budget.paycheck_amount>0&&budget.paycheck_next_date){
      const legacy={id:uid(),name:'My Job',frequency:budget.paycheck_frequency||'biweekly',next_date:budget.paycheck_next_date,amount:budget.paycheck_amount};
      const cfg={...budget,income_sources:[legacy]};
      apiSaveBudget(cfg,householdId).then(()=>setBudget(cfg));
    }
  },[]);

  async function saveSources(newSources){
    const totalIncome=totalMonthlyIncome(newSources);
    const cfg={...budget,income_sources:newSources,income:totalIncome};
    await apiSaveBudget(cfg,householdId);
    setBudget(cfg);
  }

  function openAdd(){
    // First source added is primary by default
    const isPrimary=sources.length===0;
    setSrcForm({name:'',frequency:'biweekly',next_date:today(),amount:'',is_primary:isPrimary});
    setEditingSource(null);setShowAddSource(true);
  }
  function openEdit(src){setSrcForm({name:src.name,frequency:src.frequency,next_date:src.next_date,amount:String(src.amount),is_primary:!!src.is_primary});setEditingSource(src);setShowAddSource(true)}

  async function saveSource(){
    if(!srcForm.name.trim()||!srcForm.amount||!srcForm.next_date)return;
    setSaving(true);
    const entry={...srcForm,amount:parseFloat(srcForm.amount)||0,id:editingSource?.id||uid()};
    let newSources=editingSource?sources.map(s=>s.id===editingSource.id?entry:s):[...sources,entry];
    // If this source is being set as primary, clear primary from all others
    if(entry.is_primary){newSources=newSources.map(s=>s.id===entry.id?s:{...s,is_primary:false});}
    // If no primary exists after save, auto-assign to highest-amount source
    if(!newSources.some(s=>s.is_primary)&&newSources.length>0){
      const topId=[...newSources].sort((a,b)=>b.amount-a.amount)[0].id;
      newSources=newSources.map(s=>({...s,is_primary:s.id===topId}));
    }
    await saveSources(newSources);
    setShowAddSource(false);setSaving(false);
  }

  async function setPrimary(id){
    const updated=sources.map(s=>({...s,is_primary:s.id===id}));
    await saveSources(updated);
  }

  async function deleteSource(id){
    if(!confirm('Remove this income source?'))return;
    await saveSources(sources.filter(s=>s.id!==id));
  }

  const[paycheckHistory,setPaycheckHistory]=useState(false);

  const totalMonthly=totalMonthlyIncome(sources);
  const committed=budget.committed_payment||0;
  // Primary = marked is_primary, or highest-amount source as fallback
  const primarySource=sources.find(s=>s.is_primary)||[...sources].sort((a,b)=>b.amount-a.amount)[0]||null;
  const secondarySources=sources.filter(s=>s.id!==primarySource?.id);
  // Generate a large window of primary dates so we can find today's position
  const allPrimaryDates=useMemo(()=>primarySource?getPayDates(primarySource.frequency||'biweekly',primarySource.next_date,36):[],[primarySource]);
  const todayD=useMemo(()=>{const d=new Date();d.setHours(0,0,0,0);return d;},[]);
  // Find the index of the period that contains today (or the first future period)
  const currentIdx=useMemo(()=>{
    for(let i=0;i<allPrimaryDates.length;i++){
      const pd=allPrimaryDates[i];
      const nextPd=allPrimaryDates[i+1]||new Date(pd.getTime()+(14*86400000));
      if(pd<=todayD&&todayD<nextPd)return i;
    }
    // All in past or all future — find first future
    const futureIdx=allPrimaryDates.findIndex(d=>d>=todayD);
    return futureIdx>=0?futureIdx:0;
  },[allPrimaryDates,todayD]);
  // Future periods (current + next 5)
  const primaryDates=useMemo(()=>allPrimaryDates.slice(currentIdx,currentIdx+6),[allPrimaryDates,currentIdx]);
  // Past periods for history
  const pastDates=useMemo(()=>allPrimaryDates.slice(Math.max(0,currentIdx-6),currentIdx).reverse(),[allPrimaryDates,currentIdx]);
  // All secondary pay dates for lookup
  const secondaryAllDates=useMemo(()=>getAllPayDates(secondarySources,36),[secondarySources]);
  const fixExpenses=(budget.expenses||[]).filter(e=>!e.is_variable&&e.due_day);
  const varExpenses=(budget.expenses||[]).filter(e=>e.is_variable);
  const totalChecksPerMonth=sources.reduce((s,src)=>s+checksPerMonth(src.frequency||'biweekly'),0);
  const cashFlow=useMemo(()=>getCashFlow(budget.expenses,debts,committed,60),[budget.expenses,debts,committed]);

  return(<div>
    <div className="st-row"><div className="st">Paycheck Planner</div><button className="btn btn-p sm" onClick={openAdd}>+ Add Income</button></div>

    {/* Income sources list */}
    {sources.length===0
      ?<div className="card" style={{marginBottom:12}}><div className="empty"><div className="empty-icon">💰</div><p style={{marginBottom:14}}>Add your income sources — one per job or income stream. The budget will automatically use the combined total.</p><button className="btn btn-p" onClick={openAdd}>+ Add Income Source</button></div></div>
      :<>
        {sources.map(src=>{
          const monthly=monthlyFromSource(src);
          const freq=FREQS.find(f=>f.v===src.frequency)?.l||src.frequency;
          const isPrimary=src.id===primarySource?.id;
          return(<div key={src.id} style={{background:'var(--surface)',border:`2px solid ${isPrimary?'rgba(16,208,112,.4)':'var(--border)'}`,borderRadius:10,padding:'12px 14px',marginBottom:8}}>
            <div style={{display:'flex',gap:12,alignItems:'center'}}>
              <div style={{fontSize:28}}>{isPrimary?'💼':'💳'}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <div style={{fontWeight:700,fontSize:14}}>{src.name}</div>
                  {isPrimary
                    ?<span style={{fontSize:10,background:'var(--gdim)',color:'var(--green)',padding:'2px 6px',borderRadius:4,fontWeight:700}}>★ PRIMARY</span>
                    :<button className="btn btn-s sm" style={{fontSize:10,padding:'2px 7px'}} onClick={()=>setPrimary(src.id)}>Set Primary</button>}
                </div>
                <div style={{fontSize:12,color:'var(--muted)',marginTop:2}}>{freq} · {f$(src.amount,2)}/check</div>
                <div style={{fontSize:11,color:isPrimary?'var(--green)':'var(--muted)',fontWeight:700,marginTop:2}}>≈ {f$(monthly,2)}/month{isPrimary?' · drives billing periods':' · shows as bonus income'}</div>
              </div>
              <div style={{display:'flex',gap:6,flexShrink:0}}>
                <button className="btn btn-s sm" onClick={()=>openEdit(src)}>Edit</button>
                <button className="btn btn-d sm" onClick={()=>deleteSource(src.id)}>✕</button>
              </div>
            </div>
          </div>);
        })}
        <div className="mcard" style={{marginBottom:14}}>
          <div className="mlabel">Combined Monthly Income</div>
          <div className="mval green">{f$(totalMonthly,2)}</div>
          <div className="msub">{sources.length} source{sources.length!==1?'s':''} · used in Budget automatically</div>
        </div>
      </>}

    {sources.length>0&&<>
      {budget.committed_strategy&&<div className="commit-badge"><span>✅</span><div style={{fontSize:12}}><strong>{budget.committed_strategy==='avalanche'?'Avalanche':'Snowball'}</strong> — {f$(committed,2)}/mo included in each check</div></div>}

      {varExpenses.length>0&&<div className="card" style={{marginBottom:12,borderLeft:'3px solid var(--amber)'}}>
        <div style={{fontSize:12,fontWeight:700,color:'var(--amber)',marginBottom:8}}>⚡ Variable Expenses — estimated per paycheck</div>
        {varExpenses.map(e=>{
          const perCheck=totalChecksPerMonth>0?(parseFloat(e.amount)||0)/totalChecksPerMonth:0;
          return(<div key={e.id} className="kv" style={{padding:'4px 0'}}>
            <span style={{fontSize:13}}>{e.label||e.category}</span>
            <span style={{fontFamily:'var(--mono)',fontSize:13,color:'var(--amber)'}}>{f$(perCheck,2)}<span style={{fontSize:10,color:'var(--muted)',marginLeft:4}}>/check</span></span>
          </div>);
        })}
        <div style={{fontSize:11,color:'var(--muted)',marginTop:8}}>Based on {totalChecksPerMonth.toFixed(1)} total paychecks/month across all sources</div>
      </div>}

      <div style={{display:'flex',gap:6,marginBottom:12}}>
        <button className={`btn sm ${view==='paychecks'&&!paycheckHistory?'btn-p':'btn-s'}`} onClick={()=>{setView('paychecks');setPaycheckHistory(false)}}>💰 Upcoming</button>
        <button className={`btn sm ${view==='paychecks'&&paycheckHistory?'btn-p':'btn-s'}`} onClick={()=>{setView('paychecks');setPaycheckHistory(true)}}>🕐 Past</button>
        <button className={`btn sm ${view==='cashflow'?'btn-p':'btn-s'}`} onClick={()=>setView('cashflow')}>📅 Cash Flow</button>
      </div>

      {view==='paychecks'&&(<>
        {!primarySource&&<div className="alert alert-warn">Add at least one income source to see the paycheck calendar.</div>}
        {primarySource&&(()=>{
          const datesToShow=paycheckHistory?pastDates:primaryDates;
          if(datesToShow.length===0)return<div className="empty"><div className="empty-icon">{paycheckHistory?'🕐':'💰'}</div><p>{paycheckHistory?'No past periods found.':'No upcoming paychecks found. Check your income source next pay date.'}</p></div>;
          return datesToShow.map((pd,i)=>{
            // For history mode, the period goes forward to the next primary date (which is before current)
            // For future mode, the period goes forward to the next primary date
            const periodEnd=paycheckHistory
              ?(i===0?allPrimaryDates[currentIdx]||new Date(pd.getTime()+(14*86400000)):pastDates[i-1]||new Date(pd.getTime()+(14*86400000)))
              :(primaryDates[i+1]||new Date(pd.getTime()+(14*86400000)));
            const secondaryInPeriod=secondaryAllDates.filter(({date})=>date>=pd&&date<periodEnd);
            const secondaryTotal=secondaryInPeriod.reduce((s,{source:src})=>s+(parseFloat(src.amount)||0),0);
            const combinedIncome=(parseFloat(primarySource.amount)||0)+secondaryTotal;
            const bills=getBillsInPeriod(fixExpenses,debts,pd,periodEnd,!paycheckHistory&&i===0?committed:0);
            const perCheck=totalChecksPerMonth>0?1/totalChecksPerMonth:0;
            const varItems=paycheckHistory?[]:varExpenses.map(e=>({id:'v'+e.id,name:(e.label||e.category)+' (est.)',amount:(parseFloat(e.amount)||0)*perCheck,due:new Date(pd),type:'variable',color:CAT_COLORS[e.category]||'var(--amber)'}));
            const allItems=[...bills,...varItems];
            const totalOut=allItems.reduce((s,b)=>s+b.amount,0);
            const remaining=combinedIncome-totalOut;
            const pdStr=pd.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});
            const endStr=new Date(periodEnd.getTime()-86400000).toLocaleDateString('en-US',{month:'short',day:'numeric'});
            const isCurrent=!paycheckHistory&&i===0;
            return(<div key={pd.toISOString()} className={`pc-card${isCurrent?' current':''}`}>
              <div className="pc-header" style={{marginBottom:secondaryInPeriod.length?6:12}}>
                <div>
                  <div className="pc-label">{isCurrent?'Current Period':paycheckHistory?'Past Period':'Upcoming'} · {pdStr} – {endStr}</div>
                  <div style={{fontWeight:700,fontSize:13,marginTop:2}}>💼 {primarySource.name}</div>
                </div>
                <div className="pc-amount">{f$(primarySource.amount,2)}</div>
              </div>
              {secondaryInPeriod.map(({date,source:sec},j)=>(
                <div key={j} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'4px 0 8px',borderBottom:'1px dashed var(--border)',marginBottom:8}}>
                  <div style={{fontSize:12,fontWeight:600,color:'var(--muted)'}}>💳 {sec.name} <span style={{fontSize:10,fontWeight:400}}>({date.toLocaleDateString('en-US',{month:'short',day:'numeric'})})</span></div>
                  <div style={{fontFamily:'var(--mono)',fontSize:13,fontWeight:700,color:'var(--teal)'}}>+{f$(sec.amount,2)}</div>
                </div>
              ))}
              {secondaryInPeriod.length>0&&(<div style={{display:'flex',justifyContent:'space-between',fontSize:12,fontWeight:700,marginBottom:10,paddingBottom:8,borderBottom:'1px solid var(--border)'}}>
                <span>Combined this period</span>
                <span style={{fontFamily:'var(--mono)',color:'var(--green)'}}>{f$(combinedIncome,2)}</span>
              </div>)}
              {allItems.length?(<>
                {allItems.map((b,j)=>(<div key={j} className="pc-bill">
                  <div style={{width:9,height:9,borderRadius:'50%',background:b.color,flexShrink:0}}/>
                  <div className="pc-bill-name">{b.name}</div>
                  <div className="pc-bill-due">{b.type==='variable'?<span className="var-badge">VAR</span>:b.type==='plan'?'extra':b.due.toLocaleDateString('en-US',{month:'short',day:'numeric'})}</div>
                  <div className="pc-bill-amt" style={{color:b.color}}>-{f$(b.amount,2)}</div>
                </div>))}
                <div className="pc-remaining">
                  <span style={{fontSize:13,fontWeight:600}}>{paycheckHistory?'Bills that period':'Stays in account'}</span>
                  <span style={{fontFamily:'var(--mono)',fontSize:16,fontWeight:800,color:remaining>=0?'var(--green)':'var(--red)'}}>{f$(remaining,2)}</span>
                </div>
              </>):<div style={{fontSize:13,color:'var(--muted)',padding:'8px 0'}}>No bills due · <span style={{color:'var(--green)',fontWeight:700}}>{f$(combinedIncome,2)} {paycheckHistory?'received':'stays in account'}</span></div>}
            </div>);
          });
        })()}
        {fixExpenses.length===0&&varExpenses.length===0&&primarySource&&!paycheckHistory&&<div className="alert alert-warn">Add expenses in Budget. Mark them Variable or set a Due Day to see them here.</div>}
      </>)}

      {view==='cashflow'&&(<>
        <div style={{fontWeight:600,marginBottom:10,fontSize:13}}>Next 60 Days — Fixed Bills</div>
        {cashFlow.length?(<>
          {cashFlow.map((cf,i)=>(<div key={i} className="cf-item" style={{borderLeftColor:cf.color}}>
            <div><div className="cf-day" style={{color:cf.color}}>{cf.date.getDate()}</div><div style={{fontSize:9,color:'var(--muted)'}}>{cf.date.toLocaleDateString('en-US',{weekday:'short'})}</div></div>
            <div><div className="cf-name">{cf.name}</div><div className="cf-tag">{cf.date.toLocaleDateString('en-US',{month:'short',day:'numeric'})} · {cf.type==='debt'?'Debt':'Expense'}</div></div>
            <div className="cf-amt" style={{color:cf.color}}>-{f$(cf.amount,2)}</div>
          </div>))}
          <div style={{fontSize:12,color:'var(--muted)',marginTop:8,textAlign:'center'}}>60-day total: <strong style={{color:'var(--red)'}}>{f$(cashFlow.reduce((s,c)=>s+c.amount,0),2)}</strong></div>
        </>):<div className="empty"><div className="empty-icon">📅</div><p>Add due dates to debts and fixed expenses to see the cash flow timeline.</p></div>}
      </>)}
    </>}

    {showAddSource&&<Modal title={editingSource?'Edit Income Source':'Add Income Source'} onClose={()=>setShowAddSource(false)}>
      <div className="fr"><label>Name / Label</label><input placeholder="e.g. Robbuie's Job, Part-time, Side income" value={srcForm.name} onChange={e=>setSrcForm(f=>({...f,name:e.target.value}))} autoFocus/></div>
      <div className="fr"><label>Pay Frequency</label><select value={srcForm.frequency} onChange={e=>setSrcForm(f=>({...f,frequency:e.target.value}))}>{FREQS.map(fr=><option key={fr.v} value={fr.v}>{fr.l}</option>)}</select></div>
      <div className="fg">
        <div className="fr"><label>Net Amount Per Check ($)</label><input type="number" min="0" step="50" placeholder="0.00" value={srcForm.amount} onChange={e=>setSrcForm(f=>({...f,amount:e.target.value}))}/></div>
        <div className="fr"><label>Next Pay Date</label><input type="date" value={srcForm.next_date} onChange={e=>setSrcForm(f=>({...f,next_date:e.target.value}))}/></div>
      </div>
      {sources.length>0&&<label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',textTransform:'none',letterSpacing:0,fontWeight:500,fontSize:13,marginBottom:12}}>
        <input type="checkbox" checked={!!srcForm.is_primary} onChange={e=>setSrcForm(f=>({...f,is_primary:e.target.checked}))} style={{width:'auto',accentColor:'var(--green)'}}/>
        ★ Set as primary income (billing periods follow this schedule)
      </label>}
      {srcForm.amount&&srcForm.frequency&&<div style={{fontSize:12,color:'var(--green)',fontWeight:700,padding:'8px 10px',background:'var(--gdim)',borderRadius:7,marginBottom:12}}>≈ {f$(monthlyFromSource(srcForm),2)}/month</div>}
      <button className="btn btn-p btn-full" onClick={saveSource} disabled={saving||!srcForm.name.trim()||!srcForm.amount}>{saving?<span className="spinner"/>:'Save'}</button>
    </Modal>}
  </div>);
}
