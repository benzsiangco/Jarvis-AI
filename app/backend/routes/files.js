import { mkdir, readdir, readFile, writeFile, stat } from 'fs/promises';
import { join, basename, dirname, extname } from 'path';

const IGNORED = new Set(['node_modules', '.git', '.next', 'dist', '__pycache__', '.cache', '.vscode']);

export async function filesRoute(req, url) {
  const path = url.pathname;

  if (path === '/api/files/tree') {
    const dirPath = url.searchParams.get('path');
    if (!dirPath) return Response.json({ error: 'path required' }, { status: 400 });
    const tree = await buildTree(dirPath, 0);
    return Response.json(tree);
  }

  if (path === '/api/files/read') {
    const filePath = url.searchParams.get('path');
    if (!filePath) return Response.json({ error: 'path required' }, { status: 400 });
    try {
      const content = await readFile(filePath, 'utf-8');
      const info = await stat(filePath);
      return Response.json({ content, size: info.size, path: filePath });
    } catch (err) {
      return Response.json({ error: err.message }, { status: 404 });
    }
  }

  if (path === '/api/files/write' && req.method === 'POST') {
    const body = await req.json();
    if (!body.path || body.content === undefined) {
      return Response.json({ error: 'path and content required' }, { status: 400 });
    }
    try {
      await mkdir(dirname(body.path), { recursive: true });
      await writeFile(body.path, body.content, 'utf-8');
      return Response.json({ success: true, path: body.path });
    } catch (err) {
      return Response.json({ error: err.message }, { status: 500 });
    }
  }

  return Response.json({ error: 'Unknown files endpoint' }, { status: 404 });
}

async function buildTree(dirPath, depth) {
  if (depth > 5) return { name: basename(dirPath), path: dirPath, type: 'directory', children: [] };

  const entries = await readdir(dirPath, { withFileTypes: true });
  const children = [];

  const sorted = entries.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    return a.name.localeCompare(b.name);
  });

  for (const entry of sorted) {
    if (IGNORED.has(entry.name) || entry.name.startsWith('.')) continue;

    const fullPath = join(dirPath, entry.name);
    if (entry.isDirectory()) {
      children.push(await buildTree(fullPath, depth + 1));
    } else {
      children.push({ name: entry.name, path: fullPath, type: 'file', ext: extname(entry.name) });
    }
  }

  return { name: basename(dirPath), path: dirPath, type: 'directory', children };
}
