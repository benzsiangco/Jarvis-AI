import { CheckCircle, Cpu, HardDrive, Loader2, Play, Square } from 'lucide-react';

export function ServerStatus({ status, model, onStop }) {
  const cfg = {
    ready: { color: 'text-emerald-300', dot: 'bg-emerald-400', label: 'Ready' },
    starting: { color: 'text-amber-300', dot: 'bg-amber-400 animate-pulse', label: 'Starting' },
    loading: { color: 'text-blue-300', dot: 'bg-blue-400 animate-pulse', label: 'Loading' },
    offline: { color: 'text-[var(--color-text-muted)]', dot: 'bg-zinc-600', label: 'Offline' },
    error: { color: 'text-red-300', dot: 'bg-red-400', label: 'Error' },
  };
  const c = cfg[status] || cfg.offline;
  const canStop = status === 'ready' || status === 'starting' || status === 'loading';

  return (
    <div className="rounded-xl border border-white/10 bg-[#18191d] p-3 shadow-[0_10px_28px_rgba(0,0,0,0.24)]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">
          Server
        </span>
        {canStop && (
          <button
            onClick={onStop}
            title="Stop local model server"
            className="flex h-7 items-center gap-1.5 rounded-lg border border-red-500/25 bg-red-500/10 px-2 text-[10px] font-semibold text-red-300 transition-all hover:border-red-400/40 hover:bg-red-500/20 hover:text-red-200"
          >
            <Square size={10} fill="currentColor" />
            Stop
          </button>
        )}
      </div>
      <div className="flex min-w-0 items-center gap-2.5 rounded-lg border border-white/5 bg-black/10 px-2.5 py-2">
        <span className={`h-2 w-2 flex-shrink-0 rounded-full ${c.dot}`} />
        <div className="min-w-0">
          <div className={`text-[12px] font-semibold ${c.color}`}>{c.label}</div>
          {model && <div className="mt-0.5 truncate text-[10px] text-[var(--color-text-muted)]">{model}</div>}
        </div>
      </div>
    </div>
  );
}

export function ModelCard({ model, isActive, isLoading, onLoad, serverStatus }) {
  const canLoad = serverStatus !== 'starting' && serverStatus !== 'loading';
  const meta = parseModelMeta(model);

  return (
    <div className={`rounded-xl border p-3 transition-all duration-150 ${
      isActive
        ? 'border-emerald-400/35 bg-emerald-400/[0.12] shadow-[0_0_0_1px_rgba(52,211,153,0.08),0_10px_24px_rgba(0,0,0,0.22)]'
        : 'border-white/10 bg-white/[0.035] shadow-sm hover:border-white/20 hover:bg-white/[0.055]'
    }`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            {isActive && <CheckCircle size={13} className="flex-shrink-0 text-emerald-300" />}
            <span className="truncate text-[12px] font-semibold leading-5 text-[var(--color-text-primary)]">
              {meta.title}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {meta.quant && <ModelTag>{meta.quant}</ModelTag>}
            {meta.mmproj && <ModelTag>Multimodal</ModelTag>}
            {meta.thinking && <ModelTag>Thinking</ModelTag>}
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[10px] text-[var(--color-text-muted)]">
            <HardDrive size={10} />
            <span>{formatModelSize(model.sizeMB)}</span>
          </div>
        </div>
        <button
          onClick={onLoad}
          disabled={isLoading || !canLoad || isActive}
          className={`flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[10px] font-semibold transition-all ${
            isActive
              ? 'border border-emerald-400/20 bg-emerald-400/15 text-emerald-200'
              : 'bg-[var(--color-accent)] text-[#07110f] shadow-[0_6px_16px_rgba(0,245,195,0.10)] hover:bg-[var(--color-accent-hover)] disabled:cursor-not-allowed disabled:opacity-45'
          }`}
        >
          {isLoading ? (
            <><Loader2 size={11} className="animate-spin" /> Loading</>
          ) : isActive ? (
            <><CheckCircle size={11} /> Active</>
          ) : (
            <><Play size={11} fill="currentColor" /> Load</>
          )}
        </button>
      </div>
    </div>
  );
}

export function EmptyModels({ dir, onRefresh }) {
  return (
    <div className="space-y-2 px-2 py-8 text-center">
      <Cpu size={24} className="mx-auto text-[var(--color-text-muted)] opacity-40" />
      <p className="text-[11px] text-[var(--color-text-muted)]">No GGUF models found</p>
      <p className="text-[10px] leading-relaxed text-[var(--color-text-muted)] opacity-70">
        Place .gguf files in the models folder.
      </p>
      {dir && <p className="break-all text-[9px] text-[var(--color-text-muted)] opacity-50">{dir}</p>}
      <button onClick={onRefresh} className="rounded-md px-2 py-1 text-[10px] font-semibold text-[var(--color-accent)] transition-colors hover:bg-white/[0.05]">
        Refresh
      </button>
    </div>
  );
}

function ModelTag({ children }) {
  return (
    <span className="rounded-md border border-white/10 bg-black/20 px-1.5 py-0.5 text-[9px] font-semibold text-[var(--color-text-muted)]">
      {children}
    </span>
  );
}

function parseModelMeta(model) {
  const raw = model.name || model.filename?.replace(/\.gguf$/i, '') || 'Model';
  const quant = raw.match(/(?:^|[-_])((?:IQ|Q)\d(?:_[A-Z0-9]+)*)$/i)?.[1]?.toUpperCase() || '';
  const title = quant ? raw.replace(new RegExp(`[-_]${quant}$`, 'i'), '') : raw;
  const lower = raw.toLowerCase();
  return {
    title,
    quant,
    mmproj: lower.includes('mmproj') || lower.includes('vision') || lower.includes('vl'),
    thinking: lower.includes('gemma-4') || lower.includes('nemotron') || lower.includes('reason'),
  };
}

function formatModelSize(sizeMB) {
  if (!Number.isFinite(sizeMB)) return 'Unknown size';
  if (sizeMB >= 1024) return `${(sizeMB / 1024).toFixed(1)} GB`;
  return `${sizeMB} MB`;
}
