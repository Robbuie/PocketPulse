import { useState } from 'react';
import { KV, Modal } from '../../components/ui';
import { apiAddKidExpense, apiDeleteKid, apiDeleteKidExpense, apiSaveKid, apiUpdateKidExpense } from '../../lib/api';
import { KID_CATS, KID_COLORS, KID_EMOJIS } from '../../lib/constants';
import { f$, fdate, today, uid } from '../../lib/format';

export function FamilyTab({kids,setKids,kidExpenses,setKidExpenses,householdId,userId}){
  const[view,setView]=useState('list');// list | kid detail id
  const[showAddKid,setShowAddKid]=useState(false);
  const[showAddExp,setShowAddExp]=useState(false);
  const[editingExp,setEditingExp]=useState(null);
  const[editExpForm,setEditExpForm]=useState(null);
  const[kidForm,setKidForm]=useState({name:'',emoji:'👦',color:'#10d070'});
  const[expForm,setExpForm]=useState({amount:'',category:KID_CATS[0],description:'',date:today()});
  const[saving,setSaving]=useState(false);
  const[deleting,setDeleting]=useState(null);
  const thisMonth=new Date().toISOString().slice(0,7);

  const activeKid=kids.find(k=>k.id===view);

  async function saveKid(){
    if(!kidForm.name.trim())return;setSaving(true);
    const kid={...kidForm,id:uid(),_new:true};
    const{data,error}=await apiSaveKid(kid,householdId);
    if(!error&&data)setKids(prev=>[...prev,data]);
    setShowAddKid(false);setKidForm({name:'',emoji:'👦',color:'#10d070'});setSaving(false);
  }

  async function deleteKid(id){
    if(!confirm('Remove this member and all their spending?'))return;
    const{error}=await apiDeleteKid(id);
    if(!error){setKids(prev=>prev.filter(k=>k.id!==id));setKidExpenses(prev=>prev.filter(ke=>ke.kid_id!==id));setView('list')}
  }

  async function addExpense(kidId){
    if(!expForm.amount)return;setSaving(true);
    const{data,error}=await apiAddKidExpense({kid_id:kidId,amount:parseFloat(expForm.amount),category:expForm.category,description:expForm.description,date:expForm.date},householdId,userId);
    if(!error&&data)setKidExpenses(prev=>[data,...prev]);
    setShowAddExp(false);setExpForm({amount:'',category:KID_CATS[0],description:'',date:today()});setSaving(false);
  }

  function openEditExp(ke){setEditingExp(ke);setEditExpForm({amount:String(ke.amount),category:ke.category,description:ke.description||'',date:ke.date});}

  async function saveEditExp(){
    if(!editExpForm||!editingExp)return;setSaving(true);
    const updates={amount:parseFloat(editExpForm.amount)||0,category:editExpForm.category,description:editExpForm.description,date:editExpForm.date};
    const{data,error}=await apiUpdateKidExpense(editingExp.id,updates);
    if(!error&&data)setKidExpenses(prev=>prev.map(ke=>ke.id===editingExp.id?{...ke,...updates}:ke));
    setEditingExp(null);setEditExpForm(null);setSaving(false);
  }

  async function deleteExp(id){setDeleting(id);const{error}=await apiDeleteKidExpense(id);if(!error)setKidExpenses(prev=>prev.filter(ke=>ke.id!==id));setDeleting(null)}

  // Kid detail view
  if(activeKid){
    const expenses=kidExpenses.filter(ke=>ke.kid_id===activeKid.id);
    const monthExp=expenses.filter(ke=>ke.date?.startsWith(thisMonth));
    const monthTotal=monthExp.reduce((s,ke)=>s+(parseFloat(ke.amount)||0),0);
    const allTotal=expenses.reduce((s,ke)=>s+(parseFloat(ke.amount)||0),0);
    const catBreak=KID_CATS.map(c=>({cat:c,total:expenses.filter(ke=>ke.category===c).reduce((s,ke)=>s+(parseFloat(ke.amount)||0),0)})).filter(c=>c.total>0);
    return(<div>
      <div className="st-row">
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <button className="btn btn-s sm" onClick={()=>setView('list')}>← Back</button>
          <div style={{fontSize:26}}>{activeKid.emoji}</div>
          <div className="st" style={{marginBottom:0}}>{activeKid.name}</div>
        </div>
        <div style={{display:'flex',gap:6}}>
          <button className="btn btn-p sm" onClick={()=>setShowAddExp(true)}>+ Add</button>
          <button className="btn btn-d sm" onClick={()=>deleteKid(activeKid.id)}>Delete</button>
        </div>
      </div>
      <div className="grid g3" style={{marginBottom:14}}>
        <div className="mcard"><div className="mlabel">This Month</div><div className="mval" style={{color:activeKid.color||'var(--purple)'}}>{f$(monthTotal,2)}</div></div>
        <div className="mcard"><div className="mlabel">All Time</div><div className="mval">{f$(allTotal,2)}</div></div>
        <div className="mcard"><div className="mlabel">Entries</div><div className="mval blue">{expenses.length}</div></div>
      </div>
      {catBreak.length>0&&<div className="card" style={{marginBottom:12}}>
        <div style={{fontWeight:700,marginBottom:10,fontSize:13}}>By Category</div>
        {catBreak.map(({cat,total})=>(<div key={cat} className="kv" style={{padding:'4px 0'}}><span style={{fontSize:12}}>{cat}</span><span style={{fontFamily:'var(--mono)',fontSize:13,color:activeKid.color||'var(--purple)'}}>{f$(total,2)}</span></div>))}
      </div>}
      {expenses.length?expenses.map(ke=>(<div key={ke.id} className="ke-item">
        <div style={{fontSize:20}}>{ke.category?.split(' ')[0]||'🧾'}</div>
        <div style={{flex:1,minWidth:0}}><div style={{fontWeight:600,fontSize:13}}>{ke.description||ke.category}</div><div style={{fontSize:11,color:'var(--muted)'}}>{ke.category} · {fdate(ke.date)}</div></div>
        <div style={{fontFamily:'var(--mono)',fontSize:14,fontWeight:700,color:activeKid.color||'var(--purple)',marginRight:6}}>-{f$(ke.amount,2)}</div>
        <button className="btn btn-s sm" style={{padding:'3px 7px'}} onClick={()=>openEditExp(ke)}>✏️</button>
        <button className="btn btn-d sm" style={{padding:'3px 7px'}} onClick={()=>deleteExp(ke.id)} disabled={deleting===ke.id}>{deleting===ke.id?<span className="spinner"/>:'✕'}</button>
      </div>)):<div className="empty"><div className="empty-icon">{activeKid.emoji}</div><p>No spending logged for {activeKid.name} yet.</p></div>}

      {/* Edit expense modal */}
      {editingExp&&editExpForm&&<Modal title="Edit Expense" onClose={()=>{setEditingExp(null);setEditExpForm(null)}}>
        <div className="fg">
          <div className="fr"><label>Amount ($)</label><input type="number" min="0" step="0.01" value={editExpForm.amount} onChange={e=>setEditExpForm(f=>({...f,amount:e.target.value}))}/></div>
          <div className="fr"><label>Date</label><input type="date" value={editExpForm.date} onChange={e=>setEditExpForm(f=>({...f,date:e.target.value}))}/></div>
        </div>
        <div className="fr"><label>Category</label>
          <div style={{display:'flex',flexWrap:'wrap',gap:6,marginTop:4}}>
            {KID_CATS.map(c=>(<button key={c} className={`btn sm ${editExpForm.category===c?'btn-p':'btn-s'}`} onClick={()=>setEditExpForm(f=>({...f,category:c}))}>{c}</button>))}
          </div>
        </div>
        <div className="fr"><label>Description</label><input placeholder="What was this for?" value={editExpForm.description} onChange={e=>setEditExpForm(f=>({...f,description:e.target.value}))}/></div>
        <div style={{display:'flex',gap:8}}>
          <button className="btn btn-s" style={{flex:1}} onClick={()=>{setEditingExp(null);setEditExpForm(null)}}>Cancel</button>
          <button className="btn btn-p" style={{flex:2}} onClick={saveEditExp} disabled={saving}>{saving?<span className="spinner"/>:'Save Changes'}</button>
        </div>
      </Modal>}
      {showAddExp&&<Modal title={`Add Expense for ${activeKid.name}`} onClose={()=>setShowAddExp(false)}>
        <div className="fg">
          <div className="fr"><label>Amount ($)</label><input type="number" min="0" step="0.01" placeholder="0.00" value={expForm.amount} onChange={e=>setExpForm(f=>({...f,amount:e.target.value}))}/></div>
          <div className="fr"><label>Date</label><input type="date" value={expForm.date} onChange={e=>setExpForm(f=>({...f,date:e.target.value}))}/></div>
        </div>
        <div className="fr"><label>Category</label>
          <div style={{display:'flex',flexWrap:'wrap',gap:6,marginTop:4}}>
            {KID_CATS.map(c=>(<button key={c} className={`btn sm ${expForm.category===c?'btn-p':'btn-s'}`} onClick={()=>setExpForm(f=>({...f,category:c}))}>{c}</button>))}
          </div>
        </div>
        <div className="fr"><label>Description</label><input placeholder="e.g. Lego set at Target" value={expForm.description} onChange={e=>setExpForm(f=>({...f,description:e.target.value}))}/></div>
        <button className="btn btn-p btn-full" onClick={()=>addExpense(activeKid.id)} disabled={saving}>{saving?<span className="spinner"/>:'Save'}</button>
      </Modal>}
    </div>);
  }

  // List view
  return(<div>
    <div className="st-row"><div className="st">Family Spending 👨‍👩‍👧‍👦</div><button className="btn btn-p sm" onClick={()=>setShowAddKid(true)}>+ Add Member</button></div>
    {kids.length?(
      kids.map(kid=>{
        const monthSpend=kidExpenses.filter(ke=>ke.kid_id===kid.id&&ke.date?.startsWith(thisMonth)).reduce((s,ke)=>s+(parseFloat(ke.amount)||0),0);
        const totalSpend=kidExpenses.filter(ke=>ke.kid_id===kid.id).reduce((s,ke)=>s+(parseFloat(ke.amount)||0),0);
        const recentCats=[...new Set(kidExpenses.filter(ke=>ke.kid_id===kid.id).slice(0,5).map(ke=>ke.category?.split(' ')[0]))].slice(0,4).join(' ');
        return(<div key={kid.id} className="kid-card" style={{borderColor:kid.color+'44'}} onClick={()=>setView(kid.id)}>
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <div className="kid-avatar" style={{background:kid.color+'22',border:`2px solid ${kid.color}44`}}>{kid.emoji}</div>
            <div style={{flex:1}}>
              <div style={{fontWeight:700,fontSize:15}}>{kid.name}</div>
              <div style={{fontSize:11,color:'var(--muted)'}}>{recentCats||'No spending yet'}</div>
            </div>
            <div style={{textAlign:'right'}}>
              <div className="kid-spend" style={{color:kid.color}}>{f$(monthSpend,2)}</div>
              <div style={{fontSize:10,color:'var(--muted)'}}>this month</div>
              <div style={{fontSize:11,color:'var(--muted)'}}>{f$(totalSpend,2)} total</div>
            </div>
            <div style={{fontSize:18,color:'var(--faint)',marginLeft:4}}>›</div>
          </div>
        </div>);
      })
    ):<div className="card"><div className="empty"><div className="empty-icon">👨‍👩‍👧‍👦</div><p style={{marginBottom:14}}>Track spending per family member — add individuals like each child, or a shared <strong>"Everyone"</strong> account for things the whole family uses like outings, meals, or household purchases.</p><button className="btn btn-p" onClick={()=>setShowAddKid(true)}>+ Add First Member</button></div></div>}

      {kids.length>0&&<div className="card" style={{marginTop:12}}>
      <div style={{fontWeight:700,marginBottom:10,fontSize:13}}>This Month — All Members</div>
      <KV label="Total Family Spending" val={f$(kidExpenses.filter(ke=>ke.date?.startsWith(thisMonth)).reduce((s,ke)=>s+(parseFloat(ke.amount)||0),0),2)} color="var(--purple)"/>
    </div>}

    {showAddKid&&<Modal title="Add a Member" onClose={()=>setShowAddKid(false)}>
      <div className="alert alert-info" style={{marginBottom:12,fontSize:11}}>Add individuals like each child, or a shared member like <strong>"Everyone"</strong> or <strong>"Family"</strong> for group purchases.</div>
      <div className="fr"><label>Name</label><input placeholder="e.g. Emma, Jake, Everyone, Family" value={kidForm.name} onChange={e=>setKidForm(f=>({...f,name:e.target.value}))}/></div>
      <div className="fr"><label>Emoji</label><div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:4}}>{KID_EMOJIS.map(em=>(<button key={em} className={`btn sm ${kidForm.emoji===em?'btn-p':'btn-s'}`} style={{fontSize:18,padding:'4px 10px'}} onClick={()=>setKidForm(f=>({...f,emoji:em}))}>{em}</button>))}</div></div>
      <div className="fr"><label>Color</label><div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:4}}>{KID_COLORS.map(c=>(<div key={c} onClick={()=>setKidForm(f=>({...f,color:c}))} style={{width:28,height:28,borderRadius:'50%',background:c,cursor:'pointer',border:`3px solid ${kidForm.color===c?'white':'transparent'}`,transition:'border .15s'}}/>))}</div></div>
      <button className="btn btn-p btn-full" onClick={saveKid} disabled={saving}>{saving?<span className="spinner"/>:'Add Member'}</button>
    </Modal>}
  </div>);
}
