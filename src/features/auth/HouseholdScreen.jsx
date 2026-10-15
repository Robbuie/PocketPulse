import { useState } from 'react';
import { apiCreateHousehold, apiJoinHousehold } from '../../lib/api';

export function HouseholdScreen({user,onReady}){
  const[mode,setMode]=useState('create');
  const[houseName,setHouseName]=useState('');const[inviteCode,setInviteCode]=useState('');
  const[err,setErr]=useState('');const[loading,setLoading]=useState(false);
  async function create(){
    if(!houseName.trim()){setErr('Enter a household name');return}
    setLoading(true);setErr('');
    const{data,error}=await apiCreateHousehold(houseName.trim());
    if(error||!data){setErr(error?.message||'Could not create the household.');setLoading(false);return}
    onReady(data);setLoading(false);
  }
  async function join(){
    if(!inviteCode.trim()){setErr('Enter an invite code');return}
    setLoading(true);setErr('');
    const{data,error}=await apiJoinHousehold(inviteCode);
    if(error||!data){setErr(error?.message||'Invite code not found.');setLoading(false);return}
    onReady(data);setLoading(false);
  }
  return(<div className="auth-wrap"><div className="auth-box" style={{maxWidth:460}}>
    <div className="auth-logo">Set Up Your Household 🏡</div>
    <div className="auth-sub">Create a shared household to track finances together.</div>
    {err&&<div className="alert alert-err">{err}</div>}
    <div style={{display:'flex',gap:8,marginBottom:18}}>
      {['create','join'].map(m=><button key={m} className={`btn ${mode===m?'btn-p':'btn-s'}`} style={{flex:1}} onClick={()=>{setMode(m);setErr('')}}>{m==='create'?'Create New':'Join Existing'}</button>)}
    </div>
    {mode==='create'?(<>
      <div className="fr"><label>Household Name</label><input placeholder="e.g. The Johnson House" value={houseName} onChange={e=>setHouseName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&create()}/></div>
      <button className="btn btn-p btn-full" onClick={create} disabled={loading}>{loading?<span className="spinner"/>:'Create Household'}</button>
    </>):(<>
      <div className="fr"><label>Invite Code</label><input placeholder="e.g. AB12CD34" value={inviteCode} onChange={e=>setInviteCode(e.target.value.toUpperCase())} style={{fontFamily:'var(--mono)',letterSpacing:2,fontSize:18}}/></div>
      <button className="btn btn-p btn-full" onClick={join} disabled={loading}>{loading?<span className="spinner"/>:'Join Household'}</button>
    </>)}
  </div></div>);
}
