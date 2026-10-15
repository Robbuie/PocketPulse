import { uid } from './format';

export function parseReceiptText(raw){
  const lines=raw.split('\n').map(l=>l.trim()).filter(Boolean);
  const items=[];let total=0,merchant=lines[0]||'Receipt',tax=0;
  const priceRe=/^(.+?)\s+\$?(\d{1,4}\.\d{2})\s*$/;
  const skipRe=/\b(tax|subtotal|sub total|change|cash|credit|debit|thank|visit|receipt|auth|appr|ref|trans|item|qty|number)\b/i;
  for(const line of lines){
    const m=line.match(priceRe);if(!m)continue;
    const name=m[1].trim();const price=parseFloat(m[2]);
    if(price<=0||price>999)continue;
    if(/\btotal\b/i.test(name)){total=price;continue}
    if(/\btax\b/i.test(name)){tax=price;continue}
    if(skipRe.test(name))continue;
    items.push({id:uid(),name,price});
  }
  if(!total&&items.length)total=items.reduce((s,i)=>s+i.price,0)+tax;
  for(let i=0;i<Math.min(5,lines.length);i++){if(!/\d/.test(lines[i])&&lines[i].length>2){merchant=lines[i];break}}
  return{merchant,items,total:parseFloat(total.toFixed(2)),tax};
}
