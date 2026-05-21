import { Minus, Square, X } from 'lucide-react';

export default function TitleBar() {
  return (
    <div
      className="titlebar-drag flex h-9 select-none items-center px-3"
      style={{ position: 'relative', background:'#0d0e11', borderBottom:'1px solid rgba(255,255,255,0.04)', flexShrink:0 }}
    >
      {/* App icon + name — centered */}
      <div className="titlebar-no-drag flex items-center gap-2" style={{
        position: 'absolute', left: '50%', transform: 'translateX(-50%)',
      }}>
        <div style={{ width:26, height:26, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <img src="logo.png" alt="" style={{ width:18, height:18 }}
            onError={(e) => { e.currentTarget.src = 'favicon.ico'; }} />
        </div>
        <span style={{ fontSize:13, fontWeight:700, color:'#e2e4ea', letterSpacing:'-0.01em' }}>JARVIS</span>
      </div>

      <div style={{ flex: 1 }} />

      {/* Window controls */}
      <div className="titlebar-no-drag flex items-center">
        <button onClick={() => window.electronAPI?.minimize()} style={{ width:40, height:36, display:'flex', alignItems:'center', justifyContent:'center', color:'#52546a', transition:'all .12s' }} onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.04)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
          <Minus size={13} />
        </button>
        <button onClick={() => window.electronAPI?.maximize()} style={{ width:40, height:36, display:'flex', alignItems:'center', justifyContent:'center', color:'#52546a', transition:'all .12s' }} onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.04)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
          <Square size={10} />
        </button>
        <button onClick={() => window.electronAPI?.close()} style={{ width:40, height:36, display:'flex', alignItems:'center', justifyContent:'center', color:'#52546a', transition:'all .12s', borderRadius:'0 0 0 0' }} onMouseEnter={e=>{e.currentTarget.style.background='rgba(239,68,68,0.85)';e.currentTarget.style.color='#fff'}} onMouseLeave={e=>{e.currentTarget.style.background='transparent';e.currentTarget.style.color='#52546a'}}>
          <X size={13} />
        </button>
      </div>
    </div>
  );
}
