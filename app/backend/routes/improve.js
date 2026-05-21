/**
 * Self-improvement route — JARVIS analyzes its own recent conversations
 * and proposes improvements to its custom instructions, skills, and memory.
 *
 * POST /api/improve/run
 *   Triggers a full improvement cycle. Streams SSE events.
 *
 * GET  /api/improve/history
 *   Returns the last N improvement runs.
 *
 * POST /api/improve/apply
 *   Applies a proposed change (instructions patch, new skill, memory update).
 */
import { readFile, writeFile, mkdir } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { getSystemInstructions, saveSystemInstructions } from './settings.js';
import { saveMemory, getAllMemories } from '../services/memoryService.js';
import { getProjectRoot } from '../utils/root.js';
import { getActiveProvider, streamProviderChat } from '../services/providerService.js';
import { readSettings, updateSettings } from '../services/settingsStore.js';

const LLAMA_URL = process.env.LLAMA_URL || 'http://127.0.0.1:6969';

const MAX_HISTORY_RUNS = 20;

async function getImprovementHistory() {
  const s = await readSettings();
  return Array.isArray(s.improvementHistory) ? s.improvementHistory : [];
}

async function appendImprovementRun(run) {
  const s = await readSettings();
  const hist = Array.isArray(s.improvementHistory) ? s.improvementHistory : [];
  hist.push(run);
  if (hist.length > MAX_HISTORY_RUNS) hist.splice(0, hist.length - MAX_HISTORY_RUNS);
  await updateSettings({ improvementHistory: hist });
}

/** Pull the last N assistant messages from the session DB for analysis. */
async function getRecentConversations(backendUrl, limit = 30) {
  try {
    const res = await fetch(`${backendUrl}/api/state`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return [];
    const data = await res.json();
    // Flatten all sessions' messages, take last `limit` assistant turns
    const sessions = data?.sessions || [];
    const msgs = [];
    for (const s of sessions) {
      for (const m of (s.messages || [])) {
        if (m.role === 'assistant' || m.role === 'user') msgs.push(m);
      }
    }
    return msgs.slice(-limit * 2);
  } catch { return []; }
}

/** Ask the model to analyze conversations and propose improvements. */
async function runAnalysis({ messages, currentInstructions, memories, backendUrl }) {
  const conversationSample = messages
    .slice(-40)
    .map((m) => `${m.role === 'user' ? 'User' : 'JARVIS'}: ${String(m.content || '').slice(0, 300)}`)
    .join('\n');

  const memoryList = memories.slice(0, 20).map((m) => `- ${m.content}`).join('\n') || '(none)';

  const prompt = `You are JARVIS performing a self-improvement analysis. Review the recent conversation history and identify concrete improvements.

CURRENT CUSTOM INSTRUCTIONS:
${currentInstructions || '(none — using default JARVIS persona)'}

CURRENT MEMORIES:
${memoryList}

RECENT CONVERSATION SAMPLE:
${conversationSample || '(no conversations yet)'}

Analyze the above and output a JSON object with this exact structure:
{
  "summary": "One sentence describing what you found",
  "instructionPatch": "New text to ADD to custom instructions (null if no change needed). Be specific and concise. Max 3 bullet points.",
  "newMemories": [
    {"content": "fact to remember", "tags": ["tag1"]}
  ],
  "newSkills": [
    {"name": "skill_name", "description": "what it does", "command": "shell command to run"}
  ],
  "score": 7
}

Rules:
- instructionPatch: only add NEW rules not already in current instructions. null if nothing useful.
- newMemories: only facts about the user that came up in conversation and aren't already stored.
- newSkills: only if the user repeatedly asked JARVIS to run the same type of command.
- score: 1-10 rating of how well JARVIS performed (10 = perfect).
- Output ONLY the JSON object. No prose, no markdown fences.`;

  // Try provider first, then local llama
  let fullText = '';
  try {
    const activeProvider = await getActiveProvider();
    const history = [
      { role: 'system', content: 'You are a JSON-only analysis engine. Output only valid JSON.' },
      { role: 'user', content: prompt },
    ];

    if (activeProvider) {
      for await (const chunk of streamProviderChat(activeProvider, history, { temperature: 0.3, max_tokens: 1024 })) {
        fullText += chunk;
      }
    } else {
      const res = await fetch(`${LLAMA_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, temperature: 0.3, max_tokens: 1024, stream: false }),
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) throw new Error(`llama ${res.status}`);
      const data = await res.json();
      fullText = data.choices?.[0]?.message?.content || '';
    }
  } catch (e) {
    throw new Error(`Model call failed: ${e.message}`);
  }

  // Extract JSON from response
  const jsonMatch = fullText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`Model did not return valid JSON. Got: ${fullText.slice(0, 200)}`);
  return JSON.parse(jsonMatch[0]);
}

export async function improveRoute(req, url) {
  const path   = url.pathname;
  const method = req.method;

  // GET /api/improve/history
  if (path === '/api/improve/history' && method === 'GET') {
    const history = await getImprovementHistory();
    return Response.json({ history: history.slice().reverse() });
  }

  // POST /api/improve/run — stream SSE
  if (path === '/api/improve/run' && method === 'POST') {
    let backendUrl = 'http://localhost:6767';
    try { const b = await req.json(); backendUrl = b.backendUrl || backendUrl; } catch {}

    const enc = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event, data) => {
          try { controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); } catch {}
        };

        try {
          send('status', { message: 'Gathering conversation history…' });
          const messages = await getRecentConversations(backendUrl);

          send('status', { message: 'Loading current instructions and memories…' });
          const [currentInstructions, memories] = await Promise.all([
            getSystemInstructions(),
            getAllMemories(),
          ]);

          send('status', { message: 'Analyzing with JARVIS model…' });
          const analysis = await runAnalysis({ messages, currentInstructions, memories, backendUrl });

          send('analysis', analysis);

          // Auto-apply memories (safe, additive)
          const appliedMemories = [];
          for (const m of (analysis.newMemories || [])) {
            if (m.content) {
              const rec = await saveMemory(m);
              appliedMemories.push(rec);
            }
          }
          if (appliedMemories.length) send('status', { message: `Saved ${appliedMemories.length} new memor${appliedMemories.length !== 1 ? 'ies' : 'y'}` });

          // Record the run
          const run = {
            ts: Date.now(),
            score: analysis.score,
            summary: analysis.summary,
            instructionPatch: analysis.instructionPatch || null,
            newMemories: appliedMemories,
            newSkills: analysis.newSkills || [],
            applied: { memories: true, instructions: false, skills: false },
          };
          await appendImprovementRun(run);

          send('done', { run });
        } catch (e) {
          send('error', { message: e.message });
        } finally {
          try { controller.close(); } catch {}
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  // POST /api/improve/apply — apply a specific proposed change
  if (path === '/api/improve/apply' && method === 'POST') {
    try {
      const body = await req.json();
      const { type, data } = body;

      if (type === 'instructions' && data?.patch) {
        const current = await getSystemInstructions();
        const separator = current.trim() ? '\n\n' : '';
        await saveSystemInstructions(current + separator + data.patch.trim());
        return Response.json({ ok: true, type: 'instructions' });
      }

      if (type === 'skill' && data?.name && data?.command) {
        const s = await readSettings();
        const skills = Array.isArray(s.skills) ? s.skills : [];
        skills.push({
          id: `auto_${Date.now()}`,
          name: data.name,
          description: data.description || '',
          command: data.command,
          enabled: true,
          source: 'self-improvement',
        });
        await updateSettings({ skills });
        return Response.json({ ok: true, type: 'skill' });
      }

      return Response.json({ error: 'Unknown apply type' }, { status: 400 });
    } catch (e) {
      return Response.json({ error: e.message }, { status: 500 });
    }
  }

  return Response.json({ error: 'Unknown improve endpoint' }, { status: 404 });
}
