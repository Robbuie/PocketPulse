import { useEffect, useState } from 'react';

// Whether the browser thinks it has a connection. The app still opens
// offline (the service worker serves the last page), but nothing it shows
// can be saved, and a member should know that before typing.
export function useOnline(){
  const[online,setOnline]=useState(typeof navigator==='undefined'?true:navigator.onLine!==false);
  useEffect(()=>{
    const up=()=>setOnline(true),down=()=>setOnline(false);
    window.addEventListener('online',up);window.addEventListener('offline',down);
    return()=>{window.removeEventListener('online',up);window.removeEventListener('offline',down)};
  },[]);
  return online;
}
