/**
 * Skills & Custom Tools Route
 * GET  /api/skills        — return stored custom tools
 * POST /api/skills/tools  — sync enabled custom tools from frontend
 */

let customTools = [];

export function getCustomTools() {
  return customTools;
}

export async function skillsRoute(req, url) {
  const path = url.pathname;

  if (req.method === 'GET' && path === '/api/skills') {
    return Response.json({ tools: customTools });
  }

  if (req.method === 'POST' && path === '/api/skills/tools') {
    const body = await req.json();
    customTools = (body.tools || []).filter((t) => t.enabled !== false);
    return Response.json({ ok: true, count: customTools.length });
  }

  return Response.json({ error: 'Not found' }, { status: 404 });
}
