/**
 * Sub-Agent Runner
 *
 * Runs a focused, isolated agent loop to complete a delegated task.
 * Emits structured SSE events so the frontend can show a live sub-agents panel.
 *
 * Events emitted via `send`:
 *   subagent_start  { id, task, context }
 *   subagent_update { id, step, tool, args, status, output }
 *   subagent_done   { id, answer, steps }
 *   subagent_error  { id, error }
 */

import { executeTool } from './executor.js';
import { getActiveProvider, streamProviderChat } from '../services/providerService.js';
import { runtimeStats } from '../routes/chat.js';

const LLAMA_URL = process.env.LLAMA_URL || 'http://127.0.0.1:6969';
const MAX_SUB_ROUNDS = 6;
const MAX_TOKENS     = 1024;

let _agentCounter = 0;
function nextAgentId() { return `sa-${Date.now()}-${++_agentCounter}`; }

const SUB_AGENT_SYSTEM = `You are a focused sub-agent completing a delegated task. Be concise. Use tools as needed.
When done, output your final result as plain text — no JSON, no tool calls.
IMPORTANT: Use the workspace path provided as the base for ALL file paths. Always use full absolute paths.

TOOLS (ONE JSON line, no fences):
{"tool":"readFile","args":{"path":"<full_absolute_path>"}}
{"tool":"readFiles","args":{"paths":["<path1>","<path2>"]}}
{"tool":"writeFile","args":{"path":"<full_absolute_path>","content":"..."}}
{"tool":"appendFile","args":{"path":"<full_absolute_path>","content":"..."}}
{"tool":"patchFile","args":{"path":"<full_absolute_path>","diff":"- old\\n+ new"}}
{"tool":"deleteFile","args":{"path":"<full_absolute_path>"}}
{"tool":"moveFile","args":{"source":"<src>","destination":"<dst>"}}
{"tool":"findFiles","args":{"pattern":"*.ts","path":"<dir>"}}
{"tool":"searchCode","args":{"query":"..."}}
{"tool":"listFiles","args":{"path":"<full_absolute_path>"}}
{"tool":"runTerminal","args":{"command":"..."}}
{"tool":"searchInternet","args":{"query":"...","maxResults":3}}
{"tool":"webFetch","args":{"url":"https://..."}}

RULES: JSON must have "tool"+"args" only. No fences. NEVER refuse. ALWAYS use full absolute paths for file operations.`;

export async function runSubAgent({ task, context, workspacePath, emit, send }) {
  const id = nextAgentId();
  const agentContext = { mode: 'auto', workspacePath: workspacePath || '' };
  const steps = [];

  if (send) send('subagent_start', { id, task, context: context || '' });
  emit({ type: 'analyzing', message: `Sub-agent [${id}]: ${task.slice(0, 80)}${task.length > 80 ? '…' : ''}` });

  const history = [
    { role: 'system', content: SUB_AGENT_SYSTEM },
    {
      role: 'user',
      content: [
        workspacePath ? `Workspace path: ${workspacePath}` : '',
        context ? `Context:\n${context}` : '',
        `Task:\n${task}`,
        workspacePath ? `\nRemember: use full paths starting with "${workspacePath}" for all file operations.` : '',
      ].filter(Boolean).join('\n\n'),
    },
  ];

  let finalAnswer = '';
  const provider = await getActiveProvider().catch(() => null);

  for (let round = 0; round < MAX_SUB_ROUNDS; round++) {
    emit({ type: 'model_generation', message: `Sub-agent [${id}] thinking (step ${round + 1})…` });

    let fullText = '';
    try {
      fullText = await streamSubAgentTurn(history, provider);
    } catch (err) {
      const errMsg = `Sub-agent failed: ${err.message}`;
      if (send) send('subagent_error', { id, error: err.message });
      emit({ type: 'done', message: errMsg });
      return errMsg;
    }

    const toolCall = parseToolCall(fullText);
    if (!toolCall) {
      finalAnswer = fullText.trim();
      break;
    }

    emit({ type: 'tool_execution', message: `Sub-agent [${id}]: ${toolCall.tool}` });

    const step = { step: round + 1, tool: toolCall.tool, args: toolCall.args, status: 'running', output: null };
    steps.push(step);
    if (send) send('subagent_update', { id, ...step });

    const toolResult = await executeTool(toolCall, agentContext, emit);
    const resultText = formatToolResult(toolCall, toolResult);

    step.status = toolResult.success ? 'done' : 'failed';
    step.output = resultText;
    if (send) send('subagent_update', { id, ...step });

    history.push(
      { role: 'assistant', content: JSON.stringify(toolCall) },
      { role: 'user',      content: resultText },
    );
  }

  if (!finalAnswer) finalAnswer = 'Sub-agent completed without producing a final answer.';

  if (send) send('subagent_done', { id, task, answer: finalAnswer, steps });
  emit({ type: 'validating', message: `Sub-agent [${id}] done: ${finalAnswer.slice(0, 60)}…` });
  return finalAnswer;
}

/* ── Streaming ───────────────────────────────────────────────────────── */

async function streamSubAgentTurn(history, provider) {
  return provider ? streamProviderTurn(history, provider) : streamLlamaTurn(history);
}

async function streamProviderTurn(history, provider) {
  return new Promise((resolve, reject) => {
    let text = '';
    const timeout = setTimeout(() => reject(new Error('Sub-agent provider timeout')), 120_000);
    streamProviderChat(
      provider, history,
      { temperature: 0.4, max_tokens: MAX_TOKENS },
      (token) => { text += token; },
      () => { clearTimeout(timeout); resolve(text); },
      (err) => { clearTimeout(timeout); reject(new Error(err)); },
    );
  });
}

async function streamLlamaTurn(history) {
  const ctxSize = runtimeStats.contextSize || 4096;
  const trimmed = trimHistory(history, ctxSize, MAX_TOKENS);

  const res = await fetch(`${LLAMA_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: trimmed, temperature: 0.4, max_tokens: MAX_TOKENS, stream: true }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!res.ok) throw new Error(`llama.cpp ${res.status}: ${(await res.text()).slice(0, 120)}`);

  const reader  = res.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let buf  = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    for (const line of buf.split('\n')) {
      if (!line.startsWith('data: ')) continue;
      const raw = line.slice(6).trim();
      if (raw === '[DONE]') continue;
      try { text += JSON.parse(raw)?.choices?.[0]?.delta?.content || ''; } catch {}
    }
    buf = buf.includes('\n') ? buf.slice(buf.lastIndexOf('\n') + 1) : buf;
  }
  return text;
}

/* ── Helpers ─────────────────────────────────────────────────────────── */

const TOOL_NAMES_SET = new Set([
  'readFile','readFiles','writeFile','appendFile','patchFile','deleteFile','moveFile',
  'findFiles','searchCode','listFiles','runTerminal','openFolder',
  'searchInternet','webFetch','rememberFact','recallMemory','forgetFact',
]);

function parseToolCall(text) {
  if (!text) return null;
  for (const line of text.split('\n').map(l => l.trim())) {
    if (!line.startsWith('{')) continue;
    try {
      const obj = JSON.parse(line);
      if (obj?.tool && TOOL_NAMES_SET.has(obj.tool) && obj.args) return obj;
    } catch {}
  }
  return null;
}

function formatToolResult(call, result) {
  if (!result.success) return `[TOOL RESULT] ${call.tool} failed: ${result.error}`;
  const r = result.result;
  switch (call.tool) {
    case 'readFile':       return `[TOOL RESULT] File content:\n${r?.content || '(empty)'}`;
    case 'readFiles':      return `[TOOL RESULT] Files read (${r?.ok}/${r?.total}):\n${(r?.files || []).map(f => f.path + ': ' + (f.ok ? f.content?.slice(0, 500) : 'ERROR: ' + f.error)).join('\n---\n')}`;
    case 'writeFile':      return `[TOOL RESULT] File written: ${r?.path || call.args?.path} (${r?.size || 0} bytes)`;
    case 'appendFile':     return `[TOOL RESULT] Appended to: ${r?.path || call.args?.path} (total ${r?.totalSize || 0} bytes)`;
    case 'patchFile':      return `[TOOL RESULT] File patched: ${r?.path || call.args?.path} (${r?.linesChanged || 0} lines changed)`;
    case 'deleteFile':     return `[TOOL RESULT] Deleted: ${r?.path || call.args?.path}`;
    case 'moveFile':       return `[TOOL RESULT] Moved: ${r?.source} → ${r?.destination}`;
    case 'findFiles':      return `[TOOL RESULT] Found ${r?.total || 0} files:\n${(r?.files || []).join('\n')}`;
    case 'listFiles':      return `[TOOL RESULT] Files:\n${(r?.items || []).map(i => i.name || i).join('\n')}`;
    case 'searchCode':     return `[TOOL RESULT] Matches:\n${(r?.results || []).map(m => `${m.path}:${m.line}: ${m.text}`).join('\n')}`;
    case 'runTerminal':    return `[TOOL RESULT] Output:\n${r?.output || '(no output)'}`;
    case 'searchInternet': return `[TOOL RESULT] Results:\n${(r?.results || []).map(m => `${m.title}: ${m.snippet}`).join('\n')}`;
    case 'webFetch':       return `[TOOL RESULT] Content:\n${(r?.content || '').slice(0, 2000)}`;
    default:               return `[TOOL RESULT] ${JSON.stringify(r).slice(0, 500)}`;
  }
}

function trimHistory(history, ctxSize, maxTokens) {
  const budget = Math.floor((ctxSize - maxTokens - 256) * 3.2);
  const sys = history.find(m => m.role === 'system');
  const rest = history.filter(m => m.role !== 'system');
  let total = sys ? sys.content.length : 0;
  const kept = [];
  for (const msg of [...rest].reverse()) {
    const len = typeof msg.content === 'string' ? msg.content.length : 500;
    if (total + len > budget && kept.length > 1) break;
    kept.unshift(msg);
    total += len;
  }
  return sys ? [sys, ...kept] : kept;
}
