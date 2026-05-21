import { Loader2, Play, Square, CheckCircle } from 'lucide-react';
import { getModelCapabilities } from '../services/modelCapabilities';

export default function ModelCard({ model, isActive, isLoading, onLoad, onStop, serverStatus }) {
  const meta = parseModelMeta(model);
  const caps = getModelCapabilities(model.filename, { multimodal: meta.mmproj });

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 14px',
        borderRadius: 10,
        background: isActive ? 'rgba(6,182,212,0.04)' : 'transparent',
        border: isActive ? '1px solid rgba(6,182,212,0.15)' : '1px solid transparent',
        transition: 'all .12s',
        cursor: 'default',
      }}
      onMouseEnter={e => {
        if (!isActive) {
          e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)';
        }
      }}
      onMouseLeave={e => {
        if (!isActive) {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.borderColor = 'transparent';
        }
      }}
    >
      {/* Active dot */}
      <div style={{ width: 14, flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
        {isActive && (
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: '#22d3ee', boxShadow: '0 0 6px rgba(6,182,212,0.5)',
          }} />
        )}
      </div>

      {/* Name + badges */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <span style={{
            fontSize: 12.5, fontWeight: 600, color: isActive ? '#e2e8f0' : '#c8ccd6',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {meta.title}
          </span>
          {meta.quant && (
            <span style={{
              padding: '1px 6px', borderRadius: 4, fontSize: 9, fontWeight: 600,
              background: 'rgba(255,255,255,0.04)', color: '#6b7280',
              border: '1px solid rgba(255,255,255,0.06)',
              fontFamily: 'var(--font-mono)',
            }}>
              {meta.quant}
            </span>
          )}
          {meta.architecture && (
            <span style={{ fontSize: 9.5, color: '#5e6370' }}>{meta.architecture}</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
          {caps.thinking && <Badge label="Thinking" color="#a78bfa" />}
          {caps.coding && <Badge label="Coding" color="#22d3ee" />}
          {caps.image && <Badge label="Vision" color="#34d399" />}
          {caps.text && <Badge label="Text" color="#fbbf24" />}
          {meta.fileCount > 1 && <Badge label={`${meta.fileCount} files`} color="#67e8f9" />}
          <span style={{ fontSize: 9.5, color: '#5e6370', marginLeft: 2 }}>
            {formatModelSize(model.sizeMB)}
          </span>
        </div>
      </div>

      {/* Action */}
      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        {isActive && serverStatus === 'ready' && (
          <button onClick={(e) => { e.stopPropagation(); onStop?.(); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 4, height: 26,
              padding: '0 10px', borderRadius: 6, fontSize: 10, fontWeight: 600,
              background: 'rgba(248,113,113,0.08)', color: '#f87171',
              border: '1px solid rgba(248,113,113,0.15)', cursor: 'pointer',
              transition: 'all .12s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(248,113,113,0.18)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(248,113,113,0.08)'}
          >
            <Square size={8} fill="currentColor" /> Eject
          </button>
        )}
        <button onClick={(e) => { e.stopPropagation(); onLoad?.(model); }}
          disabled={isLoading || (!isActive && serverStatus === 'starting')}
          style={{
            display: 'flex', alignItems: 'center', gap: 4, height: 26,
            padding: '0 12px', borderRadius: 6, fontSize: 10, fontWeight: 600,
            border: 'none',
            background: isActive && serverStatus === 'ready'
              ? 'rgba(6,182,212,0.08)'
              : 'rgba(6,182,212,0.12)',
            color: isActive && serverStatus === 'ready' ? '#22d3ee' : '#67e8f9',
            opacity: (!isActive && serverStatus === 'starting') ? 0.4 : 1,
            cursor: (!isActive && serverStatus === 'starting') ? 'not-allowed' : 'pointer',
            transition: 'all .12s',
          }}
          onMouseEnter={e => {
            if (!isActive || serverStatus !== 'ready')
              e.currentTarget.style.background = 'rgba(6,182,212,0.22)';
          }}
          onMouseLeave={e => {
            if (!isActive || serverStatus !== 'ready')
              e.currentTarget.style.background = 'rgba(6,182,212,0.12)';
          }}
        >
          {isLoading ? (
            <><Loader2 size={9} style={{ animation: 'ms-spin .8s linear infinite' }} /> Loading</>
          ) : isActive && serverStatus === 'ready' ? (
            <><CheckCircle size={9} /> Loaded</>
          ) : (
            <><Play size={9} fill="currentColor" /> Load</>
          )}
        </button>
      </div>
    </div>
  );
}

function Badge({ label, color }) {
  return (
    <span style={{
      fontSize: 9, fontWeight: 600, color,
      letterSpacing: '.02em',
    }}>
      {label}
    </span>
  );
}

function parseModelMeta(model) {
  const raw = model.name || model.filename?.replace(/\.gguf$/i, '') || 'Model';
  const quant = model.quant || extractQuant(raw);
  const title = quant ? raw.replace(new RegExp(`[-_]${quant}$`, 'i'), '') : raw;
  const lower = raw.toLowerCase();
  return {
    title,
    quant,
    mmproj: !!model.mmproj || lower.includes('mmproj') || lower.includes('vision') || lower.includes('vl'),
    architecture: model.architecture || (lower.includes('gemma') ? 'Gemma' : lower.includes('nemotron') ? 'Nemotron' : lower.includes('llama') ? 'LLaMA' : ''),
    fileCount: model.fileCount || 1,
  };
}

function extractQuant(name) {
  const match = (name || '').match(/(?:^|[-_])((?:IQ|Q)\d(?:_[A-Z0-9]+)*)$/i);
  return match?.[1]?.toUpperCase() || '';
}

export function formatModelSize(sizeMB) {
  if (!Number.isFinite(sizeMB)) return 'Unknown';
  return sizeMB >= 1024 ? `${(sizeMB / 1024).toFixed(1)} GB` : `${sizeMB} MB`;
}
