/**
 * ProviderManagerModal — connect to OpenAI-compatible APIs and local AI runtimes.
 *
 * Workflow:
 *   1. Pick a preset (LM Studio / Ollama / OpenAI / Groq / Anthropic / Custom)
 *   2. Form auto-fills with sane defaults
 *   3. "Test connection" hits the live API before saving
 *   4. On success, models are fetched and listed for selection
 *   5. Click a model to set it active
 */
import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Globe, Plus, X, Trash2, CheckCircle, AlertCircle, Loader2,
  RefreshCw, Server, Key, Search, Cpu, Zap, Cloud, HardDrive,
  ChevronRight, Wifi, WifiOff, Edit2, Info,
} from 'lucide-react';
import useProviderStore from '../stores/providerStore';
import useModelStore from '../stores/modelStore';

/* ─── Provider type metadata ───────────────────────────────────────────── */
const TYPE_META = {
  'openai':        { label: 'OpenAI',    color: '#22d3ee', icon: Cloud },
  'openai-compat': { label: 'Compatible',color: '#a78bfa', icon: Server },
  'ollama':        { label: 'Ollama',    color: '#fbbf24', icon: HardDrive },
  'anthropic':     { label: 'Anthropic', color: '#f472b6', icon: Cloud },
};

/* ─── Quick-start presets ──────────────────────────────────────────────── */
const PRESETS = [
  {
    id: 'kiro',
    name: 'Kiro',
    type: 'openai-compat',
    apiBase: 'http://localhost:8080/v1',
    apiKey: '',
    needsKey: false,
    desc: 'via kiro-gateway proxy',
    icon: HardDrive,
    color: '#7c6df0',
    helpUrl: 'https://github.com/jwadow/kiro-gateway',
    helpText: 'Kiro doesn\'t expose a direct API. Run a local proxy like kiro-gateway (port 8080) or KiroGate to bridge Kiro → OpenAI-compatible. Start the gateway, then click "Test connection".',
  },
  {
    id: 'lmstudio',
    name: 'LM Studio',
    type: 'openai-compat',
    apiBase: 'http://localhost:1234/v1',
    apiKey: '',
    needsKey: false,
    desc: 'Local LM Studio server',
    icon: HardDrive,
    color: '#22d3ee',
  },
  {
    id: 'ollama',
    name: 'Ollama',
    type: 'ollama',
    apiBase: 'http://localhost:11434',
    apiKey: '',
    needsKey: false,
    desc: 'Local Ollama server',
    icon: HardDrive,
    color: '#fbbf24',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    type: 'openai',
    apiBase: 'https://api.openai.com/v1',
    apiKey: '',
    needsKey: true,
    desc: 'GPT-4, GPT-4o, etc.',
    icon: Cloud,
    color: '#22d3ee',
  },
  {
    id: 'groq',
    name: 'Groq',
    type: 'openai',
    apiBase: 'https://api.groq.com/openai/v1',
    apiKey: '',
    needsKey: true,
    desc: 'Ultra-fast inference',
    icon: Zap,
    color: '#f97316',
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    type: 'anthropic',
    apiBase: 'https://api.anthropic.com/v1',
    apiKey: '',
    needsKey: true,
    desc: 'Claude models',
    icon: Cloud,
    color: '#f472b6',
  },
  {
    id: 'together',
    name: 'Together AI',
    type: 'openai',
    apiBase: 'https://api.together.xyz/v1',
    apiKey: '',
    needsKey: true,
    desc: 'Open-source models',
    icon: Cloud,
    color: '#a78bfa',
  },
  {
    id: 'mistral',
    name: 'Mistral AI',
    type: 'openai',
    apiBase: 'https://api.mistral.ai/v1',
    apiKey: '',
    needsKey: true,
    desc: 'Mistral / Mixtral',
    icon: Cloud,
    color: '#fb923c',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    type: 'openai',
    apiBase: 'https://api.deepseek.com/v1',
    apiKey: '',
    needsKey: true,
    desc: 'DeepSeek models',
    icon: Cloud,
    color: '#60a5fa',
  },
  {
    id: 'custom',
    name: 'Custom',
    type: 'openai-compat',
    apiBase: '',
    apiKey: '',
    needsKey: false,
    desc: 'vLLM, Jan, llama.cpp, …',
    icon: Server,
    color: '#a78bfa',
  },
];

const EMPTY_FORM = { name: '', type: 'openai-compat', apiBase: '', apiKey: '', _helpText: '', _helpUrl: '' };

export default function ProviderManagerModal({ open, onClose, backendUrl }) {
  const ref = useRef(null);

  const {
    providers, activeProviderId, activeModel, loading, error,
    fetchProviders, addProvider, updateProvider, deleteProvider,
    fetchModels, testProvider, testDraft, clearError,
  } = useProviderStore();

  const selectProviderModel = useModelStore((s) => s.selectProviderModel);
  const clearProviderModel = useModelStore((s) => s.clearProviderModel);

  // 'list' | 'add' | 'edit'
  const [view, setView] = useState('list');
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [testResult, setTestResult] = useState(null); // { ok, msg, count }
  const [testing, setTesting] = useState(false);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    if (!open) return;
    clearError(); // always clear stale errors when modal opens
    fetchProviders(backendUrl);
  }, [open, backendUrl, fetchProviders, clearError]);

  useEffect(() => {
    if (!open) return;
    const onOutside = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const onEsc = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open, onClose]);

  if (!open) return null;

  const resetForm = () => { setForm(EMPTY_FORM); setEditId(null); setTestResult(null); };
  const goList = () => { resetForm(); setView('list'); };

  const handleAddNew = () => { resetForm(); setView('add'); };

  const handleEdit = (p) => {
    setForm({ name: p.name, type: p.type, apiBase: p.apiBase, apiKey: '' });
    setEditId(p.id);
    setTestResult(null);
    setView('edit');
  };

  const handlePickPreset = (preset) => {
    setForm({
      name: preset.name,
      type: preset.type,
      apiBase: preset.apiBase,
      apiKey: preset.apiKey,
      _helpText: preset.helpText || '',
      _helpUrl: preset.helpUrl || '',
    });
    setTestResult(null);
  };

  const handleTestDraft = async () => {
    if (!form.apiBase) { setTestResult({ ok: false, msg: 'API base URL required' }); return; }
    setTesting(true);
    setTestResult(null);
    const draft = { type: form.type, apiBase: form.apiBase, apiKey: form.apiKey };
    const result = await testDraft(backendUrl, draft);
    setTesting(false);
    if (result?.success) {
      setTestResult({ ok: true, msg: `Connected · ${result.modelCount} model${result.modelCount === 1 ? '' : 's'} · ${result.latencyMs}ms` });
    } else {
      setTestResult({ ok: false, msg: useProviderStore.getState().error || 'Connection failed' });
    }
  };

  const handleSave = async () => {
    if (!form.name?.trim() || !form.apiBase?.trim()) return;
    setBusyId('saving');
    let id = editId;
    // Strip frontend-only helper fields before sending
    const payload = { name: form.name, type: form.type, apiBase: form.apiBase, apiKey: form.apiKey };
    if (editId) {
      await updateProvider(backendUrl, editId, payload);
    } else {
      const result = await addProvider(backendUrl, payload);
      id = result?.id;
    }
    if (id) {
      const models = await fetchModels(backendUrl, id);
      // Auto-pick if exactly one model (typical LM Studio / single-loaded setups)
      if (models?.length === 1 && !activeProviderId) {
        await selectProviderModel(backendUrl, id, models[0].id);
        await fetchProviders(backendUrl);
      }
    }
    setBusyId(null);
    goList();
  };

  const handleSelectModel = async (providerId, modelId) => {
    setBusyId(providerId + ':' + modelId);
    await selectProviderModel(backendUrl, providerId, modelId);
    await fetchProviders(backendUrl);
    setBusyId(null);
  };

  const handleDisconnect = async () => {
    setBusyId('disconnecting');
    await clearProviderModel(backendUrl);
    await fetchProviders(backendUrl);
    setBusyId(null);
  };

  const handleRefresh = async (id) => {
    setBusyId('refresh:' + id);
    await fetchModels(backendUrl, id);
    setBusyId(null);
  };

  const handleTestExisting = async (id) => {
    setBusyId('test:' + id);
    const result = await testProvider(backendUrl, id);
    setBusyId(null);
    return result;
  };

  const handleDelete = async (id) => {
    if (!confirm('Remove this provider?')) return;
    setBusyId('delete:' + id);
    await deleteProvider(backendUrl, id);
    setBusyId(null);
  };

  const activeProvider = providers.find((p) => p.id === activeProviderId);

  return (
    <div className="pm-backdrop">
      <div ref={ref} className="pm-shell">
        <Header
          view={view}
          activeProvider={activeProvider}
          activeModel={activeModel}
          onAdd={handleAddNew}
          onBack={goList}
          onClose={onClose}
          onDisconnect={handleDisconnect}
          disconnecting={busyId === 'disconnecting'}
        />

        {error && (
          <div className="pm-error">
            <AlertCircle size={13} />
            <span>{error}</span>
            <button onClick={clearError}><X size={13} /></button>
          </div>
        )}

        <div className="pm-body">
          {view === 'list' ? (
            <ProvidersList
              providers={providers}
              loading={loading}
              activeProviderId={activeProviderId}
              activeModel={activeModel}
              busyId={busyId}
              onAddNew={handleAddNew}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onTest={handleTestExisting}
              onRefresh={handleRefresh}
              onSelect={handleSelectModel}
              onPickPreset={(preset) => { handlePickPreset(preset); setView('add'); }}
            />
          ) : (
            <ProviderForm
              isEdit={view === 'edit'}
              form={form}
              setForm={setForm}
              testResult={testResult}
              testing={testing}
              saving={busyId === 'saving'}
              onTest={handleTestDraft}
              onSave={handleSave}
              onCancel={goList}
              onPickPreset={handlePickPreset}
            />
          )}
        </div>
      </div>
      <PMStyles />
    </div>
  );
}

/* ─── Header ─────────────────────────────────────────────────────────── */

function Header({ view, activeProvider, activeModel, onAdd, onBack, onClose, onDisconnect, disconnecting }) {
  const isForm = view !== 'list';
  return (
    <div className="pm-header">
      <div className="pm-header-row">
        {isForm && (
          <button onClick={onBack} className="pm-icon-btn" title="Back">
            <ChevronRight size={14} style={{ transform: 'rotate(180deg)' }} />
          </button>
        )}
        <Globe size={15} style={{ color: '#22d3ee' }} />
        <span className="pm-title">
          {view === 'add' ? 'New Provider' : view === 'edit' ? 'Edit Provider' : 'Model Providers'}
        </span>
        <div style={{ flex: 1 }} />
        {!isForm && (
          <button onClick={onAdd} className="pm-add-btn">
            <Plus size={13} /> Add Provider
          </button>
        )}
        <button onClick={onClose} className="pm-icon-btn" title="Close">
          <X size={15} />
        </button>
      </div>

      {!isForm && activeProvider && (
        <div className="pm-active-banner">
          <Wifi size={13} style={{ color: '#22d3ee' }} />
          <span className="pm-active-using">Connected to</span>
          <strong>{activeProvider.name}</strong>
          <span className="pm-active-model">{activeModel}</span>
          <span style={{ flex: 1 }} />
          <button onClick={onDisconnect} disabled={disconnecting} className="pm-disconnect-btn">
            {disconnecting ? <Loader2 size={11} className="pm-spin" /> : <X size={11} />}
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── Providers List ─────────────────────────────────────────────────── */

function ProvidersList({
  providers, loading, activeProviderId, activeModel, busyId,
  onAddNew, onEdit, onDelete, onTest, onRefresh, onSelect, onPickPreset,
}) {
  if (loading && !providers.length) {
    return (
      <div className="pm-empty">
        <Loader2 size={26} className="pm-spin" style={{ color: '#22d3ee' }} />
        <div>Loading providers…</div>
      </div>
    );
  }

  if (!providers.length) {
    return (
      <div className="pm-empty-state">
        <Globe size={36} style={{ color: '#3a3c4e' }} />
        <h3>No providers yet</h3>
        <p>Connect to an API or a local server to start chatting with hosted models.</p>
        <button onClick={onAddNew} className="pm-cta-btn">
          <Plus size={13} /> Add provider manually
        </button>

        <div className="pm-presets-grid">
          {PRESETS.filter((p) => p.id !== 'custom').map((p) => (
            <PresetCard key={p.id} preset={p} onClick={() => onPickPreset(p)} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="pm-list">
      {providers.map((p) => (
        <ProviderCard
          key={p.id}
          provider={p}
          isActive={p.id === activeProviderId}
          activeModel={activeModel}
          busyId={busyId}
          onEdit={() => onEdit(p)}
          onDelete={() => onDelete(p.id)}
          onTest={() => onTest(p.id)}
          onRefresh={() => onRefresh(p.id)}
          onSelect={(modelId) => onSelect(p.id, modelId)}
        />
      ))}
    </div>
  );
}

/* ─── Provider Card ──────────────────────────────────────────────────── */

function ProviderCard({ provider, isActive, activeModel, busyId, onEdit, onDelete, onTest, onRefresh, onSelect }) {
  const meta = TYPE_META[provider.type] || TYPE_META['openai-compat'];
  const Icon = meta.icon;
  const [filter, setFilter] = useState('');
  const [testMsg, setTestMsg] = useState(null); // { ok, text }

  const refreshing = busyId === 'refresh:' + provider.id;
  const testing    = busyId === 'test:' + provider.id;
  const deleting   = busyId === 'delete:' + provider.id;

  const handleTest = async () => {
    setTestMsg(null);
    const result = await onTest();
    if (result?.success) {
      setTestMsg({ ok: true, text: `Connected · ${result.modelCount} model${result.modelCount === 1 ? '' : 's'} · ${result.latencyMs}ms` });
    } else {
      setTestMsg({ ok: false, text: 'Offline — check the server URL' });
    }
    setTimeout(() => setTestMsg(null), 4000);
  };

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return provider.models;
    return provider.models.filter((m) =>
      (m.name || '').toLowerCase().includes(q) || (m.id || '').toLowerCase().includes(q)
    );
  }, [provider.models, filter]);

  return (
    <div className={`pm-card ${isActive ? 'pm-card-active' : ''}`}>
      <div className="pm-card-head">
        <div className="pm-card-icon" style={{ color: meta.color, background: `${meta.color}14` }}>
          <Icon size={16} />
        </div>
        <div className="pm-card-meta">
          <div className="pm-card-name-row">
            <span className="pm-card-name" style={isActive ? { color: '#22d3ee' } : null}>{provider.name}</span>
            <span className="pm-card-type" style={{ color: meta.color, background: `${meta.color}14`, borderColor: `${meta.color}26` }}>
              {meta.label}
            </span>
            {isActive && <span className="pm-card-active-badge">Active</span>}
            {provider.lastTestStatus === 'failed' && (
              <span className="pm-card-failed-badge"><WifiOff size={9} /> Offline</span>
            )}
          </div>
          <div className="pm-card-base">{provider.apiBase}</div>
        </div>

        <div className="pm-card-actions">
          <button onClick={handleTest} disabled={testing} className="pm-btn-ghost" title="Test connection">
            {testing ? <Loader2 size={11} className="pm-spin" /> : <CheckCircle size={11} />}
            Test
          </button>
          {testMsg && (
            <span style={{
              fontSize: 10, fontWeight: 600, padding: '3px 7px', borderRadius: 5,
              background: testMsg.ok ? 'rgba(74,222,128,0.1)' : 'rgba(248,113,113,0.1)',
              color: testMsg.ok ? '#4ade80' : '#f87171',
              border: `1px solid ${testMsg.ok ? 'rgba(74,222,128,0.2)' : 'rgba(248,113,113,0.2)'}`,
            }}>
              {testMsg.text}
            </span>
          )}
          <button onClick={onEdit} className="pm-btn-ghost" title="Edit">
            <Edit2 size={11} />
          </button>
          <button onClick={onDelete} disabled={deleting} className="pm-btn-danger" title="Remove">
            {deleting ? <Loader2 size={11} className="pm-spin" /> : <Trash2 size={11} />}
          </button>
        </div>
      </div>

      <div className="pm-card-models">
        <div className="pm-models-toolbar">
          <div className="pm-search">
            <Search size={11} />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={`Search ${provider.models.length} model${provider.models.length === 1 ? '' : 's'}…`}
            />
          </div>
          <button onClick={onRefresh} disabled={refreshing} className="pm-btn-refresh">
            {refreshing ? <Loader2 size={10} className="pm-spin" /> : <RefreshCw size={10} />}
            Refresh
          </button>
        </div>

        {filtered.length > 0 ? (
          <div className="pm-models-list">
            {filtered.map((m) => {
              const isSel = isActive && activeModel === m.id;
              const sel   = busyId === provider.id + ':' + m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onSelect(m.id)}
                  className={`pm-model-row ${isSel ? 'pm-model-row-active' : ''}`}
                >
                  <span className="pm-model-dot" />
                  <span className="pm-model-name">{m.name}</span>
                  {m.meta && <span className="pm-model-meta">{m.meta}</span>}
                  {m.ownedBy && <span className="pm-model-owner">{m.ownedBy}</span>}
                  {isSel && <span className="pm-model-active">Active</span>}
                  {sel && <Loader2 size={10} className="pm-spin" />}
                </button>
              );
            })}
          </div>
        ) : provider.models.length === 0 ? (
          <div className="pm-models-empty">Click <strong>Refresh</strong> to fetch available models.</div>
        ) : (
          <div className="pm-models-empty">No models match "{filter}".</div>
        )}
      </div>
    </div>
  );
}

/* ─── Provider Form (Add/Edit) ───────────────────────────────────────── */

function ProviderForm({ isEdit, form, setForm, testResult, testing, saving, onTest, onSave, onCancel, onPickPreset }) {
  const set = (patch) => setForm({ ...form, ...patch });
  const meta = TYPE_META[form.type] || TYPE_META['openai-compat'];
  const placeholderUrl =
    form.type === 'ollama'      ? 'http://localhost:11434' :
    form.type === 'anthropic'   ? 'https://api.anthropic.com/v1' :
    'https://api.example.com/v1';

  const requiresKey = form.type !== 'ollama';
  const hasHelp = !!form._helpText;

  return (
    <div className="pm-form">
      {!isEdit && (
        <>
          <SectionLabel>Quick Start</SectionLabel>
          <div className="pm-presets-grid pm-presets-grid-compact">
            {PRESETS.map((p) => (
              <PresetCard key={p.id} preset={p} compact onClick={() => onPickPreset(p)} />
            ))}
          </div>
          <SectionLabel style={{ marginTop: 18 }}>Or configure manually</SectionLabel>
        </>
      )}

      {hasHelp && (
        <div className="pm-help-banner">
          <Info size={12} />
          <div>
            <p>{form._helpText}</p>
            {form._helpUrl && (
              <a href={form._helpUrl} target="_blank" rel="noopener noreferrer">
                Open setup guide →
              </a>
            )}
          </div>
        </div>
      )}

      <div className="pm-form-grid">
        <Field label="Display name">
          <input
            value={form.name}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="My provider"
          />
        </Field>
        <Field label="Type" hint="OpenAI = official API · Compatible = LM Studio, vLLM, Jan, etc.">
          <select value={form.type} onChange={(e) => set({ type: e.target.value })}>
            <option value="openai">OpenAI (Bearer auth)</option>
            <option value="openai-compat">OpenAI Compatible</option>
            <option value="ollama">Ollama</option>
            <option value="anthropic">Anthropic (Claude)</option>
          </select>
        </Field>
      </div>

      <Field label="API Base URL" hint="Include /v1 if the provider expects it (most do)">
        <input
          value={form.apiBase}
          onChange={(e) => set({ apiBase: e.target.value })}
          placeholder={placeholderUrl}
          spellCheck={false}
        />
      </Field>

      {requiresKey && (
        <Field label={form.type === 'ollama' ? 'API Key (rarely needed)' : 'API Key'} hint={isEdit ? 'Leave blank to keep the saved key' : ''}>
          <div className="pm-input-icon">
            <Key size={11} />
            <input
              type="password"
              value={form.apiKey}
              onChange={(e) => set({ apiKey: e.target.value })}
              placeholder={form.type === 'anthropic' ? 'sk-ant-…' : 'sk-…'}
            />
          </div>
        </Field>
      )}

      {testResult && (
        <div className={`pm-test-result ${testResult.ok ? 'pm-test-ok' : 'pm-test-fail'}`}>
          {testResult.ok ? <CheckCircle size={12} /> : <AlertCircle size={12} />}
          <span>{testResult.msg}</span>
        </div>
      )}

      <div className="pm-form-actions">
        <button type="button" onClick={onCancel} className="pm-btn-ghost-large">Cancel</button>
        <button type="button" onClick={onTest} disabled={testing || !form.apiBase} className="pm-btn-test">
          {testing ? <Loader2 size={12} className="pm-spin" /> : <Wifi size={12} />}
          Test connection
        </button>
        <button type="button" onClick={onSave} disabled={saving || !form.name || !form.apiBase} className="pm-btn-primary">
          {saving ? <Loader2 size={12} className="pm-spin" /> : <CheckCircle size={12} />}
          {isEdit ? 'Save changes' : 'Save & connect'}
        </button>
      </div>
    </div>
  );
}

/* ─── Sub-components ─────────────────────────────────────────────────── */

function SectionLabel({ children, style }) {
  return <div className="pm-section-label" style={style}>{children}</div>;
}

function Field({ label, hint, children }) {
  return (
    <div className="pm-field">
      <label>{label}</label>
      {children}
      {hint && <div className="pm-field-hint">{hint}</div>}
    </div>
  );
}

function PresetCard({ preset, onClick, compact }) {
  const Icon = preset.icon;
  return (
    <button type="button" onClick={onClick} className={`pm-preset ${compact ? 'pm-preset-compact' : ''}`}>
      <div className="pm-preset-icon" style={{ color: preset.color, background: `${preset.color}14` }}>
        <Icon size={14} />
      </div>
      <div className="pm-preset-text">
        <div className="pm-preset-name">{preset.name}</div>
        <div className="pm-preset-desc">{preset.desc}</div>
      </div>
      {preset.needsKey && <Key size={9} style={{ color: '#5e6370' }} />}
    </button>
  );
}

/* ─── Inline styles ──────────────────────────────────────────────────── */

function PMStyles() {
  return (
    <style>{`
      .pm-backdrop {
        position: fixed; inset: 0; z-index: 9999;
        background: rgba(0,0,0,0.6); backdrop-filter: blur(6px);
        display: flex; align-items: center; justify-content: center;
        animation: pm-fade .15s ease-out;
      }
      .pm-shell {
        width: 720px; height: 86vh; max-height: 820px;
        display: flex; flex-direction: column;
        border-radius: 16px; overflow: hidden;
        background: #0b0c13;
        border: 1px solid rgba(255,255,255,0.06);
        box-shadow: 0 32px 80px rgba(0,0,0,0.7);
      }
      .pm-spin { animation: pm-spin .8s linear infinite; }
      @keyframes pm-spin { to { transform: rotate(360deg); } }
      @keyframes pm-fade { from { opacity: 0; } to { opacity: 1; } }

      /* Header */
      .pm-header { padding: 14px 18px; border-bottom: 1px solid rgba(255,255,255,0.05); background: #0a0b12; }
      .pm-header-row { display: flex; align-items: center; gap: 10px; }
      .pm-title { font-size: 14px; font-weight: 700; color: #e2e4ea; }
      .pm-icon-btn {
        display: inline-flex; align-items: center; justify-content: center;
        width: 28px; height: 28px; border-radius: 7px;
        background: transparent; color: #52546a; border: none; cursor: pointer;
        transition: all .12s;
      }
      .pm-icon-btn:hover { background: rgba(255,255,255,0.06); color: #e2e4ea; }
      .pm-add-btn {
        display: inline-flex; align-items: center; gap: 6px;
        padding: 6px 13px; border-radius: 7px; font-size: 11px; font-weight: 600;
        background: rgba(6,182,212,0.1); color: #22d3ee;
        border: 1px solid rgba(6,182,212,0.18); cursor: pointer; transition: all .12s;
      }
      .pm-add-btn:hover { background: rgba(6,182,212,0.18); }

      .pm-active-banner {
        display: flex; align-items: center; gap: 8px;
        margin-top: 10px; padding: 8px 13px; border-radius: 8px;
        background: rgba(6,182,212,0.06); border: 1px solid rgba(6,182,212,0.14);
        font-size: 11.5px;
      }
      .pm-active-using { color: #5e6370; }
      .pm-active-banner strong { color: #22d3ee; }
      .pm-active-model { color: #6b7280; font-family: var(--font-mono); font-size: 11px; }
      .pm-disconnect-btn {
        display: inline-flex; align-items: center; gap: 5px;
        padding: 4px 9px; border-radius: 5px; font-size: 10px; font-weight: 600;
        background: rgba(248,113,113,0.08); color: #f87171;
        border: 1px solid rgba(248,113,113,0.14); cursor: pointer; transition: all .12s;
      }
      .pm-disconnect-btn:hover { background: rgba(248,113,113,0.16); }
      .pm-disconnect-btn:disabled { opacity: .5; cursor: not-allowed; }

      /* Error */
      .pm-error {
        display: flex; align-items: center; gap: 8px;
        padding: 9px 18px; border-bottom: 1px solid rgba(248,113,113,0.14);
        background: rgba(248,113,113,0.05); font-size: 11.5px; color: #f87171;
      }
      .pm-error span { flex: 1; }
      .pm-error button { background: none; border: none; color: #f87171; cursor: pointer; }

      /* Body */
      .pm-body { flex: 1; min-height: 0; overflow-y: auto; padding: 16px 18px; }
      .pm-empty {
        display: flex; flex-direction: column; align-items: center; gap: 12px;
        padding: 80px 0; color: #5e6370; font-size: 13px;
      }
      .pm-empty-state {
        display: flex; flex-direction: column; align-items: center; gap: 8px;
        padding: 24px 0 16px; text-align: center;
      }
      .pm-empty-state h3 { font-size: 14px; font-weight: 600; color: #c8cad4; margin: 6px 0 0; }
      .pm-empty-state p { font-size: 12px; color: #5e6370; max-width: 380px; margin: 0 0 12px; }
      .pm-cta-btn {
        display: inline-flex; align-items: center; gap: 6px;
        padding: 7px 14px; border-radius: 8px; font-size: 11.5px; font-weight: 600;
        background: rgba(255,255,255,0.04); color: #c8cad4;
        border: 1px solid rgba(255,255,255,0.08); cursor: pointer; margin-bottom: 18px;
      }

      /* Provider list */
      .pm-list { display: flex; flex-direction: column; gap: 12px; }
      .pm-card {
        border-radius: 12px; overflow: hidden;
        border: 1px solid rgba(255,255,255,0.05);
        background: rgba(255,255,255,0.015);
      }
      .pm-card-active { border-color: rgba(6,182,212,0.22); background: rgba(6,182,212,0.03); }
      .pm-card-head { display: flex; align-items: center; gap: 12px; padding: 12px 14px; }
      .pm-card-icon {
        display: inline-flex; align-items: center; justify-content: center;
        width: 32px; height: 32px; border-radius: 8px;
      }
      .pm-card-meta { min-width: 0; flex: 1; }
      .pm-card-name-row { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }
      .pm-card-name { font-size: 13px; font-weight: 650; color: #c8cad4; }
      .pm-card-type {
        padding: 1px 6px; border-radius: 4px; font-size: 9px; font-weight: 700; letter-spacing: .04em;
        text-transform: uppercase; border: 1px solid;
      }
      .pm-card-active-badge {
        padding: 1px 6px; border-radius: 4px; font-size: 9px; font-weight: 700;
        background: rgba(6,182,212,0.14); color: #22d3ee;
      }
      .pm-card-failed-badge {
        display: inline-flex; align-items: center; gap: 3px;
        padding: 1px 6px; border-radius: 4px; font-size: 9px; font-weight: 700;
        background: rgba(248,113,113,0.1); color: #f87171;
      }
      .pm-card-base {
        font-size: 10.5px; color: #5e6370; margin-top: 2px;
        font-family: var(--font-mono);
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .pm-card-actions { display: flex; gap: 5px; flex-shrink: 0; }
      .pm-btn-ghost {
        display: inline-flex; align-items: center; gap: 4px;
        padding: 5px 9px; border-radius: 6px; font-size: 10.5px; font-weight: 500;
        background: rgba(255,255,255,0.03); color: #8b8d99;
        border: 1px solid rgba(255,255,255,0.06); cursor: pointer; transition: all .12s;
      }
      .pm-btn-ghost:hover:not(:disabled) { background: rgba(255,255,255,0.06); color: #c8cad4; }
      .pm-btn-ghost:disabled { opacity: .5; cursor: not-allowed; }
      .pm-btn-danger {
        display: inline-flex; align-items: center;
        padding: 5px 9px; border-radius: 6px; font-size: 10.5px;
        background: rgba(248,113,113,0.06); color: #f87171;
        border: 1px solid rgba(248,113,113,0.12); cursor: pointer; transition: all .12s;
      }
      .pm-btn-danger:hover:not(:disabled) { background: rgba(248,113,113,0.14); }
      .pm-btn-danger:disabled { opacity: .5; cursor: not-allowed; }

      /* Card models section */
      .pm-card-models { border-top: 1px solid rgba(255,255,255,0.04); }
      .pm-models-toolbar {
        display: flex; align-items: center; gap: 8px;
        padding: 7px 14px; background: rgba(255,255,255,0.012);
      }
      .pm-search {
        display: inline-flex; align-items: center; gap: 5px; flex: 1;
        padding: 4px 9px; border-radius: 6px;
        background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.05);
      }
      .pm-search svg { color: #52546a; }
      .pm-search input {
        flex: 1; background: transparent; border: 0; color: #c8cad4;
        font-size: 11px; outline: none;
      }
      .pm-btn-refresh {
        display: inline-flex; align-items: center; gap: 4px;
        padding: 4px 9px; border-radius: 5px; font-size: 9.5px; font-weight: 600;
        background: rgba(6,182,212,0.06); color: #22d3ee;
        border: 1px solid rgba(6,182,212,0.12); cursor: pointer; transition: all .12s;
      }
      .pm-btn-refresh:hover:not(:disabled) { background: rgba(6,182,212,0.14); }
      .pm-btn-refresh:disabled { opacity: .5; cursor: not-allowed; }

      .pm-models-list { max-height: 240px; overflow-y: auto; }
      .pm-model-row {
        display: flex; align-items: center; gap: 9px; width: 100%;
        padding: 7px 14px; cursor: pointer; transition: background .1s;
        background: transparent; border: 0;
        border-left: 2px solid transparent;
        text-align: left;
      }
      .pm-model-row:hover { background: rgba(255,255,255,0.03); }
      .pm-model-row-active {
        background: rgba(6,182,212,0.05);
        border-left-color: #22d3ee;
      }
      .pm-model-dot {
        width: 5px; height: 5px; border-radius: 50%;
        background: rgba(255,255,255,0.12); flex-shrink: 0;
      }
      .pm-model-row-active .pm-model-dot { background: #22d3ee; box-shadow: 0 0 6px rgba(34,211,238,0.55); }
      .pm-model-name { font-size: 12px; color: #a0a2ae; flex: 1; min-width: 0;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 400; }
      .pm-model-row-active .pm-model-name { color: #22d3ee; font-weight: 600; }
      .pm-model-meta {
        font-size: 10px; color: #5e6370; font-family: var(--font-mono);
        padding: 1px 5px; border-radius: 3px; background: rgba(255,255,255,0.03);
      }
      .pm-model-owner { font-size: 9.5px; color: #5e6370; text-transform: lowercase; }
      .pm-model-active { font-size: 9.5px; color: #4ade80; font-weight: 600; }
      .pm-models-empty {
        padding: 14px; font-size: 11.5px; color: #5e6370; text-align: center;
        background: rgba(255,255,255,0.005);
      }

      /* Form */
      .pm-form { display: flex; flex-direction: column; gap: 12px; }
      .pm-section-label {
        font-size: 10px; font-weight: 700; letter-spacing: .07em;
        text-transform: uppercase; color: #5e6370; margin-bottom: 4px;
      }

      .pm-help-banner {
        display: flex; gap: 9px; align-items: flex-start;
        padding: 10px 12px; border-radius: 9px;
        background: rgba(124, 109, 240, .07);
        border: 1px solid rgba(124, 109, 240, .2);
        color: #c4b5fd;
      }
      .pm-help-banner svg { color: #a78bfa; flex-shrink: 0; margin-top: 1px; }
      .pm-help-banner p { margin: 0; font-size: 11.5px; line-height: 1.55; color: rgba(226, 232, 240, .82); }
      .pm-help-banner a {
        display: inline-block; margin-top: 5px; font-size: 11px; font-weight: 600;
        color: #a78bfa; text-decoration: none; transition: color .12s;
      }
      .pm-help-banner a:hover { color: #c4b5fd; text-decoration: underline; }
      .pm-form-grid { display: grid; grid-template-columns: 1fr 200px; gap: 12px; }
      .pm-field { display: flex; flex-direction: column; gap: 5px; }
      .pm-field label { font-size: 10.5px; color: #8b8d99; font-weight: 500; }
      .pm-field input,
      .pm-field select {
        height: 34px; border-radius: 7px;
        border: 1px solid rgba(255,255,255,0.08);
        background: rgba(0,0,0,0.32); color: #e4e4ea;
        font-size: 12px; padding: 0 10px; outline: none; transition: border-color .12s;
        width: 100%;
      }
      .pm-field input:focus,
      .pm-field select:focus { border-color: rgba(6,182,212,0.4); }
      .pm-field-hint { font-size: 10px; color: #5e6370; }
      .pm-input-icon {
        display: flex; align-items: center; gap: 6px;
        height: 34px; padding: 0 10px;
        border-radius: 7px; border: 1px solid rgba(255,255,255,0.08);
        background: rgba(0,0,0,0.32);
      }
      .pm-input-icon:focus-within { border-color: rgba(6,182,212,0.4); }
      .pm-input-icon svg { color: #5e6370; flex-shrink: 0; }
      .pm-input-icon input {
        flex: 1; height: 100%; background: transparent; border: 0; outline: none;
        color: #e4e4ea; font-size: 12px;
      }

      .pm-test-result {
        display: inline-flex; align-items: center; gap: 6px;
        padding: 7px 11px; border-radius: 7px; font-size: 11px; font-weight: 500;
        align-self: flex-start;
      }
      .pm-test-ok   { background: rgba(74,222,128,0.08); color: #4ade80; border: 1px solid rgba(74,222,128,0.18); }
      .pm-test-fail { background: rgba(248,113,113,0.08); color: #f87171; border: 1px solid rgba(248,113,113,0.18); }

      .pm-form-actions {
        display: flex; gap: 8px; justify-content: flex-end; margin-top: 6px;
        padding-top: 14px; border-top: 1px solid rgba(255,255,255,0.04);
      }
      .pm-btn-ghost-large {
        padding: 7px 14px; border-radius: 7px; font-size: 11.5px;
        background: transparent; color: #7a7f8a; border: 0; cursor: pointer;
      }
      .pm-btn-ghost-large:hover { color: #c8cad4; }
      .pm-btn-test {
        display: inline-flex; align-items: center; gap: 5px;
        padding: 7px 13px; border-radius: 7px; font-size: 11.5px; font-weight: 600;
        background: rgba(255,255,255,0.04); color: #c8cad4;
        border: 1px solid rgba(255,255,255,0.08); cursor: pointer; transition: all .12s;
      }
      .pm-btn-test:hover:not(:disabled) { background: rgba(255,255,255,0.07); }
      .pm-btn-test:disabled { opacity: .5; cursor: not-allowed; }
      .pm-btn-primary {
        display: inline-flex; align-items: center; gap: 5px;
        padding: 7px 16px; border-radius: 7px; font-size: 11.5px; font-weight: 600;
        background: linear-gradient(135deg, rgba(6,182,212,0.9), rgba(20,184,166,0.9));
        color: #fff; border: 1px solid rgba(34,211,238,0.35); cursor: pointer;
        box-shadow: 0 2px 12px rgba(6,182,212,0.25); transition: all .12s;
      }
      .pm-btn-primary:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 4px 16px rgba(6,182,212,0.4); }
      .pm-btn-primary:disabled { opacity: .4; cursor: not-allowed; transform: none; box-shadow: none; }

      /* Presets */
      .pm-presets-grid {
        display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px;
        margin-top: 8px;
      }
      .pm-presets-grid-compact { grid-template-columns: repeat(3, 1fr); }
      .pm-preset {
        display: flex; align-items: center; gap: 9px;
        padding: 9px 11px; border-radius: 9px;
        background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05);
        cursor: pointer; transition: all .12s; text-align: left;
      }
      .pm-preset:hover { background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.1); transform: translateY(-1px); }
      .pm-preset-compact { padding: 7px 9px; }
      .pm-preset-icon {
        display: inline-flex; align-items: center; justify-content: center;
        width: 26px; height: 26px; border-radius: 6px; flex-shrink: 0;
      }
      .pm-preset-text { min-width: 0; flex: 1; }
      .pm-preset-name { font-size: 11.5px; font-weight: 600; color: #c8cad4; }
      .pm-preset-desc {
        font-size: 9.5px; color: #5e6370; margin-top: 1px;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
    `}</style>
  );
}
