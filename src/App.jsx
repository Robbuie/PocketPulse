import { useState, useEffect } from 'react';
import { MainApp } from './MainApp';
import { AuthScreen } from './features/auth/AuthScreen';
import { HouseholdScreen } from './features/auth/HouseholdScreen';
import { apiGetHousehold, apiGetProfile, apiUpsertProfile } from './lib/api';
import { IS_CFG, sb } from './lib/supabase';

export function Root(){
  const[authState,setAuthState]=useState('loading');
  const[user,setUser]=useState(null);const[profile,setProfile]=useState(null);const[household,setHousehold]=useState(null);
  useEffect(()=>{
    if(!IS_CFG){setAuthState('config');return}
    sb.auth.getSession().then(async({data:{session}})=>{if(!session){setAuthState('unauthed');return}await loadProfile(session.user)});
    const{data:{subscription}}=sb.auth.onAuthStateChange(async(event,session)=>{if(event==='SIGNED_OUT'){setAuthState('unauthed');setUser(null);setProfile(null);setHousehold(null)}});
    return()=>subscription.unsubscribe();
  },[]);
  async function loadProfile(u){
    setUser(u);const p=await apiGetProfile(u.id);
    if(!p){await apiUpsertProfile({id:u.id,email:u.email,name:u.email.split('@')[0]});setProfile({id:u.id,email:u.email,name:u.email.split('@')[0]});setAuthState('no-household');return}
    setProfile(p);if(!p.household_id){setAuthState('no-household');return}
    const h=await apiGetHousehold(p.household_id);setHousehold(h);setAuthState('ready');
  }
  function handleAuth(u){loadProfile(u)}
  async function handleHousehold(h){setHousehold(h);setAuthState('ready')}
  if(authState==='config')return<div className="auth-wrap"><div className="auth-box"><div className="auth-logo">PocketPulse</div><div className="auth-sub" style={{marginBottom:20}}>Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see .env.example) and rebuild.</div></div></div>;
  if(authState==='loading')return<div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'var(--bg)'}}><div className="spinner" style={{width:36,height:36,borderWidth:3}}/></div>;
  if(authState==='unauthed')return<AuthScreen onAuth={handleAuth}/>;
  if(authState==='no-household')return<HouseholdScreen user={user} onReady={handleHousehold}/>;
  return<MainApp user={user} profile={profile} household={household}/>;
}
