import { useEffect, useMemo, useState } from 'react';
import { Modal } from '../../components/ui';
import { apiAddTransaction, apiDeleteKidExpense, apiDeleteTransaction, apiFetchRules, apiUpdateTransaction } from '../../lib/api';
import { matchRule } from '../../lib/import/merchant';
import { ImportStatement } from './ImportStatement';
import { buildItemHistory } from '../../lib/budget';
import { CATS, CAT_COLORS, QUICK_CATS } from '../../lib/constants';
import { catIcon, f$, fdate, today } from '../../lib/format';

export function TransactionsTab({transactions,setTransactions,householdId,userId,openScanner,budget,kids,kidExpenses,setKidExpenses}){
  const[view,setView]=useState('list');
  const[mode,setMode]=useState('list');
  const[filter,setFilter]=useState('all');const[search,setSearch]=useState('');
  const[itemSearch,setItemSearch]=useState('');
  const[form,setForm]=useState({amount:'',category:CATS[1],budget_line_id:'',merchant:'',description:'',date:today()});
  const[quickCat,setQuickCat]=useState(null);const[quickAmt,setQuickAmt]=useState('');const[quickNote,setQuickNote]=useState('');
  const[saving,setSaving]=useState(false);const[deleting,setDeleting]=useState(null);
  const[editing,setEditing]=useState(null);
  const[editForm,setEditForm]=useState(null);
  const budgetExpenses=budget?.expenses||[];
  const[showImport,setShowImport]=useState(false);
  // Merchant rules (0.6.0) also fill in the budget line when a merchant is typed by hand.
  const[rules,setRules]=useState([]);
  useEffect(()=>{if(householdId)apiFetchRules(householdId).then(({data})=>setRules(data))},[householdId,showImport]);
  function setMerchant(merchant){
    setForm(f=>{
      const next={...f,merchant};
      if(f.budget_line_id)return next;
      const rule=matchRule(rules,merchant);
      const line=rule?.action==='line'&&budgetExpenses.find(e=>e.id===rule.budget_line_id);
      return line?{...next,budget_line_id:line.id,category:line.category||f.category}:next;
    });
  }
  function handleImported(rows){
    if(!rows?.length)return;
    setTransactions(prev=>{const have=new Set(prev.map(t=>t.id));return[...rows.filter(r=>!have.has(r.id)),...prev]});
  }

  // Merge kid expenses into unified display list
  const mergedItems=useMemo(()=>{
    const txItems=(transactions||[]).map(t=>({...t,_type:'tx'}));
    const kidItems=(kidExpenses||[]).map(ke=>{
      const kid=(kids||[]).find(k=>k.id===ke.kid_id);
      return{
        id:ke.id,_type:'family',
        amount:ke.amount,date:ke.date,
        merchant:kid?kid.name:'Family',
        description:ke.description||ke.category,
        category:ke.category,
        _kidColor:kid?.color||'var(--purple)',
        _kidEmoji:kid?.emoji||'👨‍👩‍👧‍👦',
        _kidName:kid?.name||'Family',
      };
    });
    return[...txItems,...kidItems].sort((a,b)=>new Date(b.date)-new Date(a.date)||new Date(b.created_at||0)-new Date(a.created_at||0));
  },[transactions,kidExpenses,kids]);

  async function deleteFamilyItem(id){
    setDeleting(id);
    const{error}=await apiDeleteKidExpense(id);
    if(!error)setKidExpenses(prev=>prev.filter(ke=>ke.id!==id));
    setDeleting(null);
  }

  function openEdit(tx){
    setEditing(tx);
    setEditForm({
      amount:tx.amount||'',
      category:tx.category||CATS[1],
      budget_line_id:tx.budget_line_id||'',
      merchant:tx.merchant||'',
      description:tx.description||'',
      date:tx.date||today(),
      items:(tx.items||[]).map(i=>({...i,budget_line_id:i.budget_line_id||'',included:i.included!==false})),
    });
  }

  async function saveEdit(){
    if(!editForm||!editing)return;setSaving(true);
    const updates={
      amount:parseFloat(editForm.amount)||0,
      category:editForm.category,
      budget_line_id:editForm.budget_line_id||null,
      merchant:editForm.merchant,
      description:editForm.description,
      date:editForm.date,
      items:editForm.items,
    };
    const{data,error}=await apiUpdateTransaction(editing.id,updates);
    if(!error&&data)setTransactions(prev=>prev.map(t=>t.id===editing.id?data:t));
    setEditing(null);setEditForm(null);setSaving(false);
  }

  function updateEditItem(id,field,val){
    setEditForm(f=>({...f,items:f.items.map(i=>i.id===id?{...i,[field]:field==='price'?parseFloat(val)||0:val}:i)}));
  }

  async function addTx(){
    if(!form.amount||!form.date)return;setSaving(true);
    const{data,error}=await apiAddTransaction({amount:parseFloat(form.amount),category:form.category,budget_line_id:form.budget_line_id||null,merchant:form.merchant,description:form.description,date:form.date,items:null},householdId,userId);
    if(!error&&data)setTransactions(prev=>[data,...prev]);
    setMode('list');setForm({amount:'',category:CATS[1],budget_line_id:'',merchant:'',description:'',date:today()});setSaving(false);
  }

  async function addQuick(){
    if(!quickAmt||!quickCat)return;setSaving(true);
    const QUICK_CAT_MAP={
      'Groceries':'🛒 Groceries',
      'Restaurants':'🍽️ Restaurants & Dining',
      'Fast Food':'🍔 Fast Food',
      'Coffee':'☕ Coffee & Drinks',
      'Bars':'🍺 Bars & Going Out',
      'Gas':'⛽ Gas & Fuel',
      'Entertainment':'🎉 Entertainment',
      'Gifts':'🎁 Gifts',
      'Pets':'🐾 Pets',
      'Fitness':'🏋️ Fitness',
      'Household':'🧹 Household & Supplies',
      'Other':'🧾 Other',
    };
    const cat=QUICK_CAT_MAP[quickCat.label]||CATS[CATS.length-1];
    const{data,error}=await apiAddTransaction({amount:parseFloat(quickAmt),category:cat,budget_line_id:null,merchant:quickCat.label,description:quickNote||'',date:today(),items:null},householdId,userId);
    if(!error&&data)setTransactions(prev=>[data,...prev]);
    setQuickCat(null);setQuickAmt('');setQuickNote('');setSaving(false);
  }

  async function deleteTx(id){setDeleting(id);const{error}=await apiDeleteTransaction(id);if(!error)setTransactions(prev=>prev.filter(t=>t.id!==id));setDeleting(null)}

  const months=useMemo(()=>{const seen=new Set();return mergedItems.map(t=>t.date?.slice(0,7)).filter(m=>m&&!seen.has(m)&&seen.add(m))},[mergedItems]);
  const filtered=useMemo(()=>mergedItems.filter(t=>{
    if(filter!=='all'&&t.date?.slice(0,7)!==filter)return false;
    if(search){const q=search.toLowerCase();return(t.merchant||'').toLowerCase().includes(q)||(t.category||'').toLowerCase().includes(q)||(t.description||'').toLowerCase().includes(q)}
    return true;
  }),[mergedItems,filter,search]);
  const total=filtered.reduce((s,t)=>s+(parseFloat(t.amount)||0),0);
  const familyCount=filtered.filter(t=>t._type==='family').length;
  const itemHistory=useMemo(()=>buildItemHistory(transactions),[transactions]);
  const filteredItems=useMemo(()=>itemHistory.filter(i=>!itemSearch||i.name.toLowerCase().includes(itemSearch.toLowerCase())),[itemHistory,itemSearch]);

  function blLabel(id){const e=budgetExpenses.find(e=>e.id===id);return e?(e.label||e.category):null}

  return(<div>
    <div className="st-row">
      <div className="st">Spending</div>
      <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
        {view==='list'&&<>
          <button className={`btn sm ${mode==='quick'?'btn-a':'btn-s'}`} onClick={()=>setMode(mode==='quick'?'list':'quick')}>⚡ Quick</button>
          <button className="btn btn-b sm" onClick={openScanner}>📄 Receipt</button>
          <button className="btn btn-s sm" onClick={()=>setShowImport(true)}>Import</button>
          <button className="btn btn-p sm" onClick={()=>setMode(mode==='add'?'list':'add')}>+ Manual</button>
        </>}
        <button className={`btn sm ${view==='items'?'btn-p':'btn-s'}`} onClick={()=>setView(view==='items'?'list':'items')}>🗂 Items</button>
      </div>
    </div>

    {/* Items history view */}
    {view==='items'&&(<>
      <div className="alert alert-info" style={{marginBottom:10}}>All items from scanned receipts — when last bought, how often, average price.</div>
      <div className="fr" style={{marginBottom:10}}><label>Search items</label><input placeholder="e.g. milk, bread..." value={itemSearch} onChange={e=>setItemSearch(e.target.value)}/></div>
      {filteredItems.length===0&&<div className="card"><div className="empty"><div className="empty-icon">🗂</div><p>No item-level data yet. Import a receipt and items will appear here.</p></div></div>}
      {filteredItems.map((item,i)=>{
        const daysSince=item.lastDate?Math.floor((new Date()-new Date(item.lastDate+'T00:00:00'))/86400000):null;
        return(<div key={i} className="item-hist">
          <div style={{width:36,height:36,borderRadius:9,background:'var(--bdim)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,flexShrink:0}}>🛒</div>
          <div style={{flex:1,minWidth:0}}>
            <div className="item-hist-name">{item.name}</div>
            <div className="item-hist-meta">Avg {f$(item.avgPrice,2)} · ×{item.times} · {item.merchants.slice(0,2).join(', ')||'—'}</div>
          </div>
          <div style={{textAlign:'right',flexShrink:0}}>
            <div style={{fontSize:13,fontWeight:700,color:daysSince!=null&&daysSince<=7?'var(--green)':daysSince!=null&&daysSince<=30?'var(--amber)':'var(--muted)'}}>
              {daysSince===0?'Today':daysSince===1?'Yesterday':daysSince!=null?`${daysSince}d ago`:'—'}
            </div>
            <div style={{fontSize:10,color:'var(--muted)'}}>{item.lastDate?fdate(item.lastDate):''}</div>
          </div>
        </div>);
      })}
    </>)}

    {/* Transaction list view */}
    {view==='list'&&(<>
      {mode==='quick'&&(<div className="card" style={{marginBottom:10}}>
        <div style={{fontWeight:700,marginBottom:10,fontSize:13}}>⚡ Quick Add</div>
        <div className="quick-grid">
          {QUICK_CATS.map(q=>(<button key={q.label} className={`quick-btn${quickCat?.label===q.label?' selected':''}`} onClick={()=>setQuickCat(q)}><div className="qb-icon">{q.icon}</div><div className="qb-label">{q.label}</div></button>))}
        </div>
        {quickCat&&(<>
          <div className="fg">
            <div className="fr" style={{margin:0}}><label>Amount ($)</label><input type="number" min="0" step="0.01" placeholder="0.00" value={quickAmt} onChange={e=>setQuickAmt(e.target.value)} autoFocus/></div>
            <div className="fr" style={{margin:0}}><label>Note</label><input placeholder="Optional" value={quickNote} onChange={e=>setQuickNote(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addQuick()}/></div>
          </div>
          <button className="btn btn-p btn-full" style={{marginTop:10}} onClick={addQuick} disabled={saving||!quickAmt}>{saving?<span className="spinner"/>:`Log ${quickCat.icon} ${quickCat.label} — ${quickAmt?f$(quickAmt,2):'$?'}`}</button>
        </>)}
      </div>)}

      {mode==='add'&&(<div className="card" style={{marginBottom:10}}>
        <div style={{fontWeight:700,marginBottom:12,fontSize:13}}>Add Transaction</div>
        <div className="fg">
          <div className="fr"><label>Amount ($)</label><input type="number" min="0" step="0.01" placeholder="0.00" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))}/></div>
          <div className="fr"><label>Date</label><input type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))}/></div>
        </div>
        <div className="fr"><label>Category</label><select value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))}>{CATS.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
        {budgetExpenses.length>0&&<div className="fr"><label>Budget Line (optional — links to specific budget item)</label>
          <select value={form.budget_line_id} onChange={e=>setForm(f=>({...f,budget_line_id:e.target.value}))}>
            <option value="">— not linked —</option>
            {budgetExpenses.map(e=><option key={e.id} value={e.id}>{e.label||e.category}</option>)}
          </select>
        </div>}
        <div className="fr"><label>Merchant / Store</label><input placeholder="e.g. Shell, Kroger" value={form.merchant} onChange={e=>setMerchant(e.target.value)}/></div>
        <div className="fr"><label>Notes</label><input placeholder="Optional" value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))}/></div>
        <div style={{display:'flex',gap:8}}><button className="btn btn-s" style={{flex:1}} onClick={()=>setMode('list')}>Cancel</button><button className="btn btn-p" style={{flex:2}} onClick={addTx} disabled={saving}>{saving?<span className="spinner"/>:'Save'}</button></div>
      </div>)}

      <div className="card" style={{marginBottom:10}}>
        <div className="fg">
          <div className="fr" style={{margin:0}}><label>Month</label><select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All Time</option>{months.map(m=><option key={m} value={m}>{new Date(m+'-01').toLocaleDateString('en-US',{month:'long',year:'numeric'})}</option>)}</select></div>
          <div className="fr" style={{margin:0}}><label>Search</label><input placeholder="Merchant, category..." value={search} onChange={e=>setSearch(e.target.value)}/></div>
        </div>
        {filtered.length>0&&<div style={{marginTop:8,fontSize:11,color:'var(--muted)'}}>{filtered.length} items · <strong style={{color:'var(--red)'}}>{f$(total,2)}</strong>{familyCount>0&&<span style={{color:'var(--purple)',marginLeft:6}}>· {familyCount} family</span>}</div>}
      </div>

      {filtered.length?filtered.map(t=>{
        if(t._type==='family'){
          return(<div key={'ke-'+t.id} className="tx-item" style={{cursor:'default',borderLeft:`3px solid ${t._kidColor}`}}>
            <div className="tx-icon" style={{background:t._kidColor+'22',fontSize:18}}>{t._kidEmoji}</div>
            <div className="tx-info">
              <div className="tx-name">{t.description||t.category} <span style={{fontSize:10,background:'rgba(152,120,232,.15)',color:'var(--purple)',padding:'1px 5px',borderRadius:3,marginLeft:4,fontWeight:700}}>{t._kidName}</span></div>
              <div className="tx-meta"><span>{fdate(t.date)}</span><span style={{color:'var(--purple)',marginLeft:6}}>👨‍👩‍👧‍👦 Family</span></div>
            </div>
            <div style={{display:'flex',gap:5,alignItems:'center'}}>
              <div className="tx-amt" style={{color:'var(--purple)'}}>-{f$(t.amount,2)}</div>
              <button className="btn btn-d sm" style={{padding:'3px 7px'}} onClick={()=>deleteFamilyItem(t.id)} disabled={deleting===t.id}>{deleting===t.id?<span className="spinner"/>:'✕'}</button>
            </div>
          </div>);
        }
        const bl=t.budget_line_id?blLabel(t.budget_line_id):null;
        return(<div key={t.id} className="tx-item" style={{cursor:'pointer'}} onClick={()=>openEdit(t)}>
          <div className="tx-icon" style={{background:`${CAT_COLORS[t.category]||'var(--bl)'}22`}}>{catIcon(t.category||'Other')}</div>
          <div className="tx-info">
            <div className="tx-name">{t.merchant||t.description||t.category}</div>
            <div className="tx-meta" style={{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>
              <span>{fdate(t.date)}</span>
              {bl&&<span className="bl-pill">{bl}</span>}
              {t.items?.length?<span style={{color:'var(--blue)'}}>· {t.items.filter(i=>i.included!==false).length} items</span>:null}
            </div>
          </div>
          <div style={{display:'flex',gap:5,alignItems:'center'}}>
            {/* A negative amount is money back (an imported refund). */}
            <div className={`tx-amt ${t.amount<0?'green':'red'}`}>{t.amount<0?'+':'-'}{f$(Math.abs(t.amount),2)}</div>
            <button className="btn btn-d sm" style={{padding:'3px 7px'}} onClick={e=>{e.stopPropagation();deleteTx(t.id)}} disabled={deleting===t.id}>{deleting===t.id?<span className="spinner"/>:'✕'}</button>
          </div>
        </div>);
      }):<div className="empty"><div className="empty-icon">🧾</div><p>No transactions. Use Quick Add, Receipt, or Manual.</p></div>}
    </>)}

    {/* Edit modal */}
    {editing&&editForm&&(<Modal title={`Edit — ${editing.merchant||'Transaction'}`} onClose={()=>{setEditing(null);setEditForm(null)}}>
      <div className="fg">
        <div className="fr"><label>Amount ($)</label><input type="number" step="0.01" value={editForm.amount} onChange={e=>setEditForm(f=>({...f,amount:e.target.value}))}/></div>
        <div className="fr"><label>Date</label><input type="date" value={editForm.date} onChange={e=>setEditForm(f=>({...f,date:e.target.value}))}/></div>
      </div>
      <div className="fr"><label>Merchant</label><input value={editForm.merchant} onChange={e=>setEditForm(f=>({...f,merchant:e.target.value}))}/></div>
      <div className="fr"><label>Category</label><select value={editForm.category} onChange={e=>setEditForm(f=>({...f,category:e.target.value}))}>{CATS.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
      {budgetExpenses.length>0&&(<div className="fr"><label>Budget Line — links this transaction to a specific budget item</label>
        <select value={editForm.budget_line_id||''} onChange={e=>setEditForm(f=>({...f,budget_line_id:e.target.value}))}>
          <option value="">— not linked —</option>
          {budgetExpenses.map(e=><option key={e.id} value={e.id}>{e.label||e.category}</option>)}
        </select>
      </div>)}
      <div className="fr"><label>Notes</label><input value={editForm.description} onChange={e=>setEditForm(f=>({...f,description:e.target.value}))}/></div>

      {editForm.items?.length>0&&(<>
        <div style={{fontSize:13,fontWeight:700,marginBottom:8,marginTop:4}}>Items — reassign each to a budget line</div>
        <div style={{overflowX:'auto'}}>
          <table className="ri-table">
            <thead>
              <tr>
                <th style={{width:22}}>✓</th>
                <th>Item</th>
                <th style={{width:65}}>Price</th>
                <th style={{width:90}}>Category</th>
                {budgetExpenses.length>0&&<th style={{width:110}}>Budget Line</th>}
              </tr>
            </thead>
            <tbody>
              {editForm.items.map(item=>(
                <tr key={item.id} className={item.included===false?'excluded':''}>
                  <td><input type="checkbox" className="ri-check" checked={item.included!==false} onChange={e=>updateEditItem(item.id,'included',e.target.checked)}/></td>
                  <td><span style={{fontSize:12}}>{item.name}</span></td>
                  <td><span style={{fontFamily:'var(--mono)',fontSize:12}}>{f$(item.price,2)}</span></td>
                  <td>
                    <select value={item.category||CATS[1]} onChange={e=>updateEditItem(item.id,'category',e.target.value)} style={{width:'100%'}}>
                      {CATS.map(c=><option key={c} value={c}>{c.split(' ').slice(1).join(' ')||c}</option>)}
                    </select>
                  </td>
                  {budgetExpenses.length>0&&(
                    <td>
                      <select value={item.budget_line_id||''} onChange={e=>updateEditItem(item.id,'budget_line_id',e.target.value||null)} style={{width:'100%'}}>
                        <option value="">— none —</option>
                        {budgetExpenses.map(e=><option key={e.id} value={e.id}>{e.label||e.category}</option>)}
                      </select>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>)}

      <div style={{display:'flex',gap:8,marginTop:12}}>
        <button className="btn btn-s" style={{flex:1}} onClick={()=>{setEditing(null);setEditForm(null)}}>Cancel</button>
        <button className="btn btn-p" style={{flex:2}} onClick={saveEdit} disabled={saving}>{saving?<span className="spinner"/>:'Save Changes'}</button>
      </div>
    </Modal>)}
    {showImport&&<ImportStatement householdId={householdId} userId={userId} budget={budget} onClose={()=>setShowImport(false)} onImported={handleImported}/>}
  </div>);
}
