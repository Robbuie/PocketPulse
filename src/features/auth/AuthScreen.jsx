import { useState } from 'react';
import { apiUpsertProfile } from '../../lib/api';
import { sb } from '../../lib/supabase';

export function AuthScreen({onAuth}){
  const[mode,setMode]=useState('login');
  const[email,setEmail]=useState('');const[pw,setPw]=useState('');const[name,setName]=useState('');
  const[err,setErr]=useState('');const[loading,setLoading]=useState(false);
  async function submit(){
    setErr('');setLoading(true);
    try{
      if(mode==='login'){const{data,error}=await sb.auth.signInWithPassword({email,password:pw});if(error)throw error;onAuth(data.user);}
      else{
        const{data,error}=await sb.auth.signUp({email,password:pw});if(error)throw error;
        if(data.user&&data.session){await apiUpsertProfile({id:data.user.id,email,name:name||email.split('@')[0]});onAuth(data.user,name||email.split('@')[0]);}
        else if(data.user&&!data.session){setErr('Check your email and click the confirmation link, then sign in.')}
      }
    }catch(e){setErr(e.message||'Something went wrong')}
    setLoading(false);
  }
  return(<div className="auth-wrap"><div className="auth-box">
    <div className="auth-logo">PocketPulse 💸</div>
    <div className="auth-sub">{mode==='login'?'Welcome back.':'Create your free account.'}</div>
    {err&&<div className="alert alert-err">{err}</div>}
    {mode==='signup'&&<div className="fr"><label>Your Name</label><input placeholder="First name" value={name} onChange={e=>setName(e.target.value)}/></div>}
    <div className="fr"><label>Email</label><input type="email" placeholder="you@email.com" value={email} onChange={e=>setEmail(e.target.value)}/></div>
    <div className="fr"><label>Password</label><input type="password" placeholder="••••••••" value={pw} onChange={e=>setPw(e.target.value)} onKeyDown={e=>e.key==='Enter'&&submit()}/></div>
    <button className="btn btn-p btn-full" onClick={submit} disabled={loading}>{loading?<span className="spinner"/>:mode==='login'?'Sign In':'Create Account'}</button>
    <div className="auth-switch">{mode==='login'?<>No account? <span onClick={()=>{setMode('signup');setErr('')}}>Sign up free</span></>:<>Have an account? <span onClick={()=>{setMode('login');setErr('')}}>Sign in</span></>}</div>
  </div></div>);
}
