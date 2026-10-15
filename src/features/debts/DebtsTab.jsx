import { useState } from 'react';
import { Modal } from '../../components/ui';
import { apiAddTransaction, apiDeleteDebt, apiSaveBudget, apiSaveDebt } from '../../lib/api';
import { DTYPES } from '../../lib/constants';
import { amortize, calcDebtInterest, getLastDueDate, splitPayment } from '../../lib/finance';
import { f$, fdate, fmo, getType, monthKey, ordinal, today, uid } from '../../lib/format';
import { StrategiesTab } from './StrategiesTab';

export function DebtsTab({debts,setDebts,householdId,budget,setBudget,transactions,setTransactions,userId}){
  const[subTab,setSubTab]=useState('debts'); // debts | payoff
  const[showAdd,setShowAdd]=useState(false);
  const[editing,setEditing]=useState(null);
  const[form,setForm]=useState({name:'',type:'credit_card',balance:'',rate:'',min_payment:'',due_day:'',note:''});
  const[saving,setSaving]=useState(false);
  const[payDebt,setPayDebt]=useState(null); // debt being paid
  const[payForm,setPayForm]=useState({amount:'',date:today(),note:''});
  const[paySaving,setPaySaving]=useState(false);
  const[expanded,setExpanded]=useState(null); // debt id with history expanded

  // Find the budget line linked to a debt
  function debtBudgetLine(debtId){
    return(budget.expenses||[]).find(e=>e.debt_id===debtId);
  }

  // Sync a debt to the budget — create or update its budget line
  async function syncDebtToBudget(debt,newBudget){
    const expenses=newBudget.expenses||[];
    const existing=expenses.find(e=>e.debt_id===debt.id);
    let newExpenses;
    if(existing){
      newExpenses=expenses.map(e=>e.debt_id===debt.id
        ?{...e,label:debt.name,amount:parseFloat(debt.min_payment)||0,due_day:parseInt(debt.due_day)||null}
        :e);
    }else{
      const line={id:uid(),label:debt.name,category:'🏦 Debt Payment',amount:parseFloat(debt.min_payment)||0,due_day:parseInt(debt.due_day)||null,debt_id:debt.id,is_variable:false};
      newExpenses=[...expenses,line];
    }
    const cfg={...newBudget,expenses:newExpenses};
    await apiSaveBudget(cfg,householdId);
    setBudget(cfg);
    return cfg;
  }

  // Remove a debt's budget line
  async function removeDebtFromBudget(debtId,newBudget){
    const expenses=(newBudget.expenses||[]).filter(e=>e.debt_id!==debtId);
    const cfg={...newBudget,expenses};
    await apiSaveBudget(cfg,householdId);
    setBudget(cfg);
  }

  function openAdd(){setForm({name:'',type:'credit_card',balance:'',rate:'',min_payment:'',due_day:'',note:''});setEditing(null);setShowAdd(true)}
  function openEdit(d){setForm({name:d.name,type:d.type,balance:String(d.balance),rate:String(d.rate),min_payment:String(d.min_payment),due_day:d.due_day||'',note:d.note||''});setEditing(d);setShowAdd(true)}

  async function saveDebt(){
    if(!form.name||!form.balance)return;setSaving(true);
    const debt={...form,balance:parseFloat(form.balance)||0,rate:parseFloat(form.rate)||0,min_payment:parseFloat(form.min_payment)||0,due_day:parseInt(form.due_day)||null,id:editing?.id||uid(),_new:!editing};
    let savedDebt=null;
    if(editing){
      const{data,error}=await apiSaveDebt(debt,householdId);
      if(!error&&data){setDebts(prev=>prev.map(d=>d.id===editing.id?data:d));savedDebt=data;}
    }else{
      const{data,error}=await apiSaveDebt(debt,householdId);
      if(!error&&data){setDebts(prev=>[...prev,data]);savedDebt=data;}
    }
    // Auto-sync to budget if there's a payment amount
    if(savedDebt&&(savedDebt.min_payment>0||editing)){
      await syncDebtToBudget(savedDebt,budget);
    }
    setShowAdd(false);setSaving(false);
  }

  async function del(id){
    if(!confirm('Delete this debt? Its budget line will also be removed.'))return;
    const{error}=await apiDeleteDebt(id);
    if(!error){
      setDebts(prev=>prev.filter(d=>d.id!==id));
      await removeDebtFromBudget(id,budget);
    }
  }

  async function logPayment(){
    if(!payForm.amount||!payDebt)return;
    setPaySaving(true);
    const{newBalance}=splitPayment(payForm.amount,payDebt.balance,payDebt.rate);
    const line=debtBudgetLine(payDebt.id);
    // Log transaction
    const{data,error}=await apiAddTransaction({
      amount:parseFloat(payForm.amount),
      category:'🏦 Debt Payment',
      merchant:payDebt.name,
      description:payForm.note||`Payment on ${payDebt.name}`,
      date:payForm.date,
      budget_line_id:line?.id||null,
      items:null,
    },householdId,userId);
    if(!error&&data){setTransactions(prev=>[data,...prev])}
    // Auto-update debt balance
    const updatedDebt={...payDebt,balance:parseFloat(newBalance.toFixed(2)),_new:false};
    const{data:debtData}=await apiSaveDebt(updatedDebt,householdId);
    if(debtData){
      setDebts(prev=>prev.map(d=>d.id===payDebt.id?debtData:d));
      await syncDebtToBudget(debtData,budget);
    }
    setPayDebt(null);setPayForm({amount:'',date:today(),note:''});
    setPaySaving(false);
  }

  // Recent payments for a debt (transactions linked to its budget line)
  function debtPayments(debtId){
    const line=debtBudgetLine(debtId);
    if(!line)return[];
    return(transactions||[]).filter(t=>t.budget_line_id===line.id).slice(0,5);
  }

  const totalBal=debts.reduce((s,d)=>s+(parseFloat(d.balance)||0),0);
  const totalMin=debts.reduce((s,d)=>s+(parseFloat(d.min_payment)||0),0);

  return(<div>
    {/* Sub-tab toggle */}
    <div style={{display:'flex',gap:6,marginBottom:16}}>
      <button className={`btn ${subTab==='debts'?'btn-p':'btn-s'}`} style={{flex:1}} onClick={()=>setSubTab('debts')}>📋 My Debts</button>
      <button className={`btn ${subTab==='payoff'?'btn-p':'btn-s'}`} style={{flex:1}} onClick={()=>setSubTab('payoff')}>🎯 Payoff Plan</button>
    </div>

    {subTab==='payoff'&&<StrategiesTab debts={debts} budget={budget} setBudget={setBudget} householdId={householdId}/>}

    {subTab==='debts'&&<>
    <div className="st-row"><div className="st">My Debts</div><button className="btn btn-p sm" onClick={openAdd}>+ Add Debt</button></div>
    {debts.length>0&&<div className="grid g3" style={{marginBottom:14}}>
      <div className="mcard"><div className="mlabel">Total Debt</div><div className="mval red">{f$(totalBal)}</div></div>
      <div className="mcard"><div className="mlabel">Accounts</div><div className="mval blue">{debts.length}</div></div>
      <div className="mcard"><div className="mlabel">Min. Monthly</div><div className="mval amber">{f$(totalMin)}</div></div>
    </div>}

    {debts.length?debts.map(d=>{
      const t=getType(d.type);
      const{months,totalInterest}=amortize(d.balance,d.rate,d.min_payment);
      const line=debtBudgetLine(d.id);
      const payments=debtPayments(d.id);
      const isExpanded=expanded===d.id;
      const thisMonth=monthKey();
      const paidThisMonth=payments.filter(p=>p.date?.startsWith(thisMonth)).reduce((s,p)=>s+(parseFloat(p.amount)||0),0);
      // Interest accrual since last due date
      const lastDue=getLastDueDate(d.due_day)||payments[0]?.date;
      const interest=calcDebtInterest(d.balance,d.rate,lastDue);

      return(<div key={d.id}>
        <div className="di" style={{cursor:'default'}}>
          <div className="dot" style={{background:t.c}}/>
          <div className="dinfo">
            <div className="dname">
              {d.name} <span className={`tag ${t.tc}`}>{t.l}</span>
              {d.due_day&&<span className="tag tgr" style={{marginLeft:4}}>Due {ordinal(d.due_day)}</span>}
              {line&&<span className="tag tg" style={{marginLeft:4}}>✓ In Budget</span>}
            </div>
            {d.note&&<div style={{fontSize:11,color:'var(--muted)',marginTop:2}}>{d.note}</div>}
            <div className="pgbar-wrap"><div className="pgbar-fill" style={{width:'60%',background:t.c}}/></div>
            <div style={{fontSize:10,color:'var(--muted)',marginTop:4}}>
              Payoff: {fmo(months)} · Est. total interest: {f$(totalInterest)}
              {paidThisMonth>0&&<span style={{color:'var(--green)',marginLeft:8}}>· Paid this month: {f$(paidThisMonth,2)}</span>}
            </div>
            {/* Accrued interest since last due date */}
            {interest.accrued>0.005&&<div style={{fontSize:10,marginTop:3,display:'flex',gap:8,flexWrap:'wrap'}}>
              <span style={{color:'var(--amber)'}}>⏱ {interest.daysSince}d interest: +{f$(interest.accrued,2)}</span>
              <span style={{color:'var(--muted)'}}>→ payoff today: <span style={{fontFamily:'var(--mono)',color:'var(--red)'}}>{f$(interest.currentTotal,2)}</span></span>
            </div>}
          </div>
          <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:2,marginLeft:8}}>
            <div style={{fontFamily:'var(--mono)',fontSize:15,fontWeight:700,color:t.c}}>{f$(d.balance,2)}</div>
            <div style={{fontSize:10,color:'var(--muted)'}}>principal balance</div>
            {interest.accrued>0.005&&<div style={{fontFamily:'var(--mono)',fontSize:11,color:'var(--amber)'}}>{f$(interest.currentTotal,2)} w/ interest</div>}
            <div style={{fontSize:11,color:'var(--muted)',marginTop:2}}>{d.rate}% APR · Min {f$(d.min_payment,2)}</div>
            <div style={{display:'flex',gap:4,flexWrap:'wrap',justifyContent:'flex-end',marginTop:2}}>
              <button className="btn btn-p sm" onClick={()=>{setPayDebt(d);setPayForm({amount:String(d.min_payment||''),date:today(),note:''})}}>💳 Pay</button>
              <button className="btn btn-s sm" onClick={()=>setExpanded(isExpanded?null:d.id)}>{isExpanded?'▲':'📋'}</button>
              <button className="btn btn-s sm" onClick={()=>openEdit(d)}>Edit</button>
              <button className="btn btn-d sm" onClick={()=>del(d.id)}>Del</button>
            </div>
          </div>
        </div>

        {/* Payment history */}
        {isExpanded&&(<div style={{background:'var(--card)',border:'1px solid var(--border)',borderTop:'none',borderRadius:'0 0 10px 10px',padding:'10px 14px',marginBottom:10,marginTop:-9}}>
          <div style={{fontSize:12,fontWeight:700,marginBottom:8,color:'var(--muted)'}}>Recent Payments</div>
          {payments.length?(
            payments.map(p=>(<div key={p.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'5px 0',borderBottom:'1px solid var(--border)'}}>
              <div>
                <div style={{fontSize:13,fontWeight:600}}>{f$(p.amount,2)}</div>
                <div style={{fontSize:10,color:'var(--muted)'}}>{fdate(p.date)}{p.description&&p.description!==`Payment on ${d.name}`?` · ${p.description}`:''}</div>
              </div>
              <span style={{fontSize:11,color:'var(--green)'}}>✓ Logged</span>
            </div>))
          ):<div style={{fontSize:12,color:'var(--muted)'}}>No payments logged yet. Tap 💳 Pay to record one.</div>}
          {!line&&<div className="alert alert-warn" style={{marginTop:8,marginBottom:0,fontSize:11}}>No budget line linked. Edit this debt and save to auto-create one.</div>}
        </div>)}
      </div>);
    }):<div className="card"><div className="empty"><div className="empty-icon">🎉</div><p>No debts tracked yet.</p></div></div>}

    {/* Add/Edit debt modal */}
    {showAdd&&<Modal title={editing?'Edit Debt':'Add Debt'} onClose={()=>setShowAdd(false)}>
      {!editing&&<div className="alert alert-info" style={{marginBottom:12,fontSize:11}}>Adding a monthly payment will automatically create a budget line for this debt.</div>}
      <div className="fr"><label>Debt Name</label><input placeholder="e.g. Chase Visa" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/></div>
      <div className="fr"><label>Type</label><select value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))}>{DTYPES.map(t=><option key={t.v} value={t.v}>{t.l}</option>)}</select></div>
      <div className="fg">
        <div className="fr"><label>Balance ($)</label><input type="number" min="0" step="0.01" placeholder="0.00" value={form.balance} onChange={e=>setForm(f=>({...f,balance:e.target.value}))}/></div>
        <div className="fr"><label>APR (%)</label><input type="number" min="0" step="0.01" placeholder="0.00" value={form.rate} onChange={e=>setForm(f=>({...f,rate:e.target.value}))}/></div>
      </div>
      <div className="fg">
        <div className="fr"><label>Monthly Payment ($)</label><input type="number" min="0" step="1" placeholder="0" value={form.min_payment} onChange={e=>setForm(f=>({...f,min_payment:e.target.value}))}/></div>
        <div className="fr"><label>Due Day of Month</label><input type="number" min="1" max="31" placeholder="e.g. 15" value={form.due_day} onChange={e=>setForm(f=>({...f,due_day:e.target.value}))}/></div>
      </div>
      <div className="fr"><label>Note (optional)</label><input placeholder="Reminder or note" value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))}/></div>
      <button className="btn btn-p btn-full" onClick={saveDebt} disabled={saving}>{saving?<span className="spinner"/>:'Save'}</button>
    </Modal>}

    {/* Log payment modal */}
    {payDebt&&(()=>{
      const amt=parseFloat(payForm.amount)||0;
      const{interestPortion,principalPortion,newBalance,monthlyInterest}=splitPayment(amt,payDebt.balance,payDebt.rate);
      const lastDue=getLastDueDate(payDebt.due_day);
      const interest=calcDebtInterest(payDebt.balance,payDebt.rate,lastDue);
      return(<Modal title={`💳 Log Payment — ${payDebt.name}`} onClose={()=>setPayDebt(null)}>
        <div className="fg">
          <div className="fr"><label>Amount Paid ($)</label><input type="number" min="0" step="0.01" placeholder="0.00" value={payForm.amount} onChange={e=>setPayForm(f=>({...f,amount:e.target.value}))} autoFocus/></div>
          <div className="fr"><label>Date</label><input type="date" value={payForm.date} onChange={e=>setPayForm(f=>({...f,date:e.target.value}))}/></div>
        </div>
        <div className="fr"><label>Notes (optional)</label><input placeholder="e.g. Extra principal, autopay" value={payForm.note} onChange={e=>setPayForm(f=>({...f,note:e.target.value}))}/></div>

        {/* Balance snapshot */}
        <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,padding:'10px 12px',marginBottom:12,fontSize:12}}>
          <div className="kv" style={{padding:'2px 0'}}><span className="kv-label">Principal balance</span><span style={{fontFamily:'var(--mono)',color:'var(--red)'}}>{f$(payDebt.balance,2)}</span></div>
          {interest.accrued>0.005&&<><div className="kv" style={{padding:'2px 0'}}><span className="kv-label">Interest since {fdate(lastDue)} ({interest.daysSince}d)</span><span style={{fontFamily:'var(--mono)',color:'var(--amber)'}}>+{f$(interest.accrued,2)}</span></div>
          <div className="kv" style={{padding:'2px 0'}}><span className="kv-label">Payoff today</span><span style={{fontFamily:'var(--mono)',color:'var(--red)',fontWeight:700}}>{f$(interest.currentTotal,2)}</span></div></>}
          <div className="kv" style={{padding:'2px 0'}}><span className="kv-label">Minimum payment</span><span style={{fontFamily:'var(--mono)'}}>{f$(payDebt.min_payment,2)}</span></div>
        </div>

        {/* Live payment breakdown */}
        {amt>0&&<div style={{background:'var(--gdim)',border:'1px solid rgba(16,208,112,.2)',borderRadius:8,padding:'10px 12px',marginBottom:12,fontSize:12}}>
          <div style={{fontWeight:700,marginBottom:6,fontSize:11,color:'var(--green)',textTransform:'uppercase',letterSpacing:'.5px'}}>Payment Breakdown</div>
          <div className="kv" style={{padding:'2px 0'}}><span className="kv-label">→ Interest portion</span><span style={{fontFamily:'var(--mono)',color:'var(--amber)'}}>{f$(interestPortion,2)}</span></div>
          <div className="kv" style={{padding:'2px 0'}}><span className="kv-label">→ Principal reduction</span><span style={{fontFamily:'var(--mono)',color:'var(--green)'}}>{f$(principalPortion,2)}</span></div>
          <div className="divider" style={{margin:'6px 0'}}/>
          <div className="kv" style={{padding:'2px 0'}}><span style={{fontWeight:700}}>New balance after payment</span><span style={{fontFamily:'var(--mono)',fontSize:14,fontWeight:800,color:'var(--blue)'}}>{f$(newBalance,2)}</span></div>
          {amt<monthlyInterest&&<div style={{fontSize:10,color:'var(--amber)',marginTop:6}}>⚠️ Payment is less than monthly interest ({f$(monthlyInterest,2)}) — balance will grow.</div>}
        </div>}

        {debtBudgetLine(payDebt.id)&&<div style={{fontSize:11,color:'var(--green)',marginBottom:12}}>✓ Linked to budget line — counts as actual spending</div>}
        {!debtBudgetLine(payDebt.id)&&<div style={{fontSize:11,color:'var(--amber)',marginBottom:12}}>⚠️ No budget line — edit this debt and save to create one</div>}
        <div style={{display:'flex',gap:8}}>
          <button className="btn btn-s" style={{flex:1}} onClick={()=>setPayDebt(null)}>Cancel</button>
          <button className="btn btn-p" style={{flex:2}} onClick={logPayment} disabled={paySaving||!payForm.amount}>{paySaving?<span className="spinner"/>:'Log & Update Balance'}</button>
        </div>
      </Modal>);
    })()}
    </>}
  </div>);
}
