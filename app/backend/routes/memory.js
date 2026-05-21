/**
 * Memory routes — JARVIS long-term memory CRUD.
 *
 *   GET    /api/memory          → list all memories
 *   POST   /api/memory          → create/update {content, tags?, id?}
 *   DELETE /api/memory/:id      → delete one
 *   DELETE /api/memory          → wipe all
 */
import {
  getAllMemories,
  saveMemory,
  deleteMemory,
  clearMemories,
} from '../services/memoryService.js';

export async function memoryRoute(req, url) {
  const path   = url.pathname;
  const method = req.method;

  if (path === '/api/memory' && method === 'GET') {
    const memories = await getAllMemories();
    return Response.json({ memories });
  }

  if (path === '/api/memory' && method === 'POST') {
    try {
      const body = await req.json();
      const record = await saveMemory(body);
      return Response.json({ ok: true, memory: record });
    } catch (e) {
      return Response.json({ error: e.message }, { status: 400 });
    }
  }

  if (path === '/api/memory' && method === 'DELETE') {
    await clearMemories();
    return Response.json({ ok: true, cleared: true });
  }

  if (path.startsWith('/api/memory/') && method === 'DELETE') {
    const id = path.slice('/api/memory/'.length);
    if (!id) return Response.json({ error: 'id required' }, { status: 400 });
    const removed = await deleteMemory(id);
    return Response.json({ ok: removed, removed });
  }

  return Response.json({ error: 'Unknown memory endpoint' }, { status: 404 });
}
