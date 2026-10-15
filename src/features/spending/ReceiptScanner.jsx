import { useState, useRef, useMemo } from 'react';
import { Modal } from '../../components/ui';
import { apiAddTransaction } from '../../lib/api';
import { guessItemBudgetLine } from '../../lib/budget';
import { CATS } from '../../lib/constants';
import { f$, today, uid } from '../../lib/format';
import { parseReceiptText } from '../../lib/receipt';

export function ReceiptScanner({householdId,userId,onSaved,onClose,budget}){
  const[src,setSrc]=useState(null);
  const[stage,setStage]=useState('pick');
  const[progress,setProgress]=useState(0);
  const[parsed,setParsed]=useState(null);
  const[pasteText,setPasteText]=useState('');
  const[form,setForm]=useState({merchant:'',date:today(),items:[],total:0});
  const[err,setErr]=useState('');
  const[saving,setSaving]=useState(false);
  const fileRef=useRef(null);
  const textFileRef=useRef(null);
  const budgetExpenses=budget?.expenses||[];

  async function loadTesseract(){if(window.Tesseract)return;return new Promise((res,rej)=>{const s=document.createElement('script');s.src='https://unpkg.com/tesseract.js@4/dist/tesseract.min.js';s.onload=res;s.onerror=rej;document.head.appendChild(s)})}

  async function handleImageFile(file){
    if(!file)return;setStage('processing');setProgress(0);setErr('');
    try{
      await loadTesseract();
      const result=await window.Tesseract.recognize(file,'eng',{logger:m=>{if(m.status==='recognizing text')setProgress(Math.round(m.progress*100))}});
      processRawText(result.data.text);
    }catch(e){setErr('Could not read receipt. Try a clearer image.');setStage('pick');}
  }

  function processRawText(raw){
    const p=parseReceiptText(raw);
    setParsed({...p,raw});
    const items=p.items.map(i=>({
      ...i,
      category:CATS[1], // default Food & Dining
      budget_line_id:guessItemBudgetLine(i.name,budgetExpenses),
      included:true,
    }));
    setForm({merchant:p.merchant,date:today(),items,total:p.total});
    setStage('review');
  }

  function handleTextFile(e){
    const file=e.target.files?.[0];if(!file)return;
    setStage('processing');setProgress(100);
    const reader=new FileReader();
    reader.onload=ev=>{processRawText(ev.target.result||'');};
    reader.onerror=()=>{setErr('Could not read file.');setStage('pick');};
    reader.readAsText(file);
  }

  function handlePastedText(){
    if(!pasteText.trim()){setErr('Paste some receipt text first.');return;}
    processRawText(pasteText);
  }

  function updateItem(id,field,val){
    setForm(f=>({...f,items:f.items.map(i=>i.id===id?{...i,[field]:field==='price'?parseFloat(val)||0:val}:i)}));
  }
  function removeItem(id){setForm(f=>({...f,items:f.items.filter(i=>i.id!==id)}))}
  function addItem(){setForm(f=>({...f,items:[...f.items,{id:uid(),name:'',price:0,category:CATS[1],budget_line_id:null,included:true}]}))}

  function autoClassify(){
    setForm(f=>({...f,items:f.items.map(i=>({...i,budget_line_id:guessItemBudgetLine(i.name,budgetExpenses)||i.budget_line_id}))}));
  }

  const includedItems=form.items.filter(i=>i.included!==false);
  const calcTotal=useMemo(()=>includedItems.reduce((s,i)=>s+(parseFloat(i.price)||0),0),[includedItems]);

  async function save(){
    setSaving(true);
    const useTotal=parseFloat(form.total)||calcTotal;
    // Primary category: most common among included items
    const cats=includedItems.map(i=>i.category).filter(Boolean);
    const primaryCat=cats.length?cats.sort((a,b)=>cats.filter(c=>c===b).length-cats.filter(c=>c===a).length)[0]:CATS[1];
    // Primary budget_line_id: most common among included items that have one
    const bls=includedItems.map(i=>i.budget_line_id).filter(Boolean);
    const primaryBL=bls.length?bls.sort((a,b)=>bls.filter(c=>c===b).length-bls.filter(c=>c===a).length)[0]:null;
    const{data,error}=await apiAddTransaction({
      amount:parseFloat(useTotal.toFixed(2)),
      category:primaryCat,
      budget_line_id:primaryBL,
      merchant:form.merchant,
      description:`Receipt: ${form.merchant}`,
      date:form.date,
      items:form.items,
      receipt_text:parsed?.raw||null,
    },householdId,userId);
    if(error){setErr(error.message);setSaving(false);return;}
    onSaved(data);setSaving(false);
  }

  return(<Modal title="📄 Import Receipt" onClose={onClose}>
    {err&&<div className="alert alert-err">{err}</div>}

    {stage==='pick'&&(<>
      <div style={{fontWeight:600,marginBottom:10,fontSize:13}}>Choose how to import</div>
      <div style={{display:'flex',gap:8,marginBottom:16}}>
        <button className={`src-btn${src==='camera'?' active':''}`} onClick={()=>{setSrc('camera');fileRef.current?.click()}}>
          <span className="src-icon">📷</span><span className="src-label">Take Photo</span>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{display:'none'}} onChange={e=>handleImageFile(e.target.files?.[0])}/>
        </button>
        <button className={`src-btn${src==='file'?' active':''}`} onClick={()=>{setSrc('file');document.getElementById('pp-img-upload')?.click()}}>
          <span className="src-icon">🖼</span><span className="src-label">Upload Image</span>
        </button>
        <button className={`src-btn${src==='textfile'?' active':''}`} onClick={()=>{setSrc('textfile');textFileRef.current?.click()}}>
          <span className="src-icon">📁</span><span className="src-label">Text File</span>
          <input ref={textFileRef} type="file" accept=".txt,.csv,.text,text/plain" style={{display:'none'}} onChange={handleTextFile}/>
        </button>
        <button className={`src-btn${src==='paste'?' active':''}`} onClick={()=>setSrc('paste')}>
          <span className="src-icon">📋</span><span className="src-label">Paste Text</span>
        </button>
      </div>
      <input id="pp-img-upload" type="file" accept="image/*" style={{display:'none'}} onChange={e=>handleImageFile(e.target.files?.[0])}/>
      {src==='paste'&&(<>
        <div className="fr"><label>Paste receipt text below</label>
          <textarea placeholder={"WALMART\nBread       2.49\nMilk        3.99\nGas Can     8.00\nTotal       14.48"} value={pasteText} onChange={e=>setPasteText(e.target.value)} style={{minHeight:130,fontFamily:'var(--mono)',fontSize:12}}/>
        </div>
        <button className="btn btn-p btn-full" onClick={handlePastedText} disabled={!pasteText.trim()}>Parse Receipt</button>
      </>)}
      <button className="btn btn-s btn-full" style={{marginTop:8}} onClick={onClose}>Cancel</button>
    </>)}

    {stage==='processing'&&(<div style={{textAlign:'center',padding:'28px 0'}}>
      <div style={{fontSize:40,marginBottom:12}}>🔍</div>
      <div style={{fontWeight:600,marginBottom:8}}>Reading receipt...</div>
      <div className="ocr-prog"><div className="ocr-bar" style={{width:`${progress}%`}}/></div>
      <div style={{fontSize:12,color:'var(--muted)'}}>{progress}%</div>
    </div>)}

    {stage==='review'&&(<>
      <div className="alert alert-ok" style={{marginBottom:10}}>Parsed! Classify each item, then save.</div>

      <div className="fg" style={{marginBottom:10}}>
        <div className="fr" style={{margin:0}}><label>Merchant</label><input value={form.merchant} onChange={e=>setForm(f=>({...f,merchant:e.target.value}))}/></div>
        <div className="fr" style={{margin:0}}><label>Date</label><input type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))}/></div>
      </div>

      {budgetExpenses.length>0&&(
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
          <div style={{fontSize:12,color:'var(--muted)'}}>
            {includedItems.filter(i=>i.budget_line_id).length}/{includedItems.length} items linked to a budget line
          </div>
          <button className="btn btn-s sm" onClick={autoClassify}>✨ Auto-classify</button>
        </div>
      )}

      <div style={{overflowX:'auto'}}>
        <table className="ri-table">
          <thead>
            <tr>
              <th style={{width:22}}>✓</th>
              <th>Item</th>
              <th style={{width:70}}>Price</th>
              <th style={{width:90}}>Category</th>
              {budgetExpenses.length>0&&<th style={{width:110}}>Budget Line</th>}
              <th style={{width:24}}/>
            </tr>
          </thead>
          <tbody>
            {form.items.map(item=>(
              <tr key={item.id} className={item.included===false?'excluded':''}>
                <td><input type="checkbox" className="ri-check" checked={item.included!==false} onChange={e=>updateItem(item.id,'included',e.target.checked)}/></td>
                <td><input type="text" value={item.name} placeholder="Item name" onChange={e=>updateItem(item.id,'name',e.target.value)} style={{width:'100%',minWidth:80}}/></td>
                <td><input type="number" step="0.01" value={item.price} onChange={e=>updateItem(item.id,'price',e.target.value)} style={{width:65}}/></td>
                <td>
                  <select value={item.category||CATS[1]} onChange={e=>updateItem(item.id,'category',e.target.value)} style={{width:'100%'}}>
                    {CATS.map(c=><option key={c} value={c}>{c.split(' ').slice(1).join(' ')||c}</option>)}
                  </select>
                </td>
                {budgetExpenses.length>0&&(
                  <td>
                    <select value={item.budget_line_id||''} onChange={e=>updateItem(item.id,'budget_line_id',e.target.value||null)} style={{width:'100%'}}>
                      <option value="">— none —</option>
                      {budgetExpenses.map(e=><option key={e.id} value={e.id}>{e.label||e.category}</option>)}
                    </select>
                  </td>
                )}
                <td><button style={{background:'none',border:'none',color:'var(--red)',cursor:'pointer',fontSize:16,lineHeight:1}} onClick={()=>removeItem(item.id)}>×</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button className="btn btn-s sm" style={{marginBottom:12}} onClick={addItem}>+ Add Item</button>

      <div className="fr">
        <label>Total ($)</label>
        <input type="number" step="0.01" value={form.total||calcTotal.toFixed(2)} onChange={e=>setForm(f=>({...f,total:e.target.value}))}/>
        <div style={{fontSize:11,color:'var(--muted)',marginTop:3}}>Sum of checked items: {f$(calcTotal,2)}</div>
      </div>

      <div style={{display:'flex',gap:8}}>
        <button className="btn btn-s" style={{flex:1}} onClick={()=>{setStage('pick');setParsed(null);}}>↩ Back</button>
        <button className="btn btn-p" style={{flex:2}} onClick={save} disabled={saving}>{saving?<span className="spinner"/>:'💾 Save Receipt'}</button>
      </div>
    </>)}
  </Modal>);
}
