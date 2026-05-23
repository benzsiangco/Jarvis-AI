/**
 * Agentic Chat Route
 * Gemma4 → Tool Call Parser → Permission Layer → Tool Executor → Result → Gemma4
 *
 * emit() is the live thinking feed — every call produces a real, contextual message
 * the user sees in the Reasoning panel.
 */
import { executeTool, TOOL_NAMES } from '../tools/executor.js';
import { getCustomTools } from './skills.js';
import { getSystemInstructions } from './settings.js';
import { getPersonaOverride } from './settings.js';
import { getMemoryContext } from '../services/memoryService.js';
import { basename } from 'path';
import { getActiveProvider, streamProviderChat } from '../services/providerService.js';

const LLAMA_URL = process.env.LLAMA_URL || 'http://127.0.0.1:6969';
const MAX_TOOL_ROUNDS = 10;

// ── Shared runtime stats (read by /api/models/stats) ─────────────────────
export const runtimeStats = { tokensPerSecond: 0, totalTokens: 0, contextUsed: 0, contextSize: 4096 };

// ── Approval bridge (agent loop ↔ approve endpoint) ──────────────────────
const pendingApprovals = new Map();

export function resolveApproval(round, approved) {
  const resolve = pendingApprovals.get(round);
  if (resolve) { resolve(approved); pendingApprovals.delete(round); }
}

function waitForApproval(round, timeoutMs = 120_000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => { pendingApprovals.delete(round); resolve(false); }, timeoutMs);
    pendingApprovals.set(round, (val) => { clearTimeout(timer); resolve(val); });
  });
}

// Core JARVIS identity — compact version to save context tokens
const JARVIS_PERSONA = `You are JARVIS. Address the user as "sir". Be concise, direct, and helpful. Use dry British wit. Never refuse — use a tool instead.`;

const SYSTEM_PROMPT = `${JARVIS_PERSONA}

## HOW TO USE TOOLS

To call a tool, output EXACTLY ONE raw JSON object on its own line. No markdown fences, no prose before or after it.

The JSON MUST have exactly two keys: "tool" and "args".

CORRECT EXAMPLES — copy this exact structure:
{"tool":"runTerminal","args":{"command":"date /t"}}
{"tool":"readFile","args":{"path":"C:/project/src/app.js"}}
{"tool":"writeFile","args":{"path":"C:/project/hello.txt","content":"Hello world"}}
{"tool":"searchCode","args":{"query":"useState"}}
{"tool":"listFiles","args":{"path":"C:/project"}}
{"tool":"searchInternet","args":{"query":"latest node version","maxResults":5}}
{"tool":"webFetch","args":{"url":"https://example.com"}}
{"tool":"rememberFact","args":{"content":"User's name is Benz"}}
{"tool":"recallMemory","args":{"query":"user name"}}
{"tool":"forgetFact","args":{"id":"abc123"}}
{"tool":"playVideo","args":{"query":"lofi hip hop beats"}}
{"tool":"playVideo","args":{"url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ"}}
{"tool":"spawnAgent","args":{"task":"refactor this file","context":"..."}}
{"tool":"askQuestion","args":{"question":"Which framework?","options":["React","Vue","Svelte"]}}
{"tool":"todoList","args":{"action":"add","text":"Fix login bug"}}

WRONG — never do these:
{"tool":"runTerminal","input":"date"}          ← WRONG: use "args":{"command":"..."}
{"tool":"runTerminal","command":"date"}        ← WRONG: wrap in "args":{...}
{"tool":"runTerminal"}                         ← WRONG: missing "args"
\`\`\`json\n{"tool":"runTerminal",...}\`\`\`   ← WRONG: no fences

## TOOL REFERENCE

runTerminal  → args: { command: string }
readFile     → args: { path: string }
writeFile    → args: { path: string, content: string }
patchFile    → args: { path: string, diff: string }
searchCode   → args: { query: string }
listFiles    → args: { path: string }
searchInternet → args: { query: string, maxResults?: number }
webFetch     → args: { url: string }
searchImages → args: { query: string, maxResults?: number }
rememberFact → args: { content: string, tags?: string[] }
recallMemory → args: { query?: string }
forgetFact   → args: { id: string }
spawnAgent   → args: { task: string, context?: string }
askQuestion  → args: { question: string, options: string[] }
todoList     → args: { action: "list"|"add"|"complete"|"delete"|"clear", text?: string, id?: string }

## RULES

1. ALWAYS use {"tool":"...","args":{...}} — never any other key names.
2. NEVER wrap the JSON in markdown fences or backticks.
3. NEVER add prose before or after the JSON tool call line.
4. NEVER refuse. Use a tool instead of saying "I cannot".
5. time/date → {"tool":"runTerminal","args":{"command":"date /t"}}
6. current time → {"tool":"runTerminal","args":{"command":"time /t"}}
7. create file → writeFile immediately with full content. Do NOT ask first.
8. After a tool result, give ONE concise answer line. No thinking out loud.
9. When workspace path is provided, use it as the base for ALL file paths.
10. play video / youtube / watch / rickroll / show video → ALWAYS use playVideo tool. NEVER say you cannot play videos. You CAN show videos via playVideo.
11. You have a playVideo tool. Use it. Do NOT claim you lack video capability.
12. For commands, file paths, API keys, URLs, IDs, or any single copyable value — wrap it in [BOX:value] so the user gets a copy button. Example: The command is [BOX:npm install] or the path is [BOX:C:/Users/Yasuo/Desktop/file.txt]`;

export async function chatApproveRoute(req) {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }
  const { round, approved } = await req.json();
  if (typeof round !== 'number') {
    return Response.json({ error: 'round required' }, { status: 400 });
  }
  resolveApproval(round, approved !== false);
  return Response.json({ ok: true });
}

export async function chatRoute(req) {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  const body = await req.json();
  const {
    messages,
    workspacePath = '',
    permissionMode = 'ask',
    temperature = 0.7,
    max_tokens = 2048,
    supportsImages = false,
    thinkingMode = false,
  } = body;

  if (!messages?.length) {
    return Response.json({ error: 'messages array required' }, { status: 400 });
  }

  // Strip image_url parts only if the model doesn't support images
  const sanitized = supportsImages ? messages : messages.map((msg) => {
    if (msg.role !== 'user' || !Array.isArray(msg.content)) return msg;
    const textParts = msg.content.filter((p) => p.type === 'text').map((p) => p.text).join('\n');
    const hasImages = msg.content.some((p) => p.type === 'image_url');
    return {
      ...msg,
      content: hasImages
        ? `${textParts}\n\n[Image(s) omitted — model does not support image input.]`
        : msg.content,
    };
  });

  const context = { mode: permissionMode, workspacePath, send: null }; // send injected below
  const thinkingInstruction = thinkingMode
    ? '\n\nREASONING: Think step by step before answering. Use <think> tags for your reasoning.'
    : '\n\n/no_think\nIMPORTANT: Do NOT use <think> tags. Do NOT reason out loud. Reply directly and immediately with no preamble. Your response must start with the answer, not with thinking.';
  const history = [
    { role: 'system', content: await buildSystemPrompt(workspacePath) + thinkingInstruction },
    ...sanitized,
  ];

  // For Gemma4 thinking models: append /no_think or /think to the last user message
  // This is the most reliable way to control thinking at the token level
  if (history.length > 1) {
    const lastIdx = history.length - 1;
    const last = history[lastIdx];
    if (last.role === 'user' && typeof last.content === 'string') {
      const suffix = thinkingMode ? '' : ' /no_think';
      if (suffix && !last.content.endsWith(suffix)) {
        history[lastIdx] = { ...last, content: last.content + suffix };
      }
    }
  }

  // Auto-inject webFetch for pasted URLs in the last user message
  const lastUserMsg = sanitized.filter((m) => m.role === 'user').slice(-1)[0];
  const lastContent = typeof lastUserMsg?.content === 'string' ? lastUserMsg.content : '';
  const urlMatch = lastContent.match(/https?:\/\/[^\s"'<>]+/);
  if (urlMatch && !lastContent.includes('"tool"') && lastContent.trim().startsWith('http')) {
    // Pure URL paste — prepend a webFetch instruction so the model knows to fetch it
    history[history.length - 1] = {
      ...history[history.length - 1],
      content: `Fetch and summarize the content of this URL: ${urlMatch[0]}`,
    };
  }

  // Auto-save identity facts from conversation (e.g. "i am Benz Siangco")
  // Do this BEFORE building history so the memory is available immediately.
  const identityMatch = lastContent.match(
    /(?:i(?:'m| am)|my name(?:'s| is)|call me)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)/i
  );
  if (identityMatch) {
    const name = identityMatch[1].trim();
    try {
      const { saveMemory } = await import('../services/memoryService.js');
      await saveMemory({ content: `User's name is ${name}`, tags: ['name'] });
    } catch {}
  }

  // Auto-inject playVideo for video/youtube requests — small models refuse otherwise
  const videoRequest = lastContent.match(
    /(?:play|show|watch|open|rickroll|put on|queue|find.*video|youtube)\s+(.+)|(.+)\s+(?:on youtube|video|music video)/i
  );
  if (videoRequest && /play|show|watch|rickroll|youtube|video/i.test(lastContent)) {
    const query = (videoRequest[1] || videoRequest[2] || lastContent).trim();
    // Inject a forced tool call as the last user message
    history[history.length - 1] = {
      ...history[history.length - 1],
      content: `${lastContent}\n[SYSTEM: Use playVideo tool now. Call: {"tool":"playVideo","args":{"query":"${query.replace(/"/g, '')}"}}]`,
    };
  }

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();

      /** Send a named SSE event */
      const send = (event, data) => {
        try {
          controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {}
      };

      /** Emit a reasoning event visible in the thinking panel */
      const emit = (thinking) => send('thinking', { thinking });

      // Inject send into context so sub-agents can emit their own SSE events
      context.send = send;

      try {
        // Detect active provider
        const activeProvider = await getActiveProvider();

        // Pre-flight: when no provider is selected, verify llama.cpp is alive
        // BEFORE entering the agent loop so we can surface a clear, actionable
        // error instead of failing partway through generation.
        if (!activeProvider) {
          let llamaAlive = false;
          try {
            const probe = await fetch(`${LLAMA_URL}/health`, { signal: AbortSignal.timeout(1500) });
            llamaAlive = probe.ok;
          } catch {}
          if (!llamaAlive) {
            const msg = 'No model is connected. Open the Models panel and either load a local GGUF or pick a model from a Provider (LM Studio, Ollama, OpenAI, Claude, etc.).';
            emit({ type: 'done', message: msg });
            send('data', { choices: [{ delta: { content: msg } }] });
            try { send('done', {}); } catch {}
            try { controller.close(); } catch {}
            return;
          }
        }

        // Initial context analysis
        emitContextAnalysis(emit, messages, workspacePath);

        // ── Pre-flight: intercept image search requests ──
        const isImageRequest = /\b(show|find|search|display|get|give me|look up)\b.{0,30}\b(image|photo|picture|pic|wallpaper|screenshot)s?\b/i.test(lastContent)
          || /\bimage of\b|\bphotos? of\b|\bpictures? of\b/i.test(lastContent);
        if (isImageRequest) {
          emit({ type: 'searching', message: 'Searching images…' });
          try {
            const q = lastContent
              .replace(/^(show me|find|search for|display|get me|give me|look up)\s*/i, '')
              .replace(/\s*(images?|photos?|pictures?|pics?|wallpapers?)\s*(of|for)?\s*/i, ' ')
              .trim() || lastContent.trim();
            const toolCall = { tool: 'searchImages', args: { query: q, maxResults: 10 } };
            const toolResult = await executeTool(toolCall, context, emit);
            send('tool_result', { tool: 'searchImages', result: toolResult, round: 0 });
            if (toolResult.success && toolResult.result?.images?.length) {
              const images = toolResult.result.images.slice(0, 12);
              const payload = JSON.stringify({ query: q, images });
              const encoded = btoa(unescape(encodeURIComponent(payload)));
              const response = `[IMAGES:${encoded}] Here are the images for "${q}", sir.`;
              send('data', { choices: [{ delta: { content: response } }] });
            } else {
              send('data', { choices: [{ delta: { content: `I couldn't find images for that, sir.` } }] });
            }
            emit({ type: 'done', message: 'Done' });
            try { send('done', {}); } catch {}
            try { controller.close(); } catch {}
            return;
          } catch (e) {
            // Fall through to normal agent loop
          }
        }

        // ── Pre-flight: intercept video requests ──
        // Small models (Gemma, Nemotron) refuse to use playVideo despite instructions.
        // Detect the intent server-side and bypass the model entirely.
        const isVideoRequest = /\b(play|rickroll|rick roll|show.*video|watch.*video|put on|queue up|youtube)\b/i.test(lastContent);
        if (isVideoRequest) {
          emit({ type: 'tool_execution', message: 'Searching YouTube…' });
          try {
            // Extract query — strip common prefixes
            const q = lastContent
              .replace(/^(play|show me|watch|put on|queue up|find|search for|rickroll me with|rickroll me|rickroll)\s*/i, '')
              .replace(/\s*(on youtube|video|music video|youtube video)\s*$/i, '')
              .trim() || lastContent.trim();
            const toolCall = { tool: 'playVideo', args: { query: q } };
            const toolResult = await executeTool(toolCall, context, emit);
            send('tool_result', { tool: 'playVideo', result: toolResult, round: 0 });
            if (toolResult.success && toolResult.result?.videoId) {
              const { videoId, query: vq } = toolResult.result;
              const response = `[VIDEO:${videoId}] Here's the video for "${vq || q}", sir.`;
              send('data', { choices: [{ delta: { content: response } }] });
            } else {
              send('data', { choices: [{ delta: { content: `I couldn't find a video for that, sir. ${toolResult.result?.error || toolResult.error || ''}` } }] });
            }
            emit({ type: 'done', message: 'Done' });
            try { send('done', {}); } catch {}
            try { controller.close(); } catch {}
            return;
          } catch (e) {
            // Fall through to normal agent loop if pre-flight fails
          }
        }

        await agentLoop({ history, context, temperature, max_tokens, send, emit, provider: activeProvider, thinkingMode });
      } catch (err) {
        const msg = err?.message || 'Unknown error';
        try { emit({ type: 'done', message: `Agent stopped: ${msg}` }); } catch {}
        try { send('data', { choices: [{ delta: { content: `\n\n${msg}` } }] }); } catch {}
      }

      // Ensure stream closure — if send() already failed the connection is dead
      try { send('done', {}); } catch {}
      try { controller.close(); } catch (e) {
        // close() can throw if the connection was already reset
        // The stream is already dead at this point — nothing to recover
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

// ── Agent Loop ────────────────────────────────────────────────────────────────

async function agentLoop({ history, context, temperature, max_tokens, send, emit, provider, thinkingMode = false }) {
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    // Bump round counter on the frontend
    send('thinking', { thinking: { type: '_round', round } });

    if (round === 0) {
      emit({ type: 'model_generation', message: 'Generating response...' });
    } else {
      emit({ type: 'model_generation', message: `Continuing analysis (step ${round + 1})...` });
    }

    let fullText;
    let thinkBuffer = '';
    try {
      const result = provider
        ? await streamProviderResponse({ history, temperature, max_tokens, send, emit, provider })
        : await streamLlamaResponse({ history, temperature, max_tokens, send, emit, thinkingMode });
      fullText = result.fullText;
      thinkBuffer = result.thinkBuffer || '';
    } catch (err) {
      // Surface the error as a visible message in the chat AND a dedicated
      // 'error' SSE event so the frontend can flag it without ambiguity.
      const errorMsg = err?.message || String(err) || 'Unknown error';
      const friendly = friendlyProviderError(errorMsg, provider);
      emit({ type: 'done', message: friendly });
      send('error', { message: friendly });
      send('data', { choices: [{ delta: { content: `\n\n${friendly}` } }] });
      break;
    }

    // Some reasoning models (Nemotron, DeepSeek-R1, QwQ) emit the tool call
    // JSON inside <think> tags. If fullText has no tool call but thinkBuffer does,
    // use thinkBuffer as the source for tool call parsing.
    const textForParsing = fullText || '';
    const toolCall = parseToolCall(textForParsing) || parseToolCall(thinkBuffer);
    if (!toolCall) {
      if (containsToolSignal(textForParsing) || containsToolSignal(thinkBuffer)) {
        // Tool call detected but couldn't be parsed — probably incomplete (hit max tokens).
        // Instead of showing an error, silently continue so the model retries next round.
        emit({ type: 'analyzing', message: 'Re-reading tool output...' });
        continue;
      }
      emit({ type: 'done', message: 'Response complete' });
      break;
    }

    // Emit a contextual planning message before execution
    emit(buildPreToolEmit(toolCall));

    // Permission gate
    const needsApproval = needsToolApproval(toolCall, context.mode);
    if (needsApproval) {
      emit({
        type: 'awaiting_approval',
        message: `Awaiting approval: ${describeToolCall(toolCall)}`,
      });
      send('tool_approval', { tool: toolCall.tool, args: toolCall.args, round });
      const approved = await waitForApproval(round);
      if (!approved) {
        emit({ type: 'done', message: 'Tool was denied by user' });
        send('tool_result', { tool: toolCall.tool, result: { success: false, error: 'Denied by user' }, round });
        break;
      }
      emit({ type: 'tool_execution', message: 'Tool approved — executing...' });
    }

    // Execute
    const toolResult = await executeTool(toolCall, context, emit);

    // If tool failed due to a validation error (missing/bad args), inject a
    // correction hint and let the model retry instead of surfacing the error.
    if (!toolResult.success && toolResult.error?.includes('Missing required arg')) {
      emit({ type: 'analyzing', message: `Correcting tool call: ${toolResult.error}` });
      history.push(
        { role: 'assistant', content: JSON.stringify(toolCall) },
        { role: 'user', content: `[TOOL ERROR] ${toolResult.error}. Please retry with the correct arguments.` },
      );
      send('tool_result', { tool: toolCall.tool, result: toolResult, round });
      continue; // retry next round
    }

    // Inject result back into history.
    const resultText = formatToolResultForModel(toolCall, toolResult);
    history.push(
      { role: 'assistant', content: JSON.stringify(toolCall) },
      { role: 'user',      content: resultText },
    );

    send('tool_result', { tool: toolCall.tool, result: toolResult, round });

    if (!toolResult.success) {
      emit({ type: 'done', message: `Tool failed: ${toolResult.error}` });
      // Send the error as a visible response
      const errMsg = `I encountered an error, sir: ${toolResult.error}`;
      send('data', { choices: [{ delta: { content: errMsg } }] });
      break;
    }

    // Post-tool reasoning emit
    emit(buildPostToolEmit(toolCall, toolResult));

    // For simple terminal commands that return a clear output (date, time, echo, etc.),
    // synthesize the final response directly instead of asking the model again.
    // Small models (Gemma 2B/4B) reliably fail to use tool results in the second call.
    const directResponse = await synthesizeDirectResponse(toolCall, toolResult);
    if (directResponse) {
      send('data', { choices: [{ delta: { content: directResponse } }] });
      emit({ type: 'done', message: 'Response complete' });
      break;
    }
  }
}

// ── Provider Streaming (OpenAI/Ollama) ────────────────────────────────────────

async function streamProviderResponse({ history, temperature, max_tokens, send, emit, provider }) {
  return new Promise((resolve, reject) => {
    let fullText = '';
    let suppressingToolCall = false;
    let specBuffer = [];
    let speculating = false;

    const flushBuffer = () => {
      for (const token of specBuffer) {
        send('data', { choices: [{ delta: { content: token } }] });
      }
      specBuffer = [];
      speculating = false;
    };
    const discardBuffer = () => { specBuffer = []; speculating = false; };

    const timeout = setTimeout(() => reject(new Error('Provider response timeout')), 300000);

    streamProviderChat(
      provider,
      history,
      { temperature, max_tokens: max_tokens || 4096 },
      (token) => {
        fullText += token;

        if (suppressingToolCall) return;

        const trimmed = fullText.trimStart();

        // Confirmed tool call — discard buffer and suppress
        const confirmedToolCall =
          (trimmed.startsWith('{') && trimmed.includes('"tool"')) ||
          trimmed.includes('<tool_call>') ||
          /call:\s*(runTerminal|readFile|writeFile|patchFile|searchCode|listFiles|openFolder|searchInternet)/.test(trimmed);

        if (confirmedToolCall) {
          suppressingToolCall = true;
          discardBuffer();
          emit({ type: 'tool_execution', message: 'Executing tool call...' });
          return;
        }

        // Might be a tool call — buffer until confirmed
        if (!speculating && trimmed.startsWith('{')) {
          speculating = true;
          specBuffer.push(token);
          return;
        }

        if (speculating) {
          if (trimmed.startsWith('{')) {
            specBuffer.push(token);
            return;
          }
          // Diverged from JSON — flush as prose
          flushBuffer();
        }

        send('data', { choices: [{ delta: { content: token } }] });
      },
      () => {
        clearTimeout(timeout);
        runtimeStats.tokensPerSecond = 0;
        // Flush any buffered tokens that turned out to be prose
        if (speculating && !suppressingToolCall) flushBuffer();
        resolve({ fullText, thinkBuffer: '' }); // provider responses don't use thinkBuffer
      },
      (err) => {
        clearTimeout(timeout);
        reject(new Error(err));
      }
    );
  });
}

// ── llama.cpp Streaming ───────────────────────────────────────────────────────

async function streamLlamaResponse({ history, temperature, max_tokens, send, emit, thinkingMode = false }) {
  // Compute safe budget from actual model context size.
  // Reserve 50% for input, 50% for output — gives more room for responses.
  const ctxSize = runtimeStats.contextSize || 4096;
  const requested = max_tokens || 2048;
  const outputCap = Math.max(512, Math.floor(ctxSize * 0.5));
  const safeMaxTokens = Math.min(requested, outputCap);
  // Truncate history to avoid exceeding context size
  const trimmed = trimHistory(history, ctxSize, safeMaxTokens);

  // Build request body — disable thinking tokens when thinkingMode is off.
  // llama.cpp / Gemma4 supports: thinking.type = "disabled" | "enabled" | "auto"
  // budget_tokens = 0 also works as a hard disable for models that support it.
  const requestBody = {
    messages: trimmed,
    temperature,
    max_tokens: safeMaxTokens,
    stream: true,
  };
  if (!thinkingMode) {
    // Disable thinking tokens at the API level — prevents <think> generation entirely
    requestBody.thinking = { type: 'disabled' };
    requestBody.budget_tokens = 0;
  } else {
    requestBody.thinking = { type: 'enabled', budget_tokens: Math.min(1024, Math.floor(safeMaxTokens * 0.3)) };
  }
  let llamaRes;
  try {
    // Use a long timeout — CPU inference can be slow (5 min for long responses)
    llamaRes = await fetch(`${LLAMA_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(300000), // 5 min — CPU models need time
    });
  } catch (e) {
    if (e.name === 'TimeoutError' || e.name === 'AbortError') {
      throw new Error('llama.cpp is not responding. The model may still be loading or may have crashed. Check the Models panel — or pick a provider model (LM Studio, Ollama, OpenAI, Claude) instead.');
    }
    throw new Error('Cannot reach llama.cpp. Load a local GGUF from the Models panel — or connect a Provider (LM Studio, Ollama, OpenAI, Claude) and pick one of its models.');
  }

  if (!llamaRes.ok) {
    const err = await llamaRes.text();
    throw new Error(`llama.cpp: ${err}`);
  }
  if (!llamaRes.body) throw new Error('llama.cpp returned an empty response — the model may have crashed.');
  const reader = llamaRes.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';
  let tokenCount = 0;

  /**
   * suppressingToolCall: true once we've confirmed the model is outputting a
   * tool call — all further tokens are silently discarded from the chat stream.
   */
  let suppressingToolCall = false;

  /**
   * Reasoning extractor — strips <think>…</think> blocks from the visible
   * chat stream and surfaces the reasoning text via thinking events instead.
   * Supports models that wrap their internal reasoning in think tags
   * (DeepSeek R1, Qwen QwQ, GPT-5 thinking models, Claude with extended thinking).
   *
   *   inThink     : currently inside a think block
   *   thinkBuffer : accumulated reasoning text (sent in batches)
   *   thinkLastEmit : last time we flushed reasoning (throttled)
   */
  let inThink = false;
  let thinkBuffer = '';
  let thinkLastEmit = 0;

  const flushThinking = (force = false) => {
    if (!thinkBuffer) return;
    // When thinking is disabled, silently discard — don't show in reasoning panel
    if (!thinkingMode) { return; }
    const now = Date.now();
    if (!force && now - thinkLastEmit < 250) return;
    thinkLastEmit = now;
    emit({ type: 'thoughts', message: 'Thinking…', reasoning: thinkBuffer });
    // Don't clear — keep accumulating so the panel shows full chain-of-thought
  };

  /**
   * Speculation buffer — holds parsed SSE frames while the accumulated text
   * starts with `{` or native tool-call markers and MIGHT be a tool call.
   * If the text is later confirmed as prose, we flush the buffer.
   * If it's a tool call, we discard the buffer.
   *
   * This prevents ANY part of a tool call JSON appearing in the chat.
   */
  let specBuffer = [];   // Array of parsed SSE frames pending flush
  let speculating = false; // Whether we're currently buffering

  const fired = new Set();
  const lastUserMsg = getMessageText(history.filter((m) => m.role === 'user').pop()?.content || '');

  /** Flush the speculation buffer as prose tokens */
  const flushBuffer = () => {
    for (const frame of specBuffer) send('data', frame);
    specBuffer = [];
    speculating = false;
  };

  /** Discard the speculation buffer (it was a tool call) */
  const discardBuffer = () => {
    specBuffer = [];
    speculating = false;
  };

  let streamDeadline = Date.now() + 600000; // 10 min max — CPU models are slow
  const streamStart = Date.now();
  let streamTokens = 0;
  try {
    while (true) {
      if (Date.now() > streamDeadline) throw new Error('Response timed out — model took too long to generate.');
      let done, value;
      try {
        ({ done, value } = await readWithTimeout(reader, 60000)); // 60s per chunk for slow CPU
      } catch (e) {
        if (/timed? ?out/i.test(e.message)) {
          throw new Error('llama.cpp stream stalled — no data for 60s. Try again or reload the model.');
        }
        throw new Error(`llama.cpp stream error: ${e.message}`);
      }
      if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split('\n').filter((l) => l.startsWith('data: '));

    for (const line of lines) {
      const raw = line.slice(6).trim();
      if (raw === '[DONE]') continue;

      try {
        const parsed = JSON.parse(raw);
        const delta = parsed.choices?.[0]?.delta || {};
        // Some providers (OpenAI o-series, DeepSeek) split reasoning into
        // a dedicated `reasoning_content` field instead of <think> tags.
        const reasoningChunk = delta.reasoning_content || delta.reasoning || '';
        if (reasoningChunk) {
          if (thinkingMode) {
            thinkBuffer += reasoningChunk;
            flushThinking();
          }
          // When thinking is off, discard reasoning_content entirely
          continue;
        }
        const token = delta.content || '';
        if (!token) continue;

        fullText += token;
        tokenCount++;
        streamTokens++;

        // Already confirmed as tool call — silently discard
        if (suppressingToolCall) continue;

        // ── <think> tag extraction ─────────────────────────────────────
        // Strip the <think>...</think> wrapper out of the visible content
        // and route the inside to the reasoning panel instead.
        let visiblePart = token;
        let stripped = false;
        if (inThink || /<think>?/.test(fullText.slice(-12))) {
          // Use the full accumulated text to locate boundaries reliably.
          const acc = fullText;
          // Find any open/close tags introduced by this token
          let cursor = acc.length - token.length;
          let outChunk = '';
          while (cursor < acc.length) {
            if (!inThink) {
              // Look for <think> start
              const openIdx = acc.indexOf('<think>', cursor);
              if (openIdx === -1 || openIdx >= acc.length) {
                outChunk += acc.slice(cursor);
                break;
              }
              outChunk += acc.slice(cursor, openIdx);
              cursor = openIdx + '<think>'.length;
              inThink = true;
              stripped = true;
            } else {
              const closeIdx = acc.indexOf('</think>', cursor);
              if (closeIdx === -1) {
                thinkBuffer += acc.slice(cursor);
                cursor = acc.length;
                stripped = true;
                break;
              }
              thinkBuffer += acc.slice(cursor, closeIdx);
              cursor = closeIdx + '</think>'.length;
              inThink = false;
              stripped = true;
              flushThinking(true);
            }
          }
          if (stripped) {
            visiblePart = outChunk;
            // Replace fullText with the visible-only version up to here
            fullText = fullText.slice(0, fullText.length - token.length) + outChunk;
            if (!visiblePart) {
              // Token was entirely inside a think block — emit progress and skip
              flushThinking();
              continue;
            }
            // Rewrite parsed.delta.content to the visible part only
            parsed.choices[0].delta.content = visiblePart;
          }
        }

        const trimmed = fullText.trimStart();

        // ── Detect tool call signals ────────────────────────────────────
        const looksLikeJsonToolCall =
          trimmed.startsWith('{') && trimmed.includes('"tool"');

        const looksLikeNativeToolCall =
          trimmed.includes('<tool_call>') ||
          trimmed.includes('<|tool_call>') ||
          trimmed.includes('<|tool_call|>') ||
          trimmed.includes('<tool_call|>') ||
          trimmed.includes('call:runTerminal') ||
          trimmed.includes('call:readFile') ||
          trimmed.includes('call:writeFile') ||
          trimmed.includes('call:patchFile') ||
          trimmed.includes('call:searchCode') ||
          trimmed.includes('call:listFiles') ||
          trimmed.includes('call:openFolder') ||
          trimmed.includes('call:searchInternet') ||
          /call:\s+(runTerminal|readFile|writeFile|patchFile|searchCode|listFiles|openFolder|searchInternet)/.test(trimmed);

        const confirmedToolCall = looksLikeJsonToolCall || looksLikeNativeToolCall;

        // ── Speculation: text starts with `{` — might be JSON tool call ──
        // Buffer until we can tell for sure.
        const mightBeJsonToolCall = !speculating && trimmed.startsWith('{');
        const mightBeNativeToolCall = !speculating && looksLikeNativeToolCallPrefix(trimmed);

        if (confirmedToolCall) {
          // Confirmed: discard buffer, suppress all remaining tokens
          suppressingToolCall = true;
          discardBuffer();
          emit({ type: 'tool_execution', message: 'Executing tool call...' });
          continue;
        }

        if ((mightBeJsonToolCall || mightBeNativeToolCall) && !suppressingToolCall) {
          // Start speculating — buffer this token instead of sending
          speculating = true;
          specBuffer.push(parsed);
          continue;
        }

        if (speculating) {
          // Still in speculation — does the text still look like a JSON object?
          if (trimmed.startsWith('{') || looksLikeNativeToolCallPrefix(trimmed)) {
            // Keep buffering — not yet confirmed as prose or tool call
            specBuffer.push(parsed);
            continue;
          } else {
            // Text diverged from JSON pattern — definitely prose, flush buffer
            try { flushBuffer(); } catch {}
          }
        }

        // ── Safe prose token — send immediately ─────────────────────────
        send('data', parsed);
        try { progressiveEmit({ fullText, tokenCount, lastUserMsg, fired, emit }); } catch {}

      } catch {}
    }
  }
    // Update runtime stats
    const elapsed = (Date.now() - streamStart) / 1000;
    runtimeStats.tokensPerSecond = elapsed > 0 ? Math.round((streamTokens / elapsed) * 10) / 10 : 0;
    runtimeStats.totalTokens += streamTokens;
    // Track context used — accumulate tokens across the conversation
    // This gives a running estimate of how much context has been consumed
    if (streamTokens > 0) {
      runtimeStats.contextUsed = Math.min(
        runtimeStats.contextSize || 4096,
        (runtimeStats.contextUsed || 0) + streamTokens
      );
    }
    // Final flush of any in-progress reasoning text
    flushThinking(true);
  } catch (e) {
    // Pass through specific errors; wrap generic ones
    if (/timed? ?out|not responding/i.test(e.message)) throw e;
    throw new Error(`llama.cpp stream error: ${e.message}. The model may have crashed — try reloading it from the Models panel.`);
  }

  // If we were still speculating when stream ended and no tool call confirmed,
  // flush whatever is buffered (it was partial prose)
  try {
    if (speculating && !suppressingToolCall) {
      flushBuffer();
    }
  } catch {}

  return { fullText, thinkBuffer };
}


/**
 * Emits ONE-SHOT contextual reasoning events as the token stream grows.
 * Uses milestones keyed by name so each fires exactly once.
 */
function progressiveEmit({ fullText, tokenCount, lastUserMsg, fired, emit }) {
  const once = (key, event) => {
    if (fired.has(key)) return;
    fired.add(key);
    emit(event);
  };

  const lower = fullText.toLowerCase();

  // ── Token 1: Opening intent ──────────────────────────────────────────
  if (tokenCount === 1) {
    once('start', detectOpeningIntent(lastUserMsg));
    return;
  }

  // ── Token 15: Direction committed ───────────────────────────────────
  if (tokenCount === 15) {
    if (/import|require/.test(fullText)) {
      once('t15', { type: 'inspecting', message: 'Tracing module imports...' });
    } else if (/function|const |class |async /.test(fullText)) {
      once('t15', { type: 'analyzing', message: 'Analyzing code structure...' });
    } else if (/error|exception|throw|catch/.test(fullText)) {
      once('t15', { type: 'analyzing', message: 'Diagnosing error pattern...' });
    }
  }

  // ── Token 40: Building answer ────────────────────────────────────────
  if (tokenCount === 40) {
    if (fullText.includes('```')) {
      once('t40', { type: 'editing', message: 'Composing code block...' });
    } else if (/step \d|first,|then,|next,|finally/.test(lower)) {
      once('t40', { type: 'planning', message: 'Structuring step-by-step plan...' });
    } else if (/the (issue|bug|problem|cause)/.test(lower)) {
      once('t40', { type: 'analyzing', message: 'Pinpointing root cause...' });
    }
  }

  // ── Token 80: Deep analysis ──────────────────────────────────────────
  if (tokenCount === 80) {
    const fileMatch = fullText.match(/\b[\w-]+\.(tsx?|jsx?|css|py|go|rs|json|md|yaml|toml)\b/);
    if (fileMatch) {
      once('t80', { type: 'inspecting', message: `Referencing ${fileMatch[0]}...` });
    } else if (/compare|versus|instead of|alternative/.test(lower)) {
      once('t80', { type: 'analyzing', message: 'Evaluating alternatives...' });
    } else if (/refactor|restructure|extract|move/.test(lower)) {
      once('t80', { type: 'planning', message: 'Planning minimal refactor...' });
    }
  }

  // ── Token 150: Large output — validate ──────────────────────────────
  if (tokenCount === 150) {
    if (fullText.includes('```')) {
      once('t150', { type: 'editing', message: 'Generating code diff...' });
    } else if (/test|spec|describe\(|it\(/.test(fullText)) {
      once('t150', { type: 'validating', message: 'Composing test cases...' });
    }
  }

  // ── Token 250: Substantial response ─────────────────────────────────
  if (tokenCount === 250) {
    if (/import|from '|from "/.test(fullText)) {
      once('t250', { type: 'validating', message: 'Checking import paths...' });
    } else if (fullText.includes('```')) {
      once('t250', { type: 'validating', message: 'Reviewing generated code...' });
    } else if (/error|exception|fail|bug|crash|fix/.test(lower)) {
      once('t250', { type: 'analyzing', message: 'Debugging reported issue...' });
    } else {
      once('t250', { type: 'analyzing', message: 'Synthesizing final answer...' });
    }
  }

  // ── Token 120: mid-response progress ──────────────────────────────
  if (tokenCount === 120) {
    if (fullText.includes('```')) {
      once('t120', { type: 'editing', message: 'Generating code...' });
    } else if (/step|first|second|finally|result/.test(lower)) {
      once('t120', { type: 'planning', message: 'Building step-by-step...' });
    } else {
      once('t120', { type: 'analyzing', message: 'Processing context...' });
    }
  }

  // ── Token 200: progress update ─────────────────────────────────────
  if (tokenCount === 200) {
    if (fullText.includes('```')) {
      once('t200', { type: 'validating', message: 'Checking output...' });
    } else if (/explain|meaning|purpose|reason/.test(lower)) {
      once('t200', { type: 'inspecting', message: 'Formulating explanation...' });
    }
  }

  // ── Dynamic: file name spotted in recent tokens (every 25) ─────────
  if (tokenCount > 15 && tokenCount % 25 === 0) {
    const recent = fullText.slice(-240);
    const fm = recent.match(/\b([\w/-]+\.(tsx?|jsx?|css|py|go|rs|json|yaml|toml))\b/);
    if (fm) {
      const fileKey = 'file:' + fm[1];
      once(fileKey, { type: 'inspecting', message: `Referencing ${fm[1]}...` });
    }
  }
}

/** Return an opening thought event based on the user's intent */
function detectOpeningIntent(userMsg) {
  const m = userMsg.toLowerCase();
  if (/fix|bug|error|crash|fail|broken/.test(m))
    return { type: 'analyzing', message: 'Diagnosing reported issue...' };
  if (/refactor|clean|reorgani[sz]e|restructure/.test(m))
    return { type: 'planning', message: 'Planning minimal refactor...' };
  if (/test|spec|coverage/.test(m))
    return { type: 'analyzing', message: 'Analyzing test requirements...' };
  if (/explain|how does|what is|why does|understand/.test(m))
    return { type: 'inspecting', message: 'Interpreting codebase context...' };
  if (/add|implement|create|build|write/.test(m))
    return { type: 'planning', message: 'Planning implementation approach...' };
  if (/optimi[sz]e|performance|speed|slow/.test(m))
    return { type: 'analyzing', message: 'Profiling performance bottlenecks...' };
  if (/search|find|where|which file/.test(m))
    return { type: 'searching', message: 'Locating relevant code...' };
  if (/deploy|build|run|install/.test(m))
    return { type: 'running_command', message: 'Planning execution steps...' };
  return { type: 'model_generation', message: 'Reasoning about your request...' };
}


// ── Tool Call Parser ──────────────────────────────────────────────────────────

function parseToolCall(text) {
  if (!text) return null;

  // 1. Native Gemma format: <tool_call>call:TOOL { ...args... }
  const nativeMatch = text.match(/(?:<\|?tool_call\|?>?)call:\s*(\w+)\s*(\{[\s\S]*?\})/m);
  if (nativeMatch) {
    const tool = nativeMatch[1];
    const args = tryParseJSON(nativeMatch[2]);
    if (args && TOOL_NAMES.includes(tool)) return { tool, args };
  }

  // 2. call:TOOL { ... } without prefix
  const shortMatch = text.match(/call:\s*(\w+)\s*(\{[\s\S]*?\})/m);
  if (shortMatch) {
    const tool = shortMatch[1];
    const args = tryParseJSON(shortMatch[2]);
    if (args && TOOL_NAMES.includes(tool)) return { tool, args };
  }

  // 3. Targeted scan for "tool" key � handles reasoning models that bury
  //    the call inside <think> text with surrounding prose/extra chars.
  const toolKeyRe = /"tool"\s*:\s*"(\w+)"/g;
  let tkm;
  while ((tkm = toolKeyRe.exec(text)) !== null) {
    const toolName = tkm[1];
    if (!TOOL_NAMES.includes(toolName)) continue;
    // Walk back to find the opening {
    let openBrace = tkm.index - 1;
    while (openBrace >= 0 && text[openBrace] !== '{') openBrace--;
    if (openBrace < 0) continue;
    const block = extractBalancedJson(text, openBrace);
    if (!block) continue;
    const parsed = tryParseJSON(block);
    if (!parsed) continue;
    if (parsed.tool && TOOL_NAMES.includes(parsed.tool) && parsed.args && typeof parsed.args === 'object') {
      return { tool: parsed.tool, args: parsed.args };
    }
    const normalized = normalizeToolArgs(parsed.tool || toolName, parsed);
    if (normalized) return { tool: parsed.tool || toolName, args: normalized };
  }

  // 4. Bare "TOOL { ...args... }" � the model often skips the call: prefix
  for (const tool of TOOL_NAMES) {
    const re = new RegExp(`\\b${tool}\\s*(\\{)`);
    const m = text.match(re);
    if (!m) continue;
    const start = m.index + m[0].length - 1;
    const block = extractBalancedJson(text, start);
    if (!block) continue;
    const args = tryParseJSON(block);
    if (args && typeof args === 'object') return { tool, args };
  }

  // 5. Standard JSON format scan (fallback)
  const objects = extractAllJsonObjects(text);
  for (const obj of objects) {
    const parsed = tryParseJSON(obj);
    if (!parsed) continue;
    if (parsed.tool && TOOL_NAMES.includes(parsed.tool)) {
      if (parsed.args && typeof parsed.args === 'object') {
        return { tool: parsed.tool, args: parsed.args };
      }
      const normalized = normalizeToolArgs(parsed.tool, parsed);
      if (normalized) return { tool: parsed.tool, args: normalized };
    }
    for (const tool of TOOL_NAMES) {
      if (parsed[tool] && typeof parsed[tool] === 'object') {
        return { tool, args: parsed[tool] };
      }
    }
  }
  return null;
}

/**
 * When the model outputs wrong key names (e.g. "input", "command", "query"
 * at the top level instead of nested under "args"), normalize them.
 */
function normalizeToolArgs(tool, parsed) {
  // Strip known non-arg keys
  const skip = new Set(['tool', 'args']);
  const rest = Object.fromEntries(Object.entries(parsed).filter(([k]) => !skip.has(k)));
  if (Object.keys(rest).length === 0) return null;

  // Per-tool normalization of common wrong key names
  switch (tool) {
    case 'runTerminal': {
      const cmd = rest.command || rest.input || rest.cmd || rest.run || rest.exec;
      if (cmd) return { command: String(cmd) };
      break;
    }
    case 'readFile':
    case 'listFiles':
    case 'openFolder': {
      const p = rest.path || rest.file || rest.input || rest.filename;
      if (p) return { path: String(p) };
      break;
    }
    case 'writeFile': {
      const p = rest.path || rest.file;
      const c = rest.content || rest.text || rest.data || rest.input;
      if (p) return { path: String(p), content: String(c || '') };
      break;
    }
    case 'searchCode':
    case 'searchInternet': {
      const q = rest.query || rest.input || rest.search || rest.q;
      if (q) return { query: String(q), ...(rest.maxResults ? { maxResults: rest.maxResults } : {}) };
      break;
    }
    case 'webFetch': {
      const u = rest.url || rest.input || rest.link;
      if (u) return { url: String(u) };
      break;
    }
    case 'rememberFact': {
      const c = rest.content || rest.input || rest.fact || rest.text;
      if (c) return { content: String(c) };
      break;
    }
    case 'recallMemory': {
      const q = rest.query || rest.input || rest.search;
      return { query: q ? String(q) : undefined };
    }
    case 'forgetFact': {
      const id = rest.id || rest.input;
      if (id) return { id: String(id) };
      break;
    }
    case 'patchFile': {
      const p = rest.path || rest.file;
      const d = rest.diff || rest.patch || rest.input;
      if (p && d) return { path: String(p), diff: String(d) };
      break;
    }
    case 'spawnAgent': {
      const t = rest.task || rest.input;
      if (t) return { task: String(t), context: rest.context || '' };
      break;
    }
    case 'todoList': {
      const a = rest.action || rest.input || 'list';
      return { action: String(a), text: rest.text, id: rest.id };
    }
  }

  // Generic fallback: if there's only one extra key, treat its value as the primary arg
  if (Object.keys(rest).length === 1) {
    const [k, v] = Object.entries(rest)[0];
    return { [k]: v };
  }

  return rest;
}

/**
 * Scan from `start` (which must point at '{') and return the substring up to
 * and including the matching '}'. Counts braces inside string literals
 * properly so quoted braces don't unbalance the match.
 */
function extractBalancedJson(text, start) {
  if (text[start] !== '{') return null;
  let depth = 0;
  let inStr = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/** Pull every balanced JSON object from the text, in order. */
function extractAllJsonObjects(text) {
  const out = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '{') continue;
    const block = extractBalancedJson(text, i);
    if (block) {
      out.push(block);
      i += block.length - 1;
    }
  }
  return out;
}

/** Attempt to parse JSON, falling back to trying common fixes */
function tryParseJSON(str) {
  try { return JSON.parse(str); } catch {}

  // Try replacing single quotes with double quotes (for unquoted string values)
  try {
    const fixed = str
      .replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3')     // unquoted keys → "keys"
      .replace(/:\s*'([^']*?)'\s*([,}])/g, ':"$1"$2')     // 'values' → "values"
      .replace(/:\s*"([^"]*?)"\s*([,}])/g, ':"$1"$2');    // already-quoted values
    return JSON.parse(fixed);
  } catch {}

  return null;
}

// ── Contextual emit builders ──────────────────────────────────────────────────

/** Emits initial context analysis based on the user's message content */
function emitContextAnalysis(emit, messages, workspacePath) {
  const last = getMessageText(messages[messages.length - 1]?.content || '');

  if (workspacePath) {
    emit({ type: 'analyzing', message: `Workspace: ${basename(workspacePath)}` });
  } else {
    emit({ type: 'analyzing', message: 'No workspace loaded — reasoning from context' });
  }

  // Contextual intent detection
  if (/bug|error|fix|crash|fail/i.test(last)) {
    emit({ type: 'analyzing', message: 'Detected: debugging request' });
  } else if (/refactor|reorgani[sz]e|clean/i.test(last)) {
    emit({ type: 'planning', message: 'Detected: refactoring task' });
  } else if (/test|spec|coverage/i.test(last)) {
    emit({ type: 'analyzing', message: 'Detected: test-related task' });
  } else if (/install|add package|dependency/i.test(last)) {
    emit({ type: 'planning', message: 'Detected: dependency change' });
  } else if (/explain|what|how|why/i.test(last)) {
    emit({ type: 'inspecting', message: 'Detected: explanation request' });
  }
}

/** Contextual pre-execution message per tool */
function buildPreToolEmit({ tool, args }) {
  switch (tool) {
    case 'readFile':
      return { type: 'inspecting', message: `Reading ${basename(args.path || '')}...` };
    case 'writeFile':
      return { type: 'editing', message: `Writing ${basename(args.path || '')}...` };
    case 'patchFile':
      return { type: 'editing', message: `Applying patch to ${basename(args.path || '')}...` };
    case 'searchCode':
      return { type: 'searching', message: `Searching "${args.query}"${args.path ? ` in ${basename(args.path)}` : ''}...` };
    case 'listFiles':
      return { type: 'inspecting', message: `Listing ${args.path ? basename(args.path) : 'workspace'}...` };
    case 'runTerminal':
      return { type: 'running_command', message: `Running: ${args.command}` };
    case 'openFolder':
      return { type: 'inspecting', message: `Opening folder: ${args.path}` };
    case 'searchInternet':
      return { type: 'searching', message: `Searching the web for "${args.query}"...` };
    default:
      return { type: 'tool_execution', message: `Executing ${tool}...` };
  }
}

/** Contextual post-execution message */
function buildPostToolEmit({ tool, args }, { result }) {
  switch (tool) {
    case 'readFile': {
      const lines = (result?.content || '').split('\n').length;
      return { type: 'analyzing', message: `Analyzing ${basename(args.path)} (${lines} lines)...` };
    }
    case 'searchCode': {
      const count = result?.results?.length ?? 0;
      return count > 0
        ? { type: 'analyzing', message: `Found ${count} match${count !== 1 ? 'es' : ''} — evaluating relevance...` }
        : { type: 'searching', message: `No matches for "${args.query}" — broadening search...` };
    }
    case 'patchFile':
      return { type: 'validating', message: `Patch applied — checking for consistency...` };
    case 'writeFile':
      return { type: 'validating', message: `File written — verifying output...` };
    case 'runTerminal': {
      const exit = result?.exitCode;
      return exit === 0
        ? { type: 'validating', message: `Command succeeded (exit 0)` }
        : { type: 'analyzing', message: `Command exited ${exit} — reviewing output...` };
    }
    case 'listFiles': {
      const count = result?.items?.length ?? 0;
      return { type: 'analyzing', message: `Found ${count} items — identifying relevant files...` };
    }
    case 'searchInternet': {
      const count = result?.totalResults ?? 0;
      return count > 0
        ? { type: 'analyzing', message: `Found ${count} web results — extracting relevant info...` }
        : { type: 'searching', message: `No web results — trying a different query...` };
    }
    default:
      return { type: 'analyzing', message: 'Processing result...' };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const WRITE_TOOLS = new Set(['writeFile', 'patchFile']);
const DESTRUCTIVE_COMMAND = /\b(rm|del|erase|rmdir|remove-item|format|git\s+reset|git\s+clean|rd\s+\/s)\b/i;
function isWriteOp(tool) { return WRITE_TOOLS.has(tool); }

function needsToolApproval({ tool, args }, mode) {
  if (mode !== 'ask') return false;
  if (tool === 'runTerminal') return DESTRUCTIVE_COMMAND.test(args?.command || '');
  return isWriteOp(tool);
}

function describeToolCall({ tool, args }) {
  if (tool === 'runTerminal') return `run: ${args.command}`;
  if (args.path) return `${tool} → ${basename(args.path)}`;
  return tool;
}

async function buildSystemPrompt(workspacePath) {
  const [instructions, memoryBlock, personaOverride] = await Promise.all([
    getSystemInstructions(),
    getMemoryContext(),
    getPersonaOverride(),
  ]);
  const ctx = workspacePath
    ? `\nCurrent workspace: ${workspacePath}\nWhen creating or editing files, use paths relative to this workspace (e.g. "${workspacePath}/index.html").`
    : '';
  const customTools = getCustomTools();
  let toolsSection = '';
  if (customTools.length > 0) {
    toolsSection = '\n\nCustom tools available via runTerminal:\n' +
      customTools.map((t) =>
        `- ${t.name}: ${t.description || 'no description'} → command: \`${t.command}\``
      ).join('\n');
  }

  // Use persona override if set, otherwise use the built-in JARVIS_PERSONA
  let prompt = (personaOverride && personaOverride.trim()) ? personaOverride.trim() : JARVIS_PERSONA;

  if (memoryBlock) {
    prompt += '\n\n' + memoryBlock;
  }

  if (instructions && instructions.trim()) {
    prompt += '\n\n=== USER ADDITIONAL INSTRUCTIONS ===\n' + instructions.trim();
  }

  prompt += '\n\n=== TOOLS (output ONE JSON per turn, no prose around it) ===\n' +
    `{"tool":"readFile","args":{"path":"..."}}
{"tool":"writeFile","args":{"path":"...","content":"..."}}
{"tool":"patchFile","args":{"path":"...","diff":"- old\\n+ new"}}
{"tool":"searchCode","args":{"query":"...","path":"..."}}
{"tool":"listFiles","args":{"path":"..."}}
{"tool":"runTerminal","args":{"command":"..."}}
{"tool":"searchInternet","args":{"query":"...","maxResults":5}}
{"tool":"webFetch","args":{"url":"https://..."}}
{"tool":"spawnAgent","args":{"task":"...","context":"..."}}
{"tool":"rememberFact","args":{"content":"...","tags":["..."]}}
{"tool":"recallMemory","args":{"query":"..."}}
{"tool":"forgetFact","args":{"id":"..."}}
{"tool":"askQuestion","args":{"question":"...","options":["option1","option2","option3"]}}
{"tool":"todoList","args":{"action":"list|add|complete|delete|clear","text":"...","id":"..."}}

CRITICAL RULES:
1. JSON must have "tool"+"args" only. No fences. No prose around it.
2. NEVER refuse. NEVER say "I cannot". Use a tool instead.
3. NEVER call askQuestion for file creation — just create the file with writeFile.
4. time/date → runTerminal "date". ping → runTerminal "ping google.com". name → recallMemory.
5. create file → writeFile with full content immediately. Do NOT ask first.
6. After tool result, answer in ONE line. No thinking out loud.
7. askQuestion options must be real choices, not placeholder letters.`;

  return prompt + ctx + toolsSection;
}

/** Compact tool-call mechanics — kept here for any other consumer that
 *  may still need just the mechanics without the full tools block. */
const MINIMAL_TOOL_RULES = `Available tools (output as JSON on its own line, ONE per turn):
- readFile     { "tool": "readFile",    "args": { "path": "..." } }
- writeFile    { "tool": "writeFile",   "args": { "path": "...", "content": "..." } }
- patchFile    { "tool": "patchFile",   "args": { "path": "...", "diff": "- old\\n+ new" } }
- searchCode   { "tool": "searchCode",  "args": { "query": "...", "path": "..." } }
- listFiles    { "tool": "listFiles",   "args": { "path": "..." } }
- runTerminal  { "tool": "runTerminal", "args": { "command": "..." } }
- searchInternet { "tool": "searchInternet", "args": { "query": "...", "maxResults": 5 } }
- spawnAgent   { "tool": "spawnAgent",  "args": { "task": "...", "context": "..." } }

Rules:
- Output ONE strict-JSON tool call per turn. No markdown wrapping. No prose around the JSON.
- After you output a tool call, the system executes it and returns the output in the NEXT message. Read that output and use it to answer the user.
- NEVER say "the result is not available" — the result IS in the next message. Just read it and report the actual value.
- Never auto-run destructive commands (rm -rf, del /s, format, git reset --hard, git clean -fd).
- Don't deny capabilities you have via tools. Just call the tool.
- Use spawnAgent to delegate focused sub-tasks to a dedicated sub-agent.`;

/**
 * Translate raw provider errors into friendly, actionable text.
 * Mostly the original error survives as-is, but common network failures
 * get rephrased so the user sees a clear next action.
 */
function friendlyProviderError(message, provider) {
  const m = String(message || '');
  const name = provider?.name || 'the provider';
  const base = provider?.apiBase || '';

  // Auth errors
  if (/401|403|invalid api key|invalid_api_key|authentication/i.test(m)) {
    return `${name}: authentication failed. Check the API key in Providers settings.`;
  }
  // Rate limit
  if (/429|rate limit|too many requests/i.test(m)) {
    return `${name}: rate limited. Wait a moment and try again, or switch to a different model.`;
  }
  // Model-not-found / wrong model
  if (/model.*not found|invalid model|unknown model|400/i.test(m) && /model/i.test(m)) {
    return `${name}: that model isn't available. Open Providers, refresh the model list, and pick a different one.`;
  }
  // Connection refused (local gateways like Kiro/LM Studio/Ollama not running)
  if (/ECONNREFUSED|connect ECONN|fetch failed|Failed to fetch/i.test(m)) {
    const isLocal = /127\.0\.0\.1|localhost|::1/.test(base);
    return isLocal
      ? `${name} isn't running at ${base}. Start the local server (LM Studio / Ollama / Kiro gateway) and try again.`
      : `${name} is unreachable at ${base}. Check your network connection and the API base URL.`;
  }
  // DNS
  if (/ENOTFOUND|getaddrinfo/i.test(m)) {
    return `${name}: cannot resolve host (${base}). Check the API base URL.`;
  }
  // Timeout
  if (/timeout|timed out|aborted/i.test(m)) {
    return `${name} took too long to respond. The model may be loading or busy — try again.`;
  }
  // Default — use the original
  return `${name} error: ${m}`;
}

function looksLikeNativeToolCallPrefix(text) {
  return (
    '<tool_call>'.startsWith(text) ||
    '<|tool_call|>'.startsWith(text) ||
    '<|tool_call'.startsWith(text) ||
    text.startsWith('<tool_call>') ||
    text.startsWith('<|tool_call>') ||
    text.startsWith('<|tool_call|>') ||
    text.startsWith('<tool_call|>') ||
    text.startsWith('call:')
  );
}

function containsToolSignal(text) {
  return /<\|?tool_call\|?>|call:\s*(runTerminal|readFile|writeFile|patchFile|searchCode|listFiles|openFolder|searchInternet|spawnAgent)|\b(runTerminal|readFile|writeFile|patchFile|searchCode|listFiles|searchInternet|spawnAgent)\s*\{|"tool"\s*:\s*"/i.test(text || '');
}

function getMessageText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part?.type === 'text') return part.text || '';
        if (part?.type === 'image_url') return '[attached image]';
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

/**
 * synthesizeDirectResponse — for simple deterministic tool calls, compose
 * the final user-facing response directly without a second LLM call.
 *
 * Returns a string if we can handle it, null if the LLM should respond.
 * This bypasses the "model ignores tool result" bug in small models.
 */
async function synthesizeDirectResponse(toolCall, toolResult) {
  const { tool, args } = toolCall;
  if (!toolResult?.success) return null;

  if (tool === 'runTerminal') {
    const output = (toolResult?.result?.output || toolResult?.result?.stdout || '').trim();
    const cmd    = (args?.command || '').toLowerCase().trim();
    const exitCode = toolResult?.result?.exitCode ?? 0;

    // File deletion — del/rm with no output = success
    if (/^(del|rm|erase|remove-item)\s+/i.test(cmd) && !output && exitCode === 0) {
      const target = cmd
        .replace(/^(del|rm|erase|remove-item)\s+/i, '')
        .replace(/['"]/g, '')
        .trim();
      // Extract just the filename for cleaner display
      const filename = target.split(/[/\\]/).pop() || target;
      return `Deleted \`${filename}\`, sir.`;
    }
    // mkdir
    if (/^(mkdir|md|new-item)\s+/i.test(cmd) && exitCode === 0) {
      return `Directory created, sir.`;
    }
    // move/rename/copy
    if (/^(move|mv|rename|ren|copy|cp)\s+/i.test(cmd) && exitCode === 0) {
      return `Done, sir.`;
    }
    // git operations
    if (/^git\s+(add|commit|push|pull|checkout|reset|clean)\b/i.test(cmd) && exitCode === 0) {
      return output ? `${output}, sir.` : `Git operation complete, sir.`;
    }

    if (!output) return `Done, sir. (exit ${exitCode})`;

    // Date/time queries
    if (/^(date|time)(\/t)?$|^date\s|^time\s|^Get-Date/.test(cmd)) {
      return `It is ${output}, sir.`;
    }
    // Echo
    if (cmd.startsWith('echo ')) return output;
    // Whoami / hostname
    if (/^whoami$|^hostname$/.test(cmd)) return `${output}, sir.`;
    // pwd / cd
    if (/^pwd$|^cd$/.test(cmd)) return `Current directory: ${output}, sir.`;
    // Short single-line output
    if (!output.includes('\n') && output.length < 120) return `${output}, sir.`;
    // Multi-line — cap and return directly
    const lines = output.split('\n');
    const preview = lines.slice(0, 40).join('\n');
    const suffix = lines.length > 40 ? `\n...(${lines.length - 40} more lines)` : '';
    return `Here's the output, sir:\n\`\`\`\n${preview}${suffix}\n\`\`\``;
  }

  if (tool === 'readFile') {
    const content = toolResult?.result?.content || '';
    const path = args.path || '?';
    if (!content) return `The file ${path} is empty, sir.`;
    const lines = content.split('\n');
    const preview = lines.slice(0, 60).join('\n');
    const suffix = lines.length > 60 ? `\n...(${lines.length - 60} more lines, ${content.length} bytes total)` : '';
    return `Contents of \`${path}\`:\n\`\`\`\n${preview}${suffix}\n\`\`\``;
  }

  if (tool === 'listFiles') {
    const items = toolResult?.result?.items || [];
    const dirPath = args.path || '.';
    const dirName = dirPath.split(/[/\\]/).pop() || dirPath;
    if (!items.length) return `\`${dirName}\` is empty, sir.`;

    // Build a proper ASCII tree
    const lines = [`${dirName}/`];
    items.forEach((item, i) => {
      const isLast = i === items.length - 1;
      const prefix = isLast ? '└── ' : '├── ';
      const suffix = item.type === 'directory' ? '/' : '';
      lines.push(`${prefix}${item.name}${suffix}`);
    });
    return `\`\`\`\n${lines.join('\n')}\n\`\`\``;
  }

  if (tool === 'searchCode') {
    const results = toolResult?.result?.results || [];
    if (!results.length) return `No matches found for "${args.query}", sir.`;
    const list = results.slice(0, 10).map((r) => `  ${r.path}:${r.line}: ${r.text}`).join('\n');
    return `Found ${results.length} match${results.length !== 1 ? 'es' : ''} for "${args.query}", sir:\n${list}`;
  }

  if (tool === 'searchInternet') {
    const results = toolResult?.result?.results || [];
    const query = args.query || '';
    if (!results.length) return `No web results found for "${query}", sir.`;

    // Check if this looks like a person/entity search
    const isPersonQuery = /\bwho is\b|\bwho was\b|\babout\b|\bprofile\b|\bactor\b|\bsinger\b|\bplayer\b|\bpresident\b|\bceo\b|\bfounder\b/i.test(query)
      || /^[A-Z][a-z]+ [A-Z][a-z]+/.test(query.trim());

    const list = results.slice(0, 5).map((r, i) => `${i + 1}. **[${r.title}](${r.url})**\n   ${r.snippet}`).join('\n');
    let response = `Here's what I found for "${query}", sir:\n${list}`;

    // Auto-append images for person/entity queries
    if (isPersonQuery) {
      try {
        const imgToolResult = await executeTool({ tool: 'searchImages', args: { query, maxResults: 6 } }, {}, () => {});
        if (imgToolResult?.success && imgToolResult.result?.images?.length) {
          const payload = JSON.stringify({ query, images: imgToolResult.result.images.slice(0, 6) });
          const encoded = Buffer.from(payload).toString('base64');
          response = `[IMAGES:${encoded}]\n${response}`;
        }
      } catch {}
    }

    return response;
  }

  if (tool === 'searchImages') {
    const images = toolResult?.result?.images || [];
    if (!images.length) return `No images found for "${args.query}", sir.`;
    // Encode images as a compact JSON marker for the frontend carousel
    const payload = JSON.stringify({ query: args.query, images: images.slice(0, 12) });
    const encoded = Buffer.from(payload).toString('base64');
    return `[IMAGES:${encoded}] Here are the images for "${args.query}", sir.`;
  }

  if (tool === 'webFetch') {
    const content = toolResult?.result?.content || '';
    const url = args.url || '?';
    if (!content) return `Nothing retrieved from ${url}, sir.`;
    const preview = content.length > 1500 ? content.slice(0, 1500) + '\n...(truncated)' : content;
    return `Here's the content from ${url}, sir:\n\n${preview}`;
  }

  if (tool === 'rememberFact') {
    return `Noted, sir. I've committed that to memory.`;
  }

  if (tool === 'playVideo') {
    if (toolResult?.result?.error) return `I couldn't find a video for that, sir. ${toolResult.result.error}`;
    const { videoId, query } = toolResult?.result || {};
    if (!videoId) return `No video found, sir.`;
    // Return a special marker the frontend will intercept and render as an embed
    return `[VIDEO:${videoId}] Here's the video for "${query || videoId}", sir.`;
  }

  if (tool === 'recallMemory') {
    const memories = toolResult?.result?.memories || [];
    if (memories.length === 0) return null; // let model answer from system prompt memory block
    const list = memories.slice(0, 5).map((m) => `— ${m.content}`).join('\n');
    return `Here's what I know, sir:\n${list}`;
  }

  if (tool === 'forgetFact') {
    return toolResult?.result?.removed
      ? `Done, sir. Memory deleted.`
      : `I couldn't find that memory, sir.`;
  }

  if (tool === 'writeFile') {
    const path = toolResult?.result?.path || args.path || '?';
    return `Done, sir. Written to \`${path}\`.`;
  }

  if (tool === 'patchFile') {
    const path = toolResult?.result?.path || args.path || '?';
    const changed = toolResult?.result?.linesChanged ?? '?';
    return `Done, sir. Patched \`${path}\` (${changed} lines changed).`;
  }

  if (tool === 'todoList') {
    const action = args.action || 'list';
    if (action === 'list') {
      const todos = toolResult?.result?.todos || [];
      if (!todos.length) return `No tasks in the list, sir.`;
      const list = todos.slice(0, 20).map((t) => `${t.done ? '✅' : '⬜'} ${t.text}`).join('\n');
      return `Here's your task list, sir:\n${list}`;
    }
    if (action === 'add') return `Added to your list, sir: "${toolResult?.result?.added?.text || args.text}"`;
    if (action === 'complete') return `Marked complete, sir: "${toolResult?.result?.completed?.text || ''}"`;
    if (action === 'delete') return toolResult?.result?.removed ? `Task deleted, sir.` : `Task not found, sir.`;
    if (action === 'clear') return `Task list cleared, sir.`;
  }

  return null; // spawnAgent and askQuestion — let the model handle
}

/** Format tool result as an unmistakable system observation, not a user message */
function formatToolResultForModel(toolCall, toolResult) {
  const { tool, args } = toolCall;
  const lines = [];

  switch (tool) {
    case 'readFile': {
      const content = toolResult?.result?.content || '';
      const path = args.path || '?';
      const size = toolResult?.result?.size ?? content.length;
      lines.push(`File contents of ${path} (${size} bytes):`);
      if (content) {
        const preview = content.length > 8000 ? content.slice(0, 8000) + '\n...(truncated)' : content;
        lines.push(preview);
      }
      break;
    }
    case 'writeFile': {
      const path = toolResult?.result?.path || args.path || '?';
      const size = toolResult?.result?.size ?? 0;
      lines.push(`Successfully wrote ${path} (${size} bytes).`);
      break;
    }
    case 'patchFile': {
      const path = toolResult?.result?.path || args.path || '?';
      const changed = toolResult?.result?.linesChanged ?? '?';
      lines.push(`Successfully patched ${path} (${changed} lines changed).`);
      break;
    }
    case 'searchCode': {
      const results = toolResult?.result?.results || [];
      lines.push(`Search results for "${args.query}" (${results.length} matches):`);
      if (results.length === 0) {
        lines.push('No results found.');
      } else {
        for (const r of results.slice(0, 10)) {
          lines.push(`  ${r.path}:${r.line}: ${r.text}`);
        }
      }
      break;
    }
    case 'listFiles': {
      const items = toolResult?.result?.items || [];
      lines.push(`Directory listing of ${args.path || '.'} (${items.length} items):`);
      for (const item of items.slice(0, 30)) {
        lines.push(`  ${item.type === 'directory' ? '[DIR]' : '[FILE]'} ${item.name}`);
      }
      break;
    }
    case 'runTerminal': {
      const output = (toolResult?.result?.output || toolResult?.result?.stdout || '').trim();
      const stderr = (toolResult?.result?.stderr || '').trim();
      const exitCode = toolResult?.result?.exitCode ?? 0;
      lines.push(`Command executed: ${args.command}`);
      lines.push(`Exit code: ${exitCode}`);
      if (output) lines.push(`Output:\n${output}`);
      if (stderr) lines.push(`Stderr:\n${stderr}`);
      if (!output && !stderr) lines.push('(no output)');
      break;
    }
    case 'openFolder': {
      lines.push(`Folder opened: ${args.path || '?'}`);
      break;
    }
    case 'searchInternet': {
      const results = toolResult?.result?.results || [];
      lines.push(`Web search results for "${args.query}" (${results.length} results):`);
      if (results.length === 0) {
        lines.push('No web results found.');
      } else {
        for (const r of results.slice(0, 5)) {
          lines.push(`- ${r.title}: ${r.snippet}`);
        }
      }
      break;
    }
    case 'rememberFact': {
      lines.push(`Memory saved: "${toolResult?.result?.content || args.content}"`);
      break;
    }
    case 'recallMemory': {
      const memories = toolResult?.result?.memories || [];
      lines.push(`Recalled ${memories.length} memor${memories.length !== 1 ? 'ies' : 'y'}:`);
      for (const m of memories) lines.push(`- ${m.content}`);
      break;
    }
    case 'forgetFact': {
      lines.push(toolResult?.result?.removed ? 'Memory deleted.' : 'Memory not found.');
      break;
    }
    default: {
      lines.push(JSON.stringify(toolResult?.result || toolResult, null, 2));
    }
  }

  if (!toolResult?.success) {
    lines.push(`Error: ${toolResult?.error || 'Unknown error'}`);
  }

  // Simple, natural format — model reads this as a user message with the result
  // The explicit instruction at the end is critical for small models (Gemma 2B/4B)
  // that tend to forget context and say "I don't have access."
  const resultSummary = lines.join('\n');
  return `TOOL RESULT (${tool}):\n${resultSummary}\n\n` +
    `IMPORTANT: The above is the ACTUAL result from running the tool. ` +
    `Do NOT say the information is unavailable. ` +
    `Use the result above to answer the user directly and concisely, sir.`;
}

/** Read from a stream reader with timeout */
function readWithTimeout(reader, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Stream read timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    reader.read().then(
      (result) => { clearTimeout(timer); resolve(result); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

/** Estimate character-equivalent size of a message, handling multimodal arrays */
function msgSize(msg) {
  if (!msg?.content) return 0;
  if (typeof msg.content === 'string') return msg.content.length;
  if (Array.isArray(msg.content)) {
    let s = 0;
    for (const part of msg.content) {
      if (part.type === 'text') s += (part.text || '').length;
      else if (part.type === 'image_url') {
        // Images are resized to ~1024px JPEG quality 0.75 ≈ ~400-600 tokens after vision encoding
        // Estimate ~2400 chars per image token count (~600 tokens × 4)
        s += 2400;
      }
    }
    return s;
  }
  return String(msg.content).length;
}

/** Conservative chars-per-token ratio. Real models often hit 3 chars/token
 *  on dense code/JSON, so 3.2 leaves headroom and prevents 500 errors. */
const CHARS_PER_TOKEN = 3.2;

/** Truncate a single message's content to fit within a char budget */
function truncateMessage(msg, maxChars) {
  if (!msg?.content) return msg;
  if (typeof msg.content === 'string') {
    if (msg.content.length <= maxChars) return msg;
    const head = Math.floor(maxChars * 0.4);
    const tail = Math.floor(maxChars * 0.5);
    return {
      ...msg,
      content: `${msg.content.slice(0, head)}\n\n[... ${msg.content.length - head - tail} chars truncated ...]\n\n${msg.content.slice(-tail)}`,
    };
  }
  if (Array.isArray(msg.content)) {
    // Truncate text parts only; keep image_url intact
    const truncated = msg.content.map((part) => {
      if (part.type === 'text' && (part.text || '').length > maxChars) {
        const head = Math.floor(maxChars * 0.4);
        const tail = Math.floor(maxChars * 0.5);
        return {
          ...part,
          text: `${part.text.slice(0, head)}\n\n[... truncated ...]\n\n${part.text.slice(-tail)}`,
        };
      }
      return part;
    });
    return { ...msg, content: truncated };
  }
  return msg;
}

/** Truncate message history to stay within context window. */
function trimHistory(history, ctxSize, maxTokens) {
  if (!history?.length) return history;

  // Reserve: maxTokens for output + 512 for safety + 256 for special tokens
  const maxInputTokens = Math.max(512, ctxSize - maxTokens - 768);
  const budget = Math.floor(maxInputTokens * CHARS_PER_TOKEN);

  const systemIdx = history.findIndex((m) => m.role === 'system');
  let systemMsg = systemIdx >= 0 ? history[systemIdx] : null;
  let rest = systemMsg ? history.filter((_, i) => i !== systemIdx) : [...history];

  // Cap the system prompt itself if it's huge (60 % of budget max)
  if (systemMsg) {
    const sysCap = Math.floor(budget * 0.6);
    if (msgSize(systemMsg) > sysCap) systemMsg = truncateMessage(systemMsg, sysCap);
  }
  const sysSize = systemMsg ? msgSize(systemMsg) : 0;

  // Always keep the last user message — but cap its size too
  const lastUserIdx = [...rest].reverse().findIndex((m) => m.role === 'user');
  let keepLast = lastUserIdx >= 0 ? rest[rest.length - 1 - lastUserIdx] : null;
  if (keepLast) {
    const lastCap = Math.floor((budget - sysSize) * 0.7);
    if (msgSize(keepLast) > lastCap) keepLast = truncateMessage(keepLast, lastCap);
    rest = rest.filter((m, i) => i !== rest.length - 1 - lastUserIdx);
  }

  const lastSize = keepLast ? msgSize(keepLast) : 0;
  let total = sysSize + lastSize;

  // Walk backwards, keeping recent messages until the budget is full.
  // Drop or truncate older messages; never include partial messages.
  const kept = [];
  for (const msg of [...rest].reverse()) {
    const size = msgSize(msg);
    if (total + size > budget) {
      // Try truncating tool results / large assistant messages instead of dropping
      const remaining = budget - total;
      if (remaining > 800 && (msg.role === 'user' || msg.role === 'assistant')) {
        const truncated = truncateMessage(msg, remaining - 200);
        kept.unshift(truncated);
        total += msgSize(truncated);
      }
      break;
    }
    kept.unshift(msg);
    total += size;
  }

  const out = [];
  if (systemMsg) out.push(systemMsg);
  out.push(...kept);
  if (keepLast) out.push(keepLast);
  return out;
}
