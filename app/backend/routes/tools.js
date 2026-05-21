/**
 * Direct Tool Execution Route
 * POST /api/tools/exec — execute a single validated tool call
 * Used by frontend for manual/approved tool execution outside the agent loop.
 */
import { executeTool } from '../tools/executor.js';

export async function toolsRoute(req) {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  const body = await req.json();
  const { tool, args, workspacePath = '', permissionMode = 'full' } = body;

  if (!tool || !args) {
    return Response.json({ error: 'tool and args required' }, { status: 400 });
  }

  const events = [];
  const emit = (event) => events.push({ ...event, ts: Date.now() });

  const context = { mode: permissionMode, workspacePath };
  const result = await executeTool({ tool, args }, context, emit);

  return Response.json({ ...result, events });
}
