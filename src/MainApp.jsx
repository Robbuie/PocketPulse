import { useState, useEffect } from 'react';
import { RecurringTab } from './features/recurring/RecurringTab';
import { dueAutologs } from './lib/recurring';
import { BudgetTab } from './features/budget/BudgetTab';
import { Dashboard } from './features/dashboard/Dashboard';
import { DebtsTab } from './features/debts/DebtsTab';
import { FamilyTab } from './features/kids/FamilyTab';
import { PaycheckTab } from './features/paycheck/PaycheckTab';
import { SettingsTab } from './features/settings/SettingsTab';
import { GroceryTab } from './features/shopping/GroceryTab';
import { ReceiptScanner } from './features/spending/ReceiptScanner';
import { TransactionsTab } from './features/spending/TransactionsTab';
import { apiFetchBudget, apiFetchDebts, apiFetchKidExpenses, apiFetchKids, apiFetchRecurring, apiFetchTransactions, apiImportTransactions } from './lib/api';
import { sb } from './lib/supabase';
import { useOnline } from './lib/useOnline';

export function MainApp({user,profile,household}){
  const[tab,setTab]=useState('dashboard');
  const[debts,setDebts]=useState([]);const[transactions,setTransactions]=useState([]);
  const[budget,setBudget]=useState({income:0,expenses:[],paycheck_frequency:'biweekly',committed_strategy:null,committed_payment:0});
  const[kids,setKids]=useState([]);const[kidExpenses,setKidExpenses]=useState([]);
  const[recurring,setRecurring]=useState([]);
  const[showScanner,setShowScanner]=useState(false);const[loading,setLoading]=useState(true);
  const hid=household?.id;const uid2=user?.id;
  const online=useOnline();

  useEffect(()=>{
    if(!hid)return;
    Promise.all([
      apiFetchDebts(hid).then(setDebts),
      apiFetchTransactions(hid).then(setTransactions),
      apiFetchBudget(hid).then(d=>{if(d)setBudget({income:d.income||0,expenses:d.expenses||[],...d})}),
      apiFetchKids(hid).then(setKids),
      apiFetchKidExpenses(hid).then(setKidExpenses),
      apiFetchRecurring(hid).then(({data})=>setRecurring(data)),
    ]).finally(()=>setLoading(false));
  },[hid]);

  // Recurring items set to log themselves are entered once their due date
  // has come with no matching charge. Runs after loading and whenever the
  // items change; the unique import_id makes a repeat, or the other phone
  // doing the same, a no-op.
  useEffect(()=>{
    if(loading||!hid)return;
    const due=dueAutologs(recurring,transactions,budget.expenses);
    if(!due.length)return;
    apiImportTransactions(due,hid,uid2).then(({data})=>{
      if(data?.length)setTransactions(prev=>{const have=new Set(prev.map(t=>t.id));return[...data.filter(r=>!have.has(r.id)),...prev]});
    });
  // transactions is read, not watched: watching it would re-run on every change.
  },[loading,recurring,hid]);

  useEffect(()=>{
    if(!sb||!hid)return;
    const ch=sb.channel(`hh-${hid}`).on('postgres_changes',{event:'INSERT',schema:'public',table:'transactions',filter:`household_id=eq.${hid}`},(p)=>{if(p.new&&p.new.user_id!==uid2)setTransactions(prev=>[p.new,...prev])}).subscribe();
    return()=>sb.removeChannel(ch);
  },[hid,uid2]);

  async function signOut(){await sb.auth.signOut();window.location.reload()}
  function handleScanned(tx){setTransactions(prev=>[tx,...prev]);setShowScanner(false);setTab('transactions')}

  // 5 bottom nav tabs. "money" and "more" are meta-tabs with sub-navigation inside.
  const BNAV=[
    {id:'dashboard',icon:'🏠',short:'Home'},
    {id:'transactions',icon:'💳',short:'Spend'},
    {id:'money',icon:'📊',short:'Money'},
    {id:'debts',icon:'📋',short:'Debts'},
    {id:'more',icon:'☰',short:'More'},
  ];

  // money sub-tab state
  const[moneySub,setMoneySub]=useState('budget'); // budget | paycheck | recurring
  // more drawer state
  const[showMore,setShowMore]=useState(false);

  // Map "more" items to real tabs
  const MORE_ITEMS=[
    {id:'kids',icon:'👨‍👩‍👧‍👦',l:'Family Spending'},
    {id:'grocery',icon:'🛒',l:'Shopping List'},
    {id:'settings',icon:'⚙️',l:'Settings'},
  ];

  function handleBnav(id){
    if(id==='more'){setShowMore(s=>!s);return;}
    setShowMore(false);
    setTab(id);
  }

  function handleMoreItem(id){
    setShowMore(false);
    setTab(id);
  }

  // Which bnav item should appear active
  const activeBnav=
    tab==='budget'||tab==='paycheck'||tab==='recurring'?'money':
    ['kids','grocery','settings'].includes(tab)?'more':
    tab;

  // All desktop nav tabs (header)
  const DESKTOP_TABS=[
    {id:'dashboard',l:'Dashboard'},{id:'transactions',l:'Spending'},
    {id:'budget',l:'Budget'},{id:'paycheck',l:'Paychecks'},{id:'recurring',l:'Recurring'},
    {id:'debts',l:'Debts'},{id:'kids',l:'Family'},
    {id:'grocery',l:'Shopping'},{id:'settings',l:'Settings'},
  ];

  function renderTab(){
    if(loading)return<div style={{textAlign:'center',padding:60}}><div className="spinner" style={{width:32,height:32,borderWidth:3}}/><div style={{marginTop:14,color:'var(--muted)'}}>Loading...</div></div>;
    // Money tab renders budget or paycheck with a sub-tab toggle at top
    if(tab==='money')return(
      <div>
        <div style={{display:'flex',gap:6,marginBottom:16}}>
          <button className={`btn ${moneySub==='budget'?'btn-p':'btn-s'}`} style={{flex:1}} onClick={()=>setMoneySub('budget')}>📊 Budget</button>
          <button className={`btn ${moneySub==='paycheck'?'btn-p':'btn-s'}`} style={{flex:1}} onClick={()=>setMoneySub('paycheck')}>💰 Paychecks</button>
          <button className={`btn ${moneySub==='recurring'?'btn-p':'btn-s'}`} style={{flex:1}} onClick={()=>setMoneySub('recurring')}>Recurring</button>
        </div>
        {moneySub==='budget'&&<BudgetTab budget={budget} setBudget={setBudget} householdId={hid} debts={debts} transactions={transactions} kids={kids} kidExpenses={kidExpenses}/>}
        {moneySub==='paycheck'&&<PaycheckTab budget={budget} setBudget={setBudget} householdId={hid} debts={debts}/>}
        {moneySub==='recurring'&&<RecurringTab recurring={recurring} setRecurring={setRecurring} transactions={transactions} budget={budget} householdId={hid} userId={uid2}/>}
      </div>
    );
    switch(tab){
      case'dashboard':return<Dashboard debts={debts} transactions={transactions} budget={budget} kids={kids} kidExpenses={kidExpenses} userName={profile?.name} onOpenBudget={()=>{setMoneySub('budget');setTab('money')}} recurring={recurring} onOpenRecurring={()=>{setMoneySub('recurring');setTab('money')}}/>;
      case'transactions':return<TransactionsTab transactions={transactions} setTransactions={setTransactions} householdId={hid} userId={uid2} openScanner={()=>setShowScanner(true)} budget={budget} kids={kids} kidExpenses={kidExpenses} setKidExpenses={setKidExpenses}/>;
      case'budget':return<BudgetTab budget={budget} setBudget={setBudget} householdId={hid} debts={debts} transactions={transactions} kids={kids} kidExpenses={kidExpenses}/>;
      case'paycheck':return<PaycheckTab budget={budget} setBudget={setBudget} householdId={hid} debts={debts}/>;
      case'recurring':return<RecurringTab recurring={recurring} setRecurring={setRecurring} transactions={transactions} budget={budget} householdId={hid} userId={uid2}/>;
      case'debts':return<DebtsTab debts={debts} setDebts={setDebts} householdId={hid} budget={budget} setBudget={setBudget} transactions={transactions} setTransactions={setTransactions} userId={uid2}/>;
      case'kids':return<FamilyTab kids={kids} setKids={setKids} kidExpenses={kidExpenses} setKidExpenses={setKidExpenses} householdId={hid} userId={uid2}/>;
      case'grocery':return<GroceryTab budget={budget} setBudget={setBudget} householdId={hid} userId={uid2}/>;
      case'settings':return<SettingsTab user={user} profile={profile} household={household} onSignOut={signOut}/>;
    }
  }

  return(<div className="app">
    <div className="header">
      <div className="logo">PocketPulse 💸</div>
      <div className="nav">{DESKTOP_TABS.map(t=><button key={t.id} className={`nav-btn${tab===t.id?' active':''}`} onClick={()=>{setShowMore(false);setTab(t.id)}}>{t.l}</button>)}</div>
      <div className="huser"><div className="avatar" onClick={()=>setTab('settings')} title="Settings">{(profile?.name||user?.email||'?')[0].toUpperCase()}</div></div>
    </div>
    {!online&&<div className="offline-bar" role="status">You are offline. What you see may be out of date, and changes will not save until you reconnect.</div>}
    <div className="main" onClick={()=>showMore&&setShowMore(false)}>{renderTab()}</div>

    {/* More drawer — slides up above bottom nav */}
    {showMore&&(
      <div style={{position:'fixed',bottom:'calc(60px + env(safe-area-inset-bottom))',left:0,right:0,background:'var(--card)',border:'1px solid var(--border)',borderRadius:'16px 16px 0 0',padding:'12px 16px 8px',zIndex:199,boxShadow:'0 -4px 24px rgba(0,0,0,.4)'}}>
        <div style={{width:36,height:4,background:'var(--border)',borderRadius:2,margin:'0 auto 14px'}}/>
        {MORE_ITEMS.map(item=>(
          <button key={item.id} onClick={()=>handleMoreItem(item.id)} style={{display:'flex',alignItems:'center',gap:14,width:'100%',background:'none',border:'none',color:tab===item.id?'var(--green)':'var(--text)',padding:'12px 4px',borderBottom:'1px solid var(--border)',cursor:'pointer',fontSize:15,fontWeight:tab===item.id?700:500,fontFamily:'inherit'}}>
            <span style={{fontSize:22}}>{item.icon}</span>{item.l}
            {tab===item.id&&<span style={{marginLeft:'auto',color:'var(--green)',fontSize:12}}>✓</span>}
          </button>
        ))}
      </div>
    )}

    <div className="bottom-nav">
      <div className="bnav-items">
        {BNAV.map(t=>(<button key={t.id} className={`bnav-btn${(t.id==='more'?showMore:activeBnav===t.id)?' active':''}`} onClick={()=>handleBnav(t.id)}>
          <span className="bnav-icon">{t.icon}</span>
          <span>{t.short}</span>
        </button>))}
      </div>
    </div>
    {showScanner&&<ReceiptScanner householdId={hid} userId={uid2} onSaved={handleScanned} onClose={()=>setShowScanner(false)} budget={budget}/>}

  </div>);
}
