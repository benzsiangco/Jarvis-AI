import { useState } from 'react';
import { Server, Wifi, WifiOff, Loader2, ArrowRight, AlertCircle, CheckCircle2 } from 'lucide-react';

const S = {
  wrap: { display:'flex', height:'100vh', width:'100vw', alignItems:'center', justifyContent:'center', background:'#0f1011', color:'#f1f1ef', fontFamily:"'Inter',system-ui,-apple-system,sans-serif", WebkitFontSmoothing:'antialiased' },
  col: { width:'100%', maxWidth:'420px', padding:'0 24px' },
  logoWrap: { marginBottom:'40px', textAlign:'center' },
  iconBox: { margin:'0 auto 16px', display:'flex', width:'64px', height:'64px', alignItems:'center', justifyContent:'center', borderRadius:'16px', border:'1px solid #2a2c30', background:'#171819' },
  h1: { margin:0, fontSize:'24px', fontWeight:600, letterSpacing:'-0.01em' },
  sub: { margin:'4px 0 0', fontSize:'13px', color:'#7f827c' },
  card: { borderRadius:'12px', border:'1px solid #2a2c30', background:'#171819', padding:'24px' },
  row: { display:'flex', alignItems:'center', gap:'12px', marginBottom:'20px' },
  rowLabel: { fontSize:'13px', fontWeight:500 },
  iconMuted: { color:'#7f827c' },
  iconGreen: { color:'#34d399', marginLeft:'auto' },
  iconRed: { color:'#f87171', marginLeft:'auto' },
  spinMuted: { color:'#7f827c', marginLeft:'auto' },
  spinAnim: { animation:'spinner .8s linear infinite' },
  label: { display:'block', marginBottom:'6px', fontSize:'11px', fontWeight:600, color:'#7f827c' },
  input: { display:'block', width:'100%', marginBottom:'16px', padding:'10px 14px', fontSize:'13px', borderRadius:'8px', border:'1px solid #2a2c30', background:'#0f1011', color:'#f1f1ef', outline:'none', boxSizing:'border-box' },
  inputFocus: { borderColor:'#3b3e44' },
  errBox: { display:'flex', alignItems:'flex-start', gap:'8px', marginBottom:'16px', padding:'10px 14px', borderRadius:'8px', border:'1px solid rgba(248,113,113,0.25)', background:'rgba(127,29,29,0.15)', fontSize:'12px', color:'#f87171' },
  btn: { display:'flex', width:'100%', alignItems:'center', justifyContent:'center', gap:'8px', padding:'10px 14px', fontSize:'13px', fontWeight:600, borderRadius:'8px', border:'none', background:'#f1f1ef', color:'#0f1011', cursor:'pointer' },
  btnDisabled: { opacity:0.4, cursor:'not-allowed' },
  statusRow: { display:'flex', alignItems:'center', justifyContent:'center', gap:'8px', marginTop:'20px', fontSize:'11px', color:'#7f827c' },
};

export default function LoginPage({ onConnect }) {
  const [url, setUrl] = useState('http://localhost:6767');
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [inFocus, setInFocus] = useState(false);

  const handleConnect = async () => {
    setStatus('checking');
    setError('');
    try {
      const res = await fetch(`${url.replace(/\/+$/, '')}/api/health`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatus('online');
      setTimeout(() => onConnect(url.replace(/\/+$/, '')), 600);
    } catch (err) {
      setStatus('error');
      setError(err.message === 'Failed to fetch' || err.name === 'TimeoutError'
        ? 'Cannot reach backend. Make sure the server is running.'
        : err.message);
    }
  };

  return (
    <div style={S.wrap}>
      <div style={S.col}>
        <div style={S.logoWrap}>
          <div style={S.iconBox}><img src="logo.png" alt="" style={{width:36, height:36}}
            onError={(e) => { e.currentTarget.src = 'favicon.ico'; }} /></div>
          <h1 style={S.h1}>JARVIS</h1>
          <p style={S.sub}>Local AI coding agent</p>
        </div>

        <div style={S.card}>
          <div style={S.row}>
            <Server size={16} style={S.iconMuted} />
            <span style={S.rowLabel}>Backend connection</span>
            {status === 'online' && <CheckCircle2 size={14} style={S.iconGreen} />}
            {status === 'error' && <AlertCircle size={14} style={S.iconRed} />}
            {status === 'checking' && <Loader2 size={14} style={{...S.spinMuted, animation:'spinner .8s linear infinite'}} />}
          </div>

          <label style={S.label}>Server URL</label>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
            onFocus={() => setInFocus(true)}
            onBlur={() => setInFocus(false)}
            placeholder="http://localhost:6767"
            disabled={status === 'checking'}
            style={{...S.input, ...(inFocus ? S.inputFocus : {}), ...(status === 'checking' ? {opacity:0.5} : {})}}
          />

          {status === 'error' && (
            <div style={S.errBox}>
              <AlertCircle size={12} style={{flexShrink:0, marginTop:'2px'}} />
              <span>{error}</span>
            </div>
          )}

          <button
            onClick={handleConnect}
            disabled={status === 'checking' || !url.trim()}
            style={{...S.btn, ...((status === 'checking' || !url.trim()) ? S.btnDisabled : {})}}
          >
            {status === 'checking' ? (
              <><Loader2 size={14} style={{animation:'spinner .8s linear infinite'}} /> Connecting…</>
            ) : status === 'online' ? (
              <><CheckCircle2 size={14} /> Connected</>
            ) : (
              <><ArrowRight size={14} /> Connect</>
            )}
          </button>
        </div>

        <div style={S.statusRow}>
          {status === 'online' ? (
            <><Wifi size={12} style={{color:'#34d399'}} /> Backend connected</>
          ) : status === 'error' ? (
            <><WifiOff size={12} style={{color:'#f87171'}} /> Connection failed</>
          ) : (
            <><Wifi size={12} /> Enter server URL to begin</>
          )}
        </div>
      </div>
      <style>{`@keyframes spinner{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
