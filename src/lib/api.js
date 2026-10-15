import { sb } from './supabase';

export async function apiGetProfile(uid){const{data}=await sb.from('profiles').select('*').eq('id',uid).maybeSingle();return data}

export async function apiUpsertProfile(p){const{error}=await sb.from('profiles').upsert(p,{onConflict:'id'});return{error}}

export async function apiGetHousehold(id){const{data}=await sb.from('households').select('*').eq('id',id).single();return data}

export async function apiCreateHousehold(name,userId){const{data,error}=await sb.from('households').insert({name,created_by:userId}).select().single();return{data,error}}

export async function apiJoinHousehold(code){const{data,error}=await sb.from('households').select('*').eq('invite_code',code.toUpperCase().trim()).single();return{data,error}}

export async function apiFetchDebts(hid){const{data}=await sb.from('debts').select('*').eq('household_id',hid).order('created_at');return data||[]}

export async function apiSaveDebt(debt,hid){
  if(debt._new){const{id,_new,...d}=debt;const{data,error}=await sb.from('debts').insert({...d,household_id:hid}).select().single();return{data,error}}
  else{const{_new,...d}=debt;const{data,error}=await sb.from('debts').update({...d,updated_at:new Date().toISOString()}).eq('id',d.id).select().single();return{data,error}}
}

export async function apiDeleteDebt(id){const{error}=await sb.from('debts').delete().eq('id',id);return{error}}

export async function apiFetchTransactions(hid,limit=300){const{data}=await sb.from('transactions').select('*').eq('household_id',hid).order('date',{ascending:false}).order('created_at',{ascending:false}).limit(limit);return data||[]}

export async function apiAddTransaction(tx,hid,uid2){const{data,error}=await sb.from('transactions').insert({...tx,household_id:hid,user_id:uid2}).select().single();return{data,error}}

export async function apiDeleteTransaction(id){const{error}=await sb.from('transactions').delete().eq('id',id);return{error}}

export async function apiUpdateTransaction(id,updates){const{data,error}=await sb.from('transactions').update(updates).eq('id',id).select().single();return{data,error}}

export async function apiFetchBudget(hid){const{data}=await sb.from('budget_config').select('*').eq('household_id',hid).maybeSingle();return data}

export async function apiSaveBudget(config,hid){const{error}=await sb.from('budget_config').upsert({...config,household_id:hid},{onConflict:'household_id'});return{error}}

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
