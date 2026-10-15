import { useState } from 'react';
import { KV } from '../../components/ui';

export function SettingsTab({user,profile,household,onSignOut}){
  const[copied,setCopied]=useState(false);
  function copyCode(){navigator.clipboard?.writeText(household?.invite_code||'').then(()=>{setCopied(true);setTimeout(()=>setCopied(false),2000)})}
  return(<div>
    <div className="st">Settings</div>
    <div className="card" style={{marginBottom:12}}>
      <div style={{fontWeight:700,marginBottom:12,fontSize:13}}>Your Account</div>
      <KV label="Name" val={profile?.name||'—'}/>
      <KV label="Email" val={user?.email||'—'}/>
      <div className="divider"/>
      <button className="btn btn-d" onClick={onSignOut}>Sign Out</button>
    </div>
    <div className="card" style={{marginBottom:12}}>
      <div style={{fontWeight:700,marginBottom:5,fontSize:13}}>Household: {household?.name}</div>
      <div style={{fontSize:12,color:'var(--muted)',marginBottom:10}}>Share this code with your partner to join your household.</div>
      <div className="invite-code" onClick={copyCode}>{household?.invite_code||'——————'}</div>
      <button className="btn btn-s btn-full" onClick={copyCode}>{copied?'✓ Copied!':'📋 Copy Invite Code'}</button>
    </div>
    <div className="card">
      <div style={{fontWeight:700,marginBottom:8,fontSize:13}}>About PocketPulse</div>
      <div style={{fontSize:13,color:'var(--muted)',lineHeight:1.8}}><p>Data synced via Supabase, only visible to your household.</p><br/><p>Receipt scanning runs entirely on your device — images are never uploaded.</p></div>
    </div>
  </div>);
}
