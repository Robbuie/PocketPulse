import { CATS, DTYPES } from './constants';

export function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2)}

export function getType(v){return DTYPES.find(t=>t.v===v)||DTYPES[DTYPES.length-1]}

export function f$(n,d=0){return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:d,maximumFractionDigits:d}).format(parseFloat(n)||0)}

export function fmo(n){if(!n||n===Infinity||n>599)return'N/A';n=Math.round(n);const y=Math.floor(n/12),m=n%12;if(y===0)return`${m}mo`;if(m===0)return`${y}yr`;return`${y}yr ${m}mo`}

export function fdate(str){if(!str)return'';const d=new Date(str+'T00:00:00');return d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}

export function fshort(str){if(!str)return'';const d=new Date(str+'T00:00:00');return d.toLocaleDateString('en-US',{month:'short',day:'numeric'})}

export function today(){const d=new Date();return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}

export function catIcon(cat){const k=CATS.find(c=>c===cat||c.includes(cat));return k?k.split(' ')[0]:'🧾'}

export function ordinal(n){const s=['th','st','nd','rd'];const v=n%100;return n+(s[(v-20)%10]||s[v]||s[0])}
