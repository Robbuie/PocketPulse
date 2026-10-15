import { useState } from 'react';
import { Modal } from '../../components/ui';
import { apiSaveBudget } from '../../lib/api';
import { DEAL_TYPES, calcEffectivePrice, hasActiveDeal } from '../../lib/deals';
import { f$, today, uid } from '../../lib/format';
import { UNITS, fUnit, friendlyBasePrice, normalizeUnitPrice, sameUnitGroup } from '../../lib/units';
import { DEFAULT_STORES } from './stores';

export function GroceryTab({budget,setBudget,householdId}){
  const list=budget.shopping_list||[];
  const activeStoreIds=budget.shopping_stores||DEFAULT_STORES.slice(0,2).map(s=>s.id);
  const customStores=budget.custom_stores||[];
  // All available stores = defaults + custom
  const allStores=[...DEFAULT_STORES,...customStores];
  // Active stores = from all available stores
  const stores=activeStoreIds.map(id=>allStores.find(s=>s.id===id)).filter(Boolean);

  const[showAdd,setShowAdd]=useState(false);
  const[showConfig,setShowConfig]=useState(false);
  const[form,setForm]=useState({name:'',qty:'',unit:'count',notes:''});
  const[saving,setSaving]=useState(false);
  const[filter,setFilter]=useState('active');
  const[editingPrices,setEditingPrices]=useState(null);
  // Custom store add form inside config modal
  const[newStore,setNewStore]=useState({name:'',url:''});
  const[addingStore,setAddingStore]=useState(false);

  async function saveList(newList){
    setSaving(true);
    await apiSaveBudget({...budget,shopping_list:newList},householdId);
    setBudget(b=>({...b,shopping_list:newList}));
    setSaving(false);
  }

  async function addItem(){
    if(!form.name.trim())return;setSaving(true);
    const item={id:uid(),name:form.name.trim(),qty:form.qty.trim(),unit:form.unit,notes:form.notes.trim(),prices:{},checked:false,added:today()};
    await saveList([item,...list]);
    setForm({name:'',qty:'',unit:'count',notes:''});setShowAdd(false);setSaving(false);
  }

  async function toggleCheck(id){await saveList(list.map(i=>i.id===id?{...i,checked:!i.checked}:i))}
  async function deleteItem(id){await saveList(list.filter(i=>i.id!==id))}
  async function clearChecked(){if(!confirm('Remove all checked items?'))return;await saveList(list.filter(i=>!i.checked))}

  // prices stored as {[storeId]: {price, pkgQty, pkgUnit, deal?}} — or legacy number
  function getPriceEntry(item,storeId){
    const raw=item.prices?.[storeId];
    if(!raw)return null;
    if(typeof raw==='number')return{price:raw,pkgQty:1,pkgUnit:item.unit||'count'};
    return raw;
  }
  function getRawUnitPrice(entry){
    if(!entry||!entry.price)return null;
    return calcEffectivePrice(entry)/(parseFloat(entry.pkgQty)||1);
  }
  function getNormalizedUnitPrice(entry){
    const raw=getRawUnitPrice(entry);
    if(raw==null)return null;
    return normalizeUnitPrice(raw,entry.pkgUnit).normalized;
  }

  async function savePrice(itemId,storeId,field,val){
    const newList=list.map(i=>{
      if(i.id!==itemId)return i;
      const cur=getPriceEntry(i,storeId)||{price:'',pkgQty:1,pkgUnit:i.unit||'count'};
      let updated;
      if(field.startsWith('deal.')){
        const dealField=field.slice(5);
        const curDeal=cur.deal||{type:'',value:'',expires:''};
        updated={...cur,deal:{...curDeal,[dealField]:val}};
        if(dealField==='type'&&!val)updated={...cur,deal:null};
      }else{
        updated={...cur,[field]:val};
      }
      const prices={...(i.prices||{}),[storeId]:updated};
      if(!updated.price&&updated.price!==0)delete prices[storeId];
      return{...i,prices};
    });
    await saveList(newList);
  }

  async function toggleStore(id){
    const next=activeStoreIds.includes(id)
      ?activeStoreIds.filter(s=>s!==id)
      :[...activeStoreIds,id];
    const cfg={...budget,shopping_stores:next};
    await apiSaveBudget(cfg,householdId);
    setBudget(b=>({...b,shopping_stores:next}));
  }

  async function addCustomStore(){
    if(!newStore.name.trim())return;
    setAddingStore(true);
    const id='custom_'+uid();
    // Build a reasonable search URL from the store name if not provided
    const searchBase=newStore.url.trim()
      ?newStore.url.trim()
      :`https://www.google.com/search?q=${newStore.name.trim()}+`;
    const store={id,name:newStore.name.trim(),icon:'🏪',search:searchBase,custom:true};
    const updated=[...customStores,store];
    const updatedActive=[...activeStoreIds,id];
    const cfg={...budget,custom_stores:updated,shopping_stores:updatedActive};
    await apiSaveBudget(cfg,householdId);
    setBudget(b=>({...b,custom_stores:updated,shopping_stores:updatedActive}));
    setNewStore({name:'',url:''});setAddingStore(false);
  }

  async function deleteCustomStore(id){
    const updated=customStores.filter(s=>s.id!==id);
    const updatedActive=activeStoreIds.filter(s=>s!==id);
    const cfg={...budget,custom_stores:updated,shopping_stores:updatedActive};
    await apiSaveBudget(cfg,householdId);
    setBudget(b=>({...b,custom_stores:updated,shopping_stores:updatedActive}));
  }

  function bestStore(item){
    if(!item.prices)return null;
    const entries=Object.keys(item.prices).map(storeId=>{
      const e=getPriceEntry(item,storeId);
      if(!e||!e.price)return null;
      const normalized=getNormalizedUnitPrice(e);
      return normalized!=null?{storeId,normalized}:null;
    }).filter(Boolean);
    if(!entries.length)return null;
    return entries.sort((a,b)=>a.normalized-b.normalized)[0].storeId;
  }

  function searchUrl(store,itemName){
    if(!store.search)return`https://www.google.com/search?q=${encodeURIComponent(store.name+' '+itemName)}`;
    return store.search+encodeURIComponent(itemName);
  }

  const active=list.filter(i=>!i.checked);
  const checked=list.filter(i=>i.checked);
  const shown=filter==='active'?active:list;

  return(<div>
    <div className="st-row">
      <div className="st">Shopping List 🛒</div>
      <div style={{display:'flex',gap:6}}>
        <button className="btn btn-s sm" onClick={()=>setShowConfig(true)}>⚙️ Stores</button>
        <button className="btn btn-p sm" onClick={()=>setShowAdd(true)}>+ Item</button>
      </div>
    </div>

    {/* Summary bar */}
    <div className="card" style={{marginBottom:12,padding:'10px 14px'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap'}}>
        <div style={{display:'flex',gap:16}}>
          <div><span style={{fontSize:20,fontWeight:800,color:'var(--green)'}}>{active.length}</span><span style={{fontSize:12,color:'var(--muted)',marginLeft:4}}>needed</span></div>
          {checked.length>0&&<div><span style={{fontSize:20,fontWeight:800,color:'var(--muted)'}}>{checked.length}</span><span style={{fontSize:12,color:'var(--muted)',marginLeft:4}}>in cart</span></div>}
        </div>
        <div style={{display:'flex',gap:6}}>
          {['active','all'].map(f=><button key={f} className={`btn sm ${filter===f?'btn-p':'btn-s'}`} onClick={()=>setFilter(f)}>{f==='active'?'Needed':'All'}</button>)}
          {checked.length>0&&<button className="btn btn-d sm" onClick={clearChecked}>Clear Got</button>}
        </div>
      </div>
      {stores.length>0
        ?<div style={{marginTop:6,fontSize:11,color:'var(--muted)'}}>Checking: {stores.map(s=>`${s.icon} ${s.name}`).join(' · ')}</div>
        :<div style={{marginTop:6,fontSize:11,color:'var(--amber)'}}>⚙️ No stores selected — tap Stores to choose.</div>}
    </div>

    {shown.length===0&&<div className="card"><div className="empty"><div className="empty-icon">🛒</div><p>{filter==='active'?'List is empty. Tap + Item to add.':'No items.'}</p></div></div>}

    {shown.map(item=>{
      const best=bestStore(item);
      const hasPrices=item.prices&&Object.keys(item.prices).some(k=>{const e=getPriceEntry(item,k);return e&&e.price>0});
      const isEditing=editingPrices===item.id;
      const unitLabel=fUnit(item.qty,item.unit);
      const bestEntry=best?getPriceEntry(item,best):null;
      const bestNorm=bestEntry&&bestEntry.price?normalizeUnitPrice(getRawUnitPrice(bestEntry),bestEntry.pkgUnit):null;
      const bestStoreName=best?allStores.find(s=>s.id===best)?.name:null;
      const allUnits=hasPrices?Object.keys(item.prices).map(k=>getPriceEntry(item,k)?.pkgUnit).filter(Boolean):[];
      const mixedUnits=allUnits.length>1&&allUnits.some((u,i)=>i>0&&u!==allUnits[0]&&sameUnitGroup(u,allUnits[0]));
      // Count active deals across all stores
      const activeDeals=Object.keys(item.prices||{}).filter(k=>hasActiveDeal(getPriceEntry(item,k))).length;

      return(<div key={item.id} className={`shop-item${item.checked?' checked':''}`} style={{flexDirection:'column',alignItems:'stretch',gap:0}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <div className={`shop-check${item.checked?' done':''}`} onClick={()=>toggleCheck(item.id)}>{item.checked?'✓':''}</div>
          <div style={{flex:1,minWidth:0}}>
            <div className={`shop-name${item.checked?' struck':''}`}>
              {item.name}
              {unitLabel&&<span style={{fontWeight:500,color:'var(--muted)',fontSize:12,marginLeft:6}}>{unitLabel}</span>}
              {activeDeals>0&&<span style={{fontSize:10,background:'var(--adim)',color:'var(--amber)',padding:'1px 5px',borderRadius:3,marginLeft:6,fontWeight:700}}>🏷 {activeDeals} deal{activeDeals>1?'s':''}</span>}
            </div>
            {hasPrices&&bestStoreName&&bestNorm&&(
              <div style={{fontSize:11,color:'var(--green)',fontWeight:700,marginTop:2}}>
                ✓ Best: {bestStoreName} — {friendlyBasePrice(bestNorm.normalized,bestNorm.base)}
                {mixedUnits&&<span style={{fontSize:10,color:'var(--muted)',fontWeight:400,marginLeft:4}}>(converted)</span>}
              </div>
            )}
            {item.notes&&<div className="shop-meta" style={{marginTop:2}}>{item.notes}</div>}
            {/* Price chips */}
            <div style={{display:'flex',gap:5,flexWrap:'wrap',marginTop:5}}>
              {stores.map(store=>{
                const entry=getPriceEntry(item,store.id);
                const isBest=best===store.id&&hasPrices;
                const rawUnit=entry?getRawUnitPrice(entry):null;
                const norm=rawUnit!=null?normalizeUnitPrice(rawUnit,entry.pkgUnit):null;
                const activeDeal=entry?hasActiveDeal(entry):false;
                const effectivePrice=entry?calcEffectivePrice(entry):null;
                return(
                  <a key={store.id} href={searchUrl(store,item.name)} target="_blank" rel="noopener"
                    className={`price-chip${isBest?' best':''}`} title={`Search ${store.name}`}>
                    <span className="pc-store">{store.icon} {store.name}</span>
                    {entry?.price>0?(
                      <span className="pc-price">
                        {activeDeal&&<span style={{textDecoration:'line-through',opacity:.5,marginRight:3,fontSize:9}}>{f$(entry.price,2)}</span>}
                        {f$(effectivePrice,2)}
                        {activeDeal&&<span style={{fontSize:9,color:isBest?'var(--green)':'var(--amber)',marginLeft:2}}>🏷</span>}
                        {(entry.pkgQty>1||mixedUnits)&&norm&&<span style={{fontSize:9,fontWeight:400,marginLeft:2,opacity:.8}}> ({friendlyBasePrice(norm.normalized,norm.base)})</span>}
                      </span>
                    ):<span style={{fontSize:9,color:'var(--faint)'}}>search →</span>}
                  </a>
                );
              })}
              <button className="price-chip" style={{border:'1px dashed var(--border)',background:'transparent',cursor:'pointer'}}
                onClick={()=>setEditingPrices(isEditing?null:item.id)}>
                <span style={{fontSize:10,color:'var(--muted)'}}>{hasPrices?'✏️ edit':'+ prices'}</span>
              </button>
            </div>
          </div>
          <button className="btn btn-d sm" style={{padding:'3px 7px',flexShrink:0,alignSelf:'flex-start'}} onClick={()=>deleteItem(item.id)}>✕</button>
        </div>

        {/* Per-store price + deal editor */}
        {isEditing&&(
          <div style={{marginTop:10,paddingTop:10,borderTop:'1px solid var(--border)'}}>
            <div style={{fontSize:11,color:'var(--muted)',marginBottom:10}}>Enter price and package size. Add a deal to automatically adjust the comparison price.</div>
            {stores.map(store=>{
              const entry=getPriceEntry(item,store.id)||{price:'',pkgQty:1,pkgUnit:item.unit||'count'};
              const rawUnit=entry.price&&entry.pkgQty?parseFloat(entry.price)/(parseFloat(entry.pkgQty)||1):null;
              const norm=rawUnit!=null?normalizeUnitPrice(rawUnit,entry.pkgUnit):null;
              const effectivePrice=entry.price?calcEffectivePrice(entry):null;
              const effectiveUnit=effectivePrice&&entry.pkgQty?effectivePrice/(parseFloat(entry.pkgQty)||1):null;
              const effectiveNorm=effectiveUnit!=null?normalizeUnitPrice(effectiveUnit,entry.pkgUnit):null;
              const isBest=best===store.id&&hasPrices;
              const deal=entry.deal||{};
              return(
                <div key={store.id} style={{
                  background:isBest?'var(--gdim)':'var(--surface)',
                  border:`1px solid ${isBest?'rgba(16,208,112,.3)':'var(--border)'}`,
                  borderRadius:9,padding:'10px 12px',marginBottom:8
                }}>
                  {/* Store header */}
                  <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:8}}>
                    <a href={searchUrl(store,item.name)} target="_blank" rel="noopener"
                      style={{fontSize:13,fontWeight:700,color:'var(--blue)',textDecoration:'none',flex:1}}>
                      {store.icon} {store.name} →
                    </a>
                    {isBest&&<span className="tag tg" style={{fontSize:9}}>BEST DEAL</span>}
                  </div>

                  {/* Price + package row */}
                  <div style={{display:'grid',gridTemplateColumns:'1fr 70px 80px',gap:6,marginBottom:6}}>
                    <div><label style={{fontSize:9}}>Regular Price ($)</label>
                      <input type="number" min="0" step="0.01" placeholder="0.00" value={entry.price||''}
                        onChange={e=>savePrice(item.id,store.id,'price',e.target.value)} style={{padding:'5px 7px',fontSize:13}}/>
                    </div>
                    <div><label style={{fontSize:9}}>Pkg Size</label>
                      <input type="number" min="0.01" step="0.01" placeholder="1" value={entry.pkgQty||''}
                        onChange={e=>savePrice(item.id,store.id,'pkgQty',e.target.value)} style={{padding:'5px 7px',fontSize:13}}/>
                    </div>
                    <div><label style={{fontSize:9}}>Unit</label>
                      <select value={entry.pkgUnit||item.unit||'count'}
                        onChange={e=>savePrice(item.id,store.id,'pkgUnit',e.target.value)} style={{padding:'5px 7px',fontSize:12}}>
                        {UNITS.map(u=><option key={u} value={u}>{u}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Normal unit price */}
                  {norm&&entry.price>0&&<div style={{fontSize:11,color:'var(--muted)',marginBottom:8}}>
                    Regular: {friendlyBasePrice(norm.normalized,norm.base)}
                    {entry.pkgUnit&&entry.pkgUnit!==norm.base&&<span style={{fontSize:10,color:'var(--faint)',marginLeft:4}}>(from {entry.pkgUnit})</span>}
                  </div>}

                  {/* Deal section */}
                  <div style={{borderTop:'1px solid var(--border)',paddingTop:8}}>
                    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:deal.type?8:0}}>
                      <span style={{fontSize:11,fontWeight:600,color:'var(--amber)',flexShrink:0}}>🏷 Deal</span>
                      <select value={deal.type||''} onChange={e=>savePrice(item.id,store.id,'deal.type',e.target.value)}
                        style={{flex:1,padding:'4px 6px',fontSize:11}}>
                        <option value="">— no deal —</option>
                        {DEAL_TYPES.map(d=><option key={d.v} value={d.v}>{d.l}</option>)}
                      </select>
                    </div>
                    {deal.type&&(<>
                      {deal.type!=='bogo'&&(
                        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6,marginBottom:6}}>
                          <div><label style={{fontSize:9}}>{deal.type==='pct_off'?'% Off':deal.type==='amt_off'?'$ Off':'Bundle Price ($)'}</label>
                            <input type="number" min="0" step={deal.type==='pct_off'?'1':'0.01'} placeholder="0" value={deal.value||''}
                              onChange={e=>savePrice(item.id,store.id,'deal.value',e.target.value)} style={{padding:'5px 7px',fontSize:13}}/>
                            <div style={{fontSize:9,color:'var(--faint)',marginTop:2}}>{DEAL_TYPES.find(d=>d.v===deal.type)?.hint}</div>
                          </div>
                          <div><label style={{fontSize:9}}>Expires (optional)</label>
                            <input type="date" value={deal.expires||''} onChange={e=>savePrice(item.id,store.id,'deal.expires',e.target.value)}
                              style={{padding:'5px 7px',fontSize:12}}/>
                          </div>
                        </div>
                      )}
                      {deal.type==='bogo'&&(
                        <div style={{marginBottom:6}}><label style={{fontSize:9}}>Expires (optional)</label>
                          <input type="date" value={deal.expires||''} onChange={e=>savePrice(item.id,store.id,'deal.expires',e.target.value)}
                            style={{padding:'5px 7px',fontSize:12,width:'auto'}}/>
                        </div>
                      )}
                      {/* Deal result */}
                      {entry.price>0&&effectiveNorm&&(()=>{
                        const expired=deal.expires&&deal.expires<today();
                        return <div style={{padding:'5px 8px',background:expired?'var(--rdim)':'var(--adim)',borderRadius:6,fontSize:12}}>
                          {expired
                            ?<span style={{color:'var(--red)'}}>⚠️ Deal expired — using regular price</span>
                            :<span style={{color:isBest?'var(--green)':'var(--amber)',fontWeight:700}}>
                               With deal: {f$(effectivePrice,2)} → {friendlyBasePrice(effectiveNorm.normalized,effectiveNorm.base)}
                               {effectivePrice<parseFloat(entry.price)&&<span style={{fontWeight:400,marginLeft:4}}>(saves {f$(parseFloat(entry.price)-effectivePrice,2)})</span>}
                             </span>}
                        </div>;
                      })()}
                    </>)}
                  </div>
                </div>
              );
            })}

            {/* Summary */}
            {hasPrices&&best&&bestEntry&&bestNorm&&(
              <div style={{fontSize:12,color:'var(--green)',fontWeight:700,padding:'8px 10px',background:'var(--gdim)',borderRadius:6,marginTop:4}}>
                ✓ Best deal: {bestStoreName} at {friendlyBasePrice(bestNorm.normalized,bestNorm.base)}
                {(()=>{
                  const allNorm=Object.keys(item.prices).map(k=>{const e=getPriceEntry(item,k);if(!e||!e.price)return null;return getNormalizedUnitPrice(e)}).filter(v=>v!=null);
                  if(allNorm.length<2)return null;
                  const worst=Math.max(...allNorm);
                  const savings=worst-bestNorm.normalized;
                  return savings>0.0001?<span style={{color:'var(--muted)',fontWeight:400,marginLeft:6}}>· saves {friendlyBasePrice(savings,bestNorm.base)} vs most expensive</span>:null;
                })()}
              </div>
            )}
            <button className="btn btn-s sm" style={{marginTop:8}} onClick={()=>setEditingPrices(null)}>Done</button>
          </div>
        )}
      </div>);
    })}

    {/* Add item modal */}
    {showAdd&&<Modal title="Add to List" onClose={()=>setShowAdd(false)}>
      <div className="fr"><label>Item Name</label><input placeholder="e.g. Whole milk, Paper towels" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} autoFocus onKeyDown={e=>e.key==='Enter'&&addItem()}/></div>
      <div style={{display:'grid',gridTemplateColumns:'80px 1fr',gap:8,marginBottom:12}}>
        <div><label>Amount</label><input type="number" min="0" step="0.01" placeholder="2" value={form.qty} onChange={e=>setForm(f=>({...f,qty:e.target.value}))}/></div>
        <div><label>Unit</label><select value={form.unit} onChange={e=>setForm(f=>({...f,unit:e.target.value}))}>{UNITS.map(u=><option key={u} value={u}>{u}</option>)}</select></div>
      </div>
      <div className="fr"><label>Notes</label><input placeholder="e.g. any brand, check sale" value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}/></div>
      <div style={{display:'flex',gap:8}}>
        <button className="btn btn-s" style={{flex:1}} onClick={()=>setShowAdd(false)}>Cancel</button>
        <button className="btn btn-p" style={{flex:2}} onClick={addItem} disabled={saving||!form.name.trim()}>{saving?<span className="spinner"/>:'Add to List'}</button>
      </div>
    </Modal>}

    {/* Store config modal */}
    {showConfig&&<Modal title="Manage Stores" onClose={()=>setShowConfig(false)}>
      <div style={{fontSize:12,color:'var(--muted)',marginBottom:14}}>Toggle stores on or off, or add any local store by name.</div>

      {/* Default stores */}
      <div style={{fontWeight:700,fontSize:11,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.5px',marginBottom:8}}>Common Stores</div>
      {DEFAULT_STORES.map(store=>{
        const on=activeStoreIds.includes(store.id);
        return(<div key={store.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'9px 0',borderBottom:'1px solid var(--border)'}}>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <span style={{fontSize:18}}>{store.icon}</span>
            <div><div style={{fontWeight:600,fontSize:13}}>{store.name}</div><div style={{fontSize:10,color:'var(--muted)'}}>{store.search.split('/')[2]}</div></div>
          </div>
          <button className={`btn sm ${on?'btn-p':'btn-s'}`} onClick={()=>toggleStore(store.id)}>{on?'✓ On':'Add'}</button>
        </div>);
      })}

      {/* Custom stores */}
      {customStores.length>0&&(<>
        <div style={{fontWeight:700,fontSize:11,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.5px',margin:'14px 0 8px'}}>Your Stores</div>
        {customStores.map(store=>{
          const on=activeStoreIds.includes(store.id);
          return(<div key={store.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'9px 0',borderBottom:'1px solid var(--border)'}}>
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <span style={{fontSize:18}}>{store.icon}</span>
              <div><div style={{fontWeight:600,fontSize:13}}>{store.name}</div><div style={{fontSize:10,color:'var(--muted)'}}>Custom store</div></div>
            </div>
            <div style={{display:'flex',gap:6}}>
              <button className={`btn sm ${on?'btn-p':'btn-s'}`} onClick={()=>toggleStore(store.id)}>{on?'✓ On':'Add'}</button>
              <button className="btn btn-d sm" onClick={()=>deleteCustomStore(store.id)}>✕</button>
            </div>
          </div>);
        })}
      </>)}

      {/* Add custom store */}
      <div style={{fontWeight:700,fontSize:11,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.5px',margin:'14px 0 8px'}}>Add a Store</div>
      <div style={{display:'grid',gridTemplateColumns:'1fr',gap:8}}>
        <div className="fr" style={{margin:0}}><label>Store Name</label>
          <input placeholder="e.g. Aldi, Vinkiers, Fresh Thyme" value={newStore.name} onChange={e=>setNewStore(s=>({...s,name:e.target.value}))}/></div>
        <div className="fr" style={{margin:0}}><label>Website (optional — for search links)</label>
          <input placeholder="e.g. https://www.aldi.us/en/products/?q=" value={newStore.url} onChange={e=>setNewStore(s=>({...s,url:e.target.value}))}/>
          <div style={{fontSize:10,color:'var(--faint)',marginTop:3}}>Leave blank and we'll use Google search for price lookups instead.</div>
        </div>
        <button className="btn btn-p" onClick={addCustomStore} disabled={addingStore||!newStore.name.trim()}>{addingStore?<span className="spinner"/>:'Add Store'}</button>
      </div>
    </Modal>}
  </div>);
}
