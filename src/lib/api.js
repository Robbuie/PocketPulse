import { sb } from './supabase';

export async function apiGetProfile(uid){const{data}=await sb.from('profiles').select('*').eq('id',uid).maybeSingle();return data}

export async function apiUpsertProfile(p){const{error}=await sb.from('profiles').upsert(p,{onConflict:'id'});return{error}}

export async function apiGetHousehold(id){const{data}=await sb.from('households').select('*').eq('id',id).single();return data}

// Creating and joining run as database functions (migration 0003): they
// check the caller and set profiles.household_id, which the browser itself is
// not allowed to write.
export async function apiCreateHousehold(name){const{data,error}=await sb.rpc('create_household',{p_name:name});return{data,error}}

export async function apiJoinHousehold(code){const{data,error}=await sb.rpc('join_household',{p_code:code});return{data,error}}

export async function apiFetchDebts(hid){const{data}=await sb.from('debts').select('*').eq('household_id',hid).order('created_at');return data||[]}

export async function apiSaveDebt(debt,hid){
  if(debt._new){const{id,_new,...d}=debt;const{data,error}=await sb.from('debts').insert({...d,household_id:hid}).select().single();return{data,error}}
  else{const{_new,...d}=debt;const{data,error}=await sb.from('debts').update({...d,updated_at:new Date().toISOString()}).eq('id',d.id).select().single();return{data,error}}
}

export async function apiDeleteDebt(id){const{error}=await sb.from('debts').delete().eq('id',id);return{error}}

// Newest first, in pages: Supabase returns at most 1000 rows per request,
// and imports put several months of card and bank lines in here. The budget
// and history views need every transaction in the months they show.
export async function apiFetchTransactions(hid,limit=5000){
  const out=[];
  for(let from=0;from<limit;from+=1000){
    const{data}=await sb.from('transactions').select('*').eq('household_id',hid).order('date',{ascending:false}).order('created_at',{ascending:false}).range(from,Math.min(from+999,limit-1));
    if(!data?.length)break;
    out.push(...data);
    if(data.length<1000)break;
  }
  return out;
}

export async function apiAddTransaction(tx,hid,uid2){const{data,error}=await sb.from('transactions').insert({...tx,household_id:hid,user_id:uid2}).select().single();return{data,error}}

export async function apiDeleteTransaction(id){const{error}=await sb.from('transactions').delete().eq('id',id);return{error}}

export async function apiUpdateTransaction(id,updates){const{data,error}=await sb.from('transactions').update(updates).eq('id',id).select().single();return{data,error}}

export async function apiFetchBudget(hid){const{data}=await sb.from('budget_config').select('*').eq('household_id',hid).maybeSingle();return data}

// shopping_list moved to its own table in 0.4.0. The old column is still in
// the row this was loaded from; leave it out so a budget save never writes a
// stale copy back.
export async function apiSaveBudget(config,hid){const{shopping_list:_retired,...rest}=config;const{error}=await sb.from('budget_config').upsert({...rest,household_id:hid},{onConflict:'household_id'});return{error}}

export async function apiFetchKids(hid){const{data}=await sb.from('kids').select('*').eq('household_id',hid).order('created_at');return data||[]}

export async function apiSaveKid(kid,hid){
  if(kid._new){const{_new,id,...k}=kid;const{data,error}=await sb.from('kids').insert({...k,household_id:hid}).select().single();return{data,error}}
  else{const{_new,...k}=kid;const{data,error}=await sb.from('kids').update(k).eq('id',k.id).select().single();return{data,error}}
}

export async function apiDeleteKid(id){const{error}=await sb.from('kids').delete().eq('id',id);return{error}}

export async function apiFetchKidExpenses(hid){const{data}=await sb.from('kid_expenses').select('*').eq('household_id',hid).order('date',{ascending:false}).order('created_at',{ascending:false}).limit(500);return data||[]}

export async function apiAddKidExpense(ke,hid,uid2){const{data,error}=await sb.from('kid_expenses').insert({...ke,household_id:hid,user_id:uid2}).select().single();return{data,error}}

export async function apiUpdateKidExpense(id,updates){const{data,error}=await sb.from('kid_expenses').update(updates).eq('id',id).select().single();return{data,error}}

export async function apiDeleteKidExpense(id){const{error}=await sb.from('kid_expenses').delete().eq('id',id);return{error}}

// Shopping list (migration 0004). One row per item; newest first.
const SHOPPING_FIELDS='id,name,qty,unit,notes,prices,checked,added,created_at';
export async function apiFetchShoppingItems(hid){
  const{data,error}=await sb.from('shopping_items').select(SHOPPING_FIELDS).eq('household_id',hid).order('created_at',{ascending:false});
  return{data:data||[],error};
}
export async function apiAddShoppingItem(item,hid,userId){
  const{data,error}=await sb.from('shopping_items').insert({...item,household_id:hid,created_by:userId}).select(SHOPPING_FIELDS).single();
  return{data,error};
}
export async function apiUpdateShoppingItem(id,updates){
  const{error}=await sb.from('shopping_items').update(updates).eq('id',id);
  return{error};
}
export async function apiDeleteShoppingItems(ids){
  const{error}=await sb.from('shopping_items').delete().in('id',ids);
  return{error};
}

// Live changes from other members. Inserts and updates are filtered to the
// household; deletes cannot be (with row level security on, a delete event
// carries only the id), so the handler ignores ids it does not have.
export function apiSubscribeShoppingItems(hid,{onInsert,onUpdate,onDelete}){
  const ch=sb.channel(`shop-${hid}`)
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'shopping_items',filter:`household_id=eq.${hid}`},p=>onInsert(p.new))
    .on('postgres_changes',{event:'UPDATE',schema:'public',table:'shopping_items',filter:`household_id=eq.${hid}`},p=>onUpdate(p.new))
    .on('postgres_changes',{event:'DELETE',schema:'public',table:'shopping_items'},p=>onDelete(p.old?.id))
    .subscribe();
  return()=>sb.removeChannel(ch);
}

// Statement import (migration 0006).
export async function apiFetchTransactionsBetween(hid,from,to){
  const{data,error}=await sb.from('transactions').select('id,date,amount,merchant,import_id').eq('household_id',hid).gte('date',from).lte('date',to);
  return{data:data||[],error};
}
// Lines already imported are skipped by the database (unique household_id +
// import_id), so a retry after a dropped connection cannot double anything.
export async function apiImportTransactions(rows,hid,userId){
  const inserted=[];
  for(let i=0;i<rows.length;i+=200){
    const chunk=rows.slice(i,i+200).map(r=>({...r,household_id:hid,user_id:userId}));
    const{data,error}=await sb.from('transactions').upsert(chunk,{onConflict:'household_id,import_id',ignoreDuplicates:true}).select();
    if(error)return{data:inserted,error};
    inserted.push(...(data||[]));
  }
  return{data:inserted,error:null};
}
export async function apiFetchRules(hid){
  const{data,error}=await sb.from('merchant_rules').select('id,pattern,action,budget_line_id').eq('household_id',hid).order('pattern');
  return{data:data||[],error};
}
export async function apiSaveRules(rules,hid,userId){
  if(!rules.length)return{data:[],error:null};
  const{data,error}=await sb.from('merchant_rules').upsert(rules.map(r=>({...r,household_id:hid,created_by:userId})),{onConflict:'household_id,pattern'}).select('id,pattern,action,budget_line_id');
  return{data:data||[],error};
}
export async function apiDeleteRule(id){
  const{error}=await sb.from('merchant_rules').delete().eq('id',id);
  return{error};
}
export async function apiFetchImportProfiles(hid){
  const{data,error}=await sb.from('import_profiles').select('signature,name,mapping').eq('household_id',hid);
  return{data:data||[],error};
}
export async function apiSaveImportProfile(profile,hid){
  const{error}=await sb.from('import_profiles').upsert({...profile,household_id:hid},{onConflict:'household_id,signature'});
  return{error};
}
