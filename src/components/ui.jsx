export function KV({label,val,color}){return(<div className="kv"><span className="kv-label">{label}</span><span className="kv-val" style={color?{color}:{}}>{val}</span></div>)}

export function Modal({title,onClose,children}){
  return(<div className="modal-bg" onClick={e=>e.target===e.currentTarget&&onClose()}>
    <div className="modal">
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
        <div className="modal-title">{title}</div>
        <button className="btn btn-s sm" onClick={onClose}>✕</button>
      </div>
      {children}
    </div>
  </div>);
}
