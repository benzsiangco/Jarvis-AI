/**
 * Tool Executor — validates + runs all agent tools safely.
 * The model ONLY requests actions. This layer executes them.
 */
import { readFile, writeFile, mkdir, readdir, stat } from 'fs/promises';
import { join, basename, extname, dirname, isAbsolute } from 'path';
import { spawn } from 'child_process';
import { applyPatch } from './patchApply.js';
import { runTerminalCommand } from '../services/terminalCommand.js';
import { runSubAgent } from './subAgent.js';
import {
  saveMemory,
  deleteMemory,
  searchMemories,
  getAllMemories,
} from '../services/memoryService.js';

const IGNORED = new Set(['node_modules', '.git', '.next', 'dist', '__pycache__', '.cache']);

/** Extension → Monaco language map */
const LANG_MAP = {
  js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript',
  py: 'python', rs: 'rust', go: 'go', json: 'json', md: 'markdown',
  html: 'html', css: 'css', yaml: 'yaml', yml: 'yaml', sql: 'sql',
  sh: 'shell', bash: 'shell', toml: 'toml', xml: 'xml',
};

// Tool definitions — name → { schema, handler }
const TOOLS = {
  readFile:       { handler: execReadFile },
  writeFile:      { handler: execWriteFile },
  patchFile:      { handler: execPatchFile },
  searchCode:     { handler: execSearchCode },
  listFiles:      { handler: execListFiles },
  runTerminal:    { handler: execRunTerminal },
  openFolder:     { handler: execOpenFolder },
  searchInternet: { handler: execSearchInternet },
  searchImages:   { handler: execSearchImages },
  webFetch:       { handler: execWebFetch },
  spawnAgent:     { handler: execSpawnAgent },
  rememberFact:   { handler: execRememberFact },
  recallMemory:   { handler: execRecallMemory },
  forgetFact:     { handler: execForgetFact },
  playVideo:      { handler: execPlayVideo },
  askQuestion:    { handler: execAskQuestion },
  todoList:       { handler: execTodoList },
};

/**
 * Execute a parsed tool call.
 * @param {{ tool: string, args: object }} call
 * @param {{ mode: string, workspacePath: string }} context
 * @param {function} emit — SSE emitter for thinking events
 * @returns {Promise<{ success: boolean, result?: any, error?: string }>}
 */
export async function executeTool(call, context, emit) {
  const { tool, args } = call;

  if (!TOOLS[tool]) {
    return { success: false, error: `Unknown tool: ${tool}` };
  }

  // Validate required args
  const validationError = validateArgs(tool, args);
  if (validationError) return { success: false, error: validationError };

  // Permission check
  const permError = checkPermission(tool, args, context);
  if (permError) return { success: false, error: permError };

  emit({ type: toolEventType(tool), message: toolStartMessage(tool, args) });

  try {
    const result = await TOOLS[tool].handler(args, context, emit);
    const doneMsg = toolDoneMessage(tool, args, result);
    emit({ type: 'validating', message: doneMsg });
    return { success: true, result };
  } catch (err) {
    emit({ type: 'done', message: `${tool} failed: ${err.message}` });
    return { success: false, error: err.message };
  }
}

// ── Handlers ────────────────────────────────────────────────────────────────

async function execReadFile({ path }, ctx) {
  const fullPath = resolvePath(path, ctx);
  const content = await readFile(fullPath, 'utf-8');
  const info = await stat(fullPath);
  return { content, size: info.size, path: fullPath };
}

function resolvePath(path, ctx) {
  if (!path) return path;
  if (!isAbsolute(path) && ctx?.workspacePath) {
    return join(ctx.workspacePath, path);
  }
  return path;
}

async function execWriteFile({ path, content }, ctx, emit) {
  const fullPath = resolvePath(path, ctx);
  const dir = dirname(fullPath);
  if (dir && dir !== '.' && dir !== '/') {
    await mkdir(dir, { recursive: true }).catch(() => {});
  }

  // Emit live edit event so the frontend can animate the write
  const ext = extname(fullPath).slice(1);
  emit({ type: 'file_edit_start', path: fullPath, content: content ?? '', language: LANG_MAP[ext] || 'plaintext', editType: 'write' });

  await writeFile(fullPath, content ?? '', 'utf-8');

  emit({ type: 'file_edit_done', path: fullPath });
  return { written: true, path: fullPath, size: (content ?? '').length };
}

async function execPatchFile({ path, diff }, ctx, emit) {
  const fullPath = resolvePath(path, ctx);
  const original = await readFile(fullPath, 'utf-8');
  const patched = applyPatch(original, diff);

  // Emit live edit event so the frontend can animate the patch
  const ext = extname(fullPath).slice(1);
  emit({ type: 'file_edit_start', path: fullPath, content: patched, language: LANG_MAP[ext] || 'plaintext', editType: 'patch' });

  await writeFile(fullPath, patched, 'utf-8');

  emit({ type: 'file_edit_done', path: fullPath });
  return { patched: true, path: fullPath, linesChanged: diff.split('\n').filter((l) => l.startsWith('+') || l.startsWith('-')).length };
}

async function execSearchCode({ query, path: searchPath = '.' }, ctx) {
  const resolvedSearchPath = resolvePath(searchPath, ctx);
  return new Promise((resolve, reject) => {
    const args = ['--json', '--max-count', '5', '--max-filesize', '1M', '-i', '-n', query, resolvedSearchPath];
    const proc = spawn('rg', args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d; });
    proc.stderr.on('data', (d) => { stderr += d; });
    proc.on('close', (code) => {
      if (code > 1) return reject(new Error(stderr || `rg exited ${code}`));
      const results = [];
      for (const line of stdout.split('\n').filter(Boolean)) {
        try {
          const parsed = JSON.parse(line);
          if (parsed.type === 'match' && results.length < 30) {
            results.push({
              path: parsed.data.path?.text,
              line: parsed.data.line_number,
              text: parsed.data.lines?.text?.trim(),
            });
          }
        } catch {}
      }
      resolve({ results, query });
    });
    proc.on('error', reject);
  });
}

async function execListFiles({ path: dirPath = '.' }, ctx) {
  const resolvedDir = resolvePath(dirPath, ctx);
  const entries = await readdir(resolvedDir, { withFileTypes: true });
  const items = entries
    .filter((e) => !IGNORED.has(e.name) && !e.name.startsWith('.'))
    .map((e) => ({ name: e.name, path: join(resolvedDir, e.name), type: e.isDirectory() ? 'directory' : 'file', ext: e.isFile() ? extname(e.name) : null }))
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  return { path: resolvedDir, items };
}

async function execRunTerminal({ command, cwd }, context, emit) {
  const workingDir = cwd || context.workspacePath || process.cwd();
  emit({
    type: 'terminal_start',
    message: `$ ${command}`,
    command,
    cwd: workingDir,
  });
  const result = await runTerminalCommand({
    command,
    cwd: workingDir,
    timeoutMs: 30000,
    onData: (content) => emit({ type: 'terminal_output', message: content, content }),
  });
  emit({
    type: 'terminal_exit',
    message: `[exit code: ${result.exitCode}]`,
    exitCode: result.exitCode,
    command,
  });
  return result;
}

async function execOpenFolder({ path: dirPath }, ctx) {
  const fullPath = resolvePath(dirPath, ctx);
  const info = await stat(fullPath);
  if (!info.isDirectory()) throw new Error(`Not a directory: ${fullPath}`);
  return { opened: true, path: fullPath };
}

async function execSearchInternet({ query, maxResults }, ctx) {
  if (!query) throw new Error('Query is required');
  const count = Math.min(Math.max(Number(maxResults) || 5, 1), 15);
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Gemma4IDE/1.0)' },
    signal: AbortSignal.timeout(15000),
  });
  const html = await res.text();

  // Parse result cards from DuckDuckGo HTML
  const results = [];
  // Match each result block: <a class="result__a" ...>TITLE</a> ... <a class="result__snippet" ...>SNIPPET</a>
  const blockRe = /<a[^>]+class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippetRe = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
  const titles = []; const links = []; let m;
  while ((m = blockRe.exec(html)) !== null && links.length < count) {
    let href = m[1];
    // DuckDuckGo redirect URLs
    if (href.startsWith('//')) href = 'https:' + href;
    if (href.includes('duckduckgo.com/l/?uddg=')) {
      try { href = decodeURIComponent(href.split('uddg=')[1]?.split('&')[0] || href); } catch {}
    }
    links.push(href);
    titles.push(m[2].replace(/<[^>]+>/g, '').trim());
  }
  const snippets = [];
  while ((m = snippetRe.exec(html)) !== null && snippets.length < count) {
    snippets.push(m[1].replace(/<[^>]+>/g, '').trim());
  }
  for (let i = 0; i < Math.min(links.length, count); i++) {
    results.push({
      title: titles[i] || '',
      url: links[i] || '',
      snippet: snippets[i] || '',
    });
  }

  return { query, results, totalResults: results.length };
}

async function execSearchImages({ query, maxResults }, ctx) {
  if (!query) throw new Error('query is required');
  const count = Math.min(Math.max(Number(maxResults) || 8, 1), 20);

  // Strategy 1: Openverse (WordPress Foundation) — free, no key, real photos
  try {
    const url = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(query)}&page_size=${count}&license_type=commercial,modification`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'JarvisAI/1.0 (https://github.com/benzsiangco/Jarvis-AI)' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`Openverse HTTP ${res.status}`);
    const data = await res.json();
    const results = (data.results || []).slice(0, count).map((r) => ({
      url: r.url,
      thumb: r.thumbnail || r.url,
      title: r.title || r.creator || query,
      source: r.foreign_landing_url || r.url,
      width: r.width || null,
      height: r.height || null,
    })).filter((r) => r.url?.startsWith('http'));

    if (results.length >= 3) return { query, images: results, total: results.length, source: 'openverse' };
    throw new Error(`Only ${results.length} results`);
  } catch (openverseErr) {
    // Strategy 2: Wikimedia Commons — encyclopedic images, always reliable
    try {
      const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(query)}&gsrlimit=${count}&prop=imageinfo&iiprop=url|thumburl&iiurlwidth=400&format=json&origin=*`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'JarvisAI/1.0' },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) throw new Error(`Wikimedia HTTP ${res.status}`);
      const data = await res.json();
      const pages = Object.values(data.query?.pages || {});
      const results = pages.slice(0, count).map((p) => {
        const info = p.imageinfo?.[0] || {};
        return {
          url: info.url || '',
          thumb: info.thumburl || info.url || '',
          title: p.title?.replace(/^File:/, '') || query,
          source: `https://commons.wikimedia.org/wiki/${encodeURIComponent(p.title || '')}`,
          width: null,
          height: null,
        };
      }).filter((r) => r.url?.startsWith('http'));

      if (results.length > 0) return { query, images: results, total: results.length, source: 'wikimedia' };
      throw new Error('No Wikimedia results');
    } catch (wikiErr) {
      throw new Error(`Image search failed — Openverse: ${openverseErr.message} | Wikimedia: ${wikiErr.message}`);
    }
  }
}

async function execWebFetch({ url, selector }, ctx) {
  if (!url) throw new Error('url is required');
  // Normalize URL
  const target = url.startsWith('http') ? url : `https://${url}`;
  const res = await fetch(target, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; Gemma4IDE/1.0)',
      'Accept': 'text/html,application/xhtml+xml,text/plain',
    },
    signal: AbortSignal.timeout(20000),
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${target}`);
  const contentType = res.headers.get('content-type') || '';
  const raw = await res.text();

  // Strip HTML tags and collapse whitespace for readability
  let content = raw;
  if (contentType.includes('html')) {
    content = raw
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  // Cap at 8000 chars to avoid blowing the context window
  const MAX = 8000;
  const truncated = content.length > MAX;
  if (truncated) content = content.slice(0, MAX) + '\n...(truncated)';

  return { url: target, content, length: content.length, truncated };
}

// ── Validation ───────────────────────────────────────────────────────────────

function validateArgs(tool, args) {
  const required = {
    readFile:      ['path'],
    writeFile:     ['path', 'content'],
    patchFile:     ['path', 'diff'],
    searchCode:    ['query'],
    listFiles:     [],
    runTerminal:    ['command'],
    openFolder:     ['path'],
    searchInternet: ['query'],
    searchImages:   ['query'],
    webFetch:       ['url'],
    rememberFact:   ['content'],
    recallMemory:   [],
    forgetFact:     ['id'],
    playVideo:      [],
    askQuestion:    ['question', 'options'],
    todoList:       ['action'],
  };
  for (const key of required[tool] || []) {
    if (args[key] === undefined || args[key] === null) {
      return `Missing required arg "${key}" for tool "${tool}"`;
    }
  }
  return null;
}

// ── Permission ───────────────────────────────────────────────────────────────

const DESTRUCTIVE_CMDS = /\b(rm|del|erase|rmdir|remove-item|format|git\s+reset|git\s+clean|rd\s+\/s)\b/i;

function checkPermission(tool, args, { mode = 'ask' }) {
  if (mode === 'full') return null;

  const writingTools = new Set(['writeFile', 'patchFile', 'runTerminal']);
  const isDestructive = tool === 'runTerminal' && DESTRUCTIVE_CMDS.test(args.command || '');

  if (mode === 'workspace') {
    if (isDestructive) return `Destructive command blocked in "workspace" mode: ${args.command}`;
    return null; // writes OK in workspace mode
  }

  // ask mode: block all writes — the chat loop handles approval before calling execute
  if (writingTools.has(tool)) {
    return null; // Permission already approved by the caller (agentLoop checks)
  }
  return null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toolEventType(tool) {
  const map = {
    readFile: 'reading_file', writeFile: 'writing_file', patchFile: 'diff_generation',
    searchCode: 'searching', listFiles: 'searching', runTerminal: 'running_command',
    openFolder: 'tool_execution', searchInternet: 'searching', webFetch: 'searching',
    spawnAgent: 'planning',
    rememberFact: 'tool_execution', recallMemory: 'searching', forgetFact: 'tool_execution',
    askQuestion: 'awaiting_approval', todoList: 'tool_execution',
  };
  return map[tool] || 'tool_execution';
}

function toolStartMessage(tool, args) {
  switch (tool) {
    case 'readFile':     return `Reading ${basename(args.path)}`;
    case 'writeFile':    return `Writing ${basename(args.path)}`;
    case 'patchFile':    return `Patching ${basename(args.path)}`;
    case 'searchCode':   return `Searching for "${args.query}"`;
    case 'listFiles':    return `Listing ${args.path || 'workspace'}`;
    case 'runTerminal':  return `Running: ${args.command}`;
    case 'openFolder':   return `Opening folder ${args.path}`;
    case 'searchInternet':return `Searching the web for "${args.query}"`;
    case 'searchImages':  return `Searching images for "${args.query}"…`;    case 'webFetch':      return `Fetching ${args.url?.slice(0, 60)}…`;    case 'spawnAgent':   return `Spawning sub-agent: ${(args.task || '').slice(0, 60)}…`;
    case 'rememberFact': return `Committing to memory…`;
    case 'recallMemory': return args.query ? `Recalling "${args.query}"` : `Reviewing memory`;
    case 'forgetFact':   return `Forgetting memory ${args.id?.slice(0, 8) || ''}`;
    case 'playVideo':    return args.url ? `Loading video…` : `Searching YouTube for "${args.query}"…`;
    case 'askQuestion':  return `Asking: ${(args.question || '').slice(0, 60)}`;
    case 'todoList':     return `Todo: ${args.action || 'list'}`;
    default:             return `Executing ${tool}`;
  }
}

function toolDoneMessage(tool, args, result) {
  switch (tool) {
    case 'readFile': {
      const lines = (result?.content || '').split('\n').length;
      return `Read ${basename(args.path)} — ${lines} lines`;
    }
    case 'writeFile':   return `Wrote ${basename(args.path)}`;
    case 'patchFile':   return `Patched ${basename(args.path)}`;
    case 'searchCode': {
      const n = result?.results?.length ?? 0;
      return `Found ${n} match${n !== 1 ? 'es' : ''} for "${args.query}"`;
    }
    case 'listFiles': {
      const n = result?.items?.length ?? 0;
      return `Listed ${n} items in ${args.path || 'workspace'}`;
    }
    case 'runTerminal': return `Ran (exit ${result?.exitCode ?? '?'}): ${args.command.slice(0, 40)}`;
    case 'openFolder':  return `Folder opened: ${args.path}`;
    case 'searchInternet': {
      const n = result?.totalResults ?? 0;
      return `Found ${n} result${n !== 1 ? 's' : ''} for "${args.query}"`;
    }
    case 'searchImages': {
      const n = result?.images?.length ?? 0;
      return `Found ${n} image${n !== 1 ? 's' : ''} for "${args.query}"`;
    }
    case 'webFetch': {
      const len = result?.content?.length ?? 0;
      return `Fetched ${args.url?.slice(0, 50)} (${len} chars)`;
    }
    case 'spawnAgent': return `Sub-agent complete: ${(result?.answer || '').slice(0, 60)}…`;
    case 'rememberFact': return `Remembered: "${(result?.content || '').slice(0, 60)}"`;
    case 'recallMemory': {
      const n = result?.memories?.length ?? 0;
      return `Recalled ${n} memor${n !== 1 ? 'ies' : 'y'}`;
    }
    case 'forgetFact': return result?.removed ? `Forgotten` : `Memory not found`;
    case 'playVideo': return result?.videoId ? `Playing: ${result.query || result.videoId}` : `Video not found`;
    case 'askQuestion': return `Question sent to user`;
    case 'todoList': return `Todo ${args.action || 'list'} complete`;
    default:            return `${tool} complete`;
  }
}

export const TOOL_NAMES = Object.keys(TOOLS);

/* ── spawnAgent ─────────────────────────────────────────────────────── */

async function execSpawnAgent({ task, context }, agentContext, emit) {
  if (!task?.trim()) return { success: false, error: 'task is required' };

  // Build rich context for the sub-agent including the workspace path
  const wsPath = agentContext.workspacePath || '';
  const enrichedContext = [
    wsPath ? `Workspace: ${wsPath}` : '',
    context || '',
  ].filter(Boolean).join('\n');

  const answer = await runSubAgent({
    task:          task.trim(),
    context:       enrichedContext,
    workspacePath: wsPath,
    emit,
    send:          agentContext.send || null,
  });

  return {
    success: true,
    result: { task, answer, length: answer.length },
  };
}


/* ── Memory tools ─────────────────────────────────────────────────────
 * rememberFact(content, tags?) → store a fact JARVIS should remember
 * recallMemory(query?, limit?) → search stored memories
 * forgetFact(id)                → delete a stored memory
 */
async function execRememberFact({ content, tags }) {
  const record = await saveMemory({ content, tags });
  return { ok: true, id: record.id, content: record.content, tags: record.tags };
}

async function execRecallMemory({ query, limit }) {
  const memories = await searchMemories(query, Number(limit) || 20);
  return { memories };
}

async function execForgetFact({ id }) {
  const removed = await deleteMemory(id);
  return { ok: removed, removed };
}

/* ── playVideo ───────────────────────────────────────────────────────────────
 * Search YouTube and return an embeddable video URL.
 * The frontend intercepts this result and renders an inline player.
 */
async function execPlayVideo({ query, url }) {
  // If a direct YouTube URL is provided, extract the video ID
  if (url) {
    const videoId = extractYouTubeId(url);
    if (videoId) {
      return { videoId, embedUrl: `https://www.youtube.com/embed/${videoId}`, query: query || url, source: 'direct' };
    }
    return { error: 'Could not extract YouTube video ID from URL', url };
  }

  if (!query) throw new Error('query or url required');

  // Strategy 1: Search YouTube directly via their search page
  try {
    const ytSearchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    const res = await fetch(ytSearchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(12000),
    });
    const html = await res.text();

    // YouTube embeds video IDs in the initial data JSON
    const videoIdMatch = html.match(/"videoId":"([\w-]{11})"/);
    if (videoIdMatch) {
      const videoId = videoIdMatch[1];
      // Get title if available
      const titleMatch = html.match(/"title":\{"runs":\[\{"text":"([^"]+)"/);
      const title = titleMatch ? titleMatch[1] : query;
      return { videoId, embedUrl: `https://www.youtube.com/embed/${videoId}`, query, title, source: 'youtube' };
    }
  } catch {}

  // Strategy 2: DuckDuckGo with proper redirect decoding
  try {
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query + ' youtube')}`;
    const res = await fetch(searchUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Gemma4IDE/1.0)' },
      signal: AbortSignal.timeout(10000),
    });
    const html = await res.text();

    // Match DuckDuckGo redirect URLs and decode them
    const redirectRe = /duckduckgo\.com\/l\/\?uddg=([^"&\s]+)/g;
    let m;
    while ((m = redirectRe.exec(html)) !== null) {
      try {
        const decoded = decodeURIComponent(m[1]);
        const videoId = extractYouTubeId(decoded);
        if (videoId) return { videoId, embedUrl: `https://www.youtube.com/embed/${videoId}`, query, source: 'duckduckgo' };
      } catch {}
    }

    // Also try direct YouTube URLs in the HTML
    const directRe = /https?:\/\/(?:www\.)?youtube\.com\/watch\?v=([\w-]{11})/g;
    const directMatch = directRe.exec(html);
    if (directMatch) {
      return { videoId: directMatch[1], embedUrl: `https://www.youtube.com/embed/${directMatch[1]}`, query, source: 'duckduckgo-direct' };
    }
  } catch {}

  return { error: `No YouTube video found for: "${query}"`, query };
}

function extractYouTubeId(url) {
  const patterns = [
    /[?&]v=([\w-]{11})/,
    /youtu\.be\/([\w-]{11})/,
    /embed\/([\w-]{11})/,
    /shorts\/([\w-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

/* ── askQuestion ─────────────────────────────────────────────────────────
 * Presents a multiple-choice question to the user via the UI.
 * The frontend intercepts this tool result and shows a choice picker.
 * The user's selection is returned as the tool result.
 */
async function execAskQuestion({ question, options, allowFreeText = false }) {
  if (!question) throw new Error('question required');
  const opts = Array.isArray(options) ? options : [];
  // The actual UI interaction is handled by the frontend via the tool_result SSE event.
  // We return the question + options so the frontend can render the picker.
  // The agent loop will wait for the user's selection via the approval bridge.
  return { question, options: opts, allowFreeText, pending: true };
}

/* ── todoList ────────────────────────────────────────────────────────────
 * Manage a persistent task list.
 * action: 'list' | 'add' | 'complete' | 'delete' | 'clear'
 */
import {
  getTodos, addTodo, completeTodo, deleteTodo, clearTodos,
} from '../services/todoService.js';

async function execTodoList({ action, text, id, priority }) {
  switch ((action || 'list').toLowerCase()) {
    case 'list': {
      const todos = await getTodos();
      return { todos, total: todos.length, pending: todos.filter((t) => !t.done).length };
    }
    case 'add': {
      if (!text) throw new Error('text required for add');
      const item = await addTodo(text, priority || 'normal');
      return { added: item, message: `Added: "${item.text}"` };
    }
    case 'complete': {
      if (!id && !text) throw new Error('id or text required for complete');
      const item = await completeTodo(id || text);
      if (!item) return { error: 'Task not found' };
      return { completed: item, message: `Completed: "${item.text}"` };
    }
    case 'delete': {
      if (!id && !text) throw new Error('id or text required for delete');
      const removed = await deleteTodo(id || text);
      return { removed, message: removed ? 'Task deleted' : 'Task not found' };
    }
    case 'clear': {
      await clearTodos();
      return { cleared: true, message: 'All tasks cleared' };
    }
    default:
      throw new Error(`Unknown action: ${action}. Use list|add|complete|delete|clear`);
  }
}
