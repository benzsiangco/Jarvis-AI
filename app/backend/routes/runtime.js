import {
  fetchAvailableRuntimes,
  getInstalledRuntimes,
  startDownload,
  getDownload,
  activateRuntime,
  removeRuntime,
  cancelDownload,
  getCurrentVersion,
  cancelActiveDownload,
} from '../services/runtimeManager.js';

export async function runtimeRoute(req, url) {
  const path = url.pathname;
  const method = req.method;

  // GET /api/runtimes — list available + installed
  if (path === '/api/runtimes' && method === 'GET') {
    const [available, installed, current] = await Promise.all([
      fetchAvailableRuntimes(),
      getInstalledRuntimes(),
      getCurrentVersion(),
    ]);
    // If no runtime registered in metadata but a current version is detected,
    // inject it as an installed entry so it shows in the UI.
    if (current && !installed.find((r) => r.id === `${current.backend}-${current.build}`)) {
      installed.push({
        id: `${current.backend}-${current.build}`,
        backend: current.backend,
        version: current.build,
        installedAt: new Date(0).toISOString(),
        size: 0,
        active: true,
        dir: null,
        label: `${current.backend === 'vulkan' ? 'Vulkan' : current.backend === 'cuda' ? 'CUDA' : 'CPU'} llama.cpp`,
        currentBuild: true,
      });
    }
    return Response.json({ available, installed, current });
  }

  // GET /api/runtimes/installed — list installed runtimes
  if (path === '/api/runtimes/installed' && method === 'GET') {
    const installed = await getInstalledRuntimes();
    return Response.json({ installed });
  }

  // POST /api/runtimes/download — start a download
  if (path === '/api/runtimes/download' && method === 'POST') {
    try {
      const body = await req.json();
      const { backend } = body;
      if (!backend || !['cpu', 'vulkan', 'cuda'].includes(backend)) {
        return Response.json({ error: 'Invalid backend. Must be cpu, vulkan, or cuda.' }, { status: 400 });
      }
      const downloadId = await startDownload(backend);
      const dl = getDownload(downloadId);
      return Response.json({ downloadId, total: dl?.total || 0, backend });
    } catch (err) {
      return Response.json({ error: err.message }, { status: 500 });
    }
  }

  // GET /api/runtimes/download/:id — poll download progress
  const downloadMatch = path.match(/^\/api\/runtimes\/download\/([^/]+)$/);
  if (downloadMatch && method === 'GET') {
    const dl = getDownload(downloadMatch[1]);
    if (!dl) return Response.json({ error: 'Download not found' }, { status: 404 });
    return Response.json({
      id: dl.id,
      status: dl.status,
      progress: dl.progress,
      downloaded: dl.downloaded,
      total: dl.total,
      speed: dl.speed,
      eta: dl.eta,
      stage: dl.stage,
      error: dl.error,
      backend: dl.backend,
    });
  }

  // POST /api/runtimes/:id/activate — switch to a runtime
  const activateMatch = path.match(/^\/api\/runtimes\/([^/]+)\/activate$/);
  if (activateMatch && method === 'POST') {
    try {
      const result = await activateRuntime(activateMatch[1]);
      return Response.json(result);
    } catch (err) {
      return Response.json({ error: err.message }, { status: 500 });
    }
  }

  // DELETE /api/runtimes/:id — remove a runtime
  const removeMatch = path.match(/^\/api\/runtimes\/([^/]+)$/);
  if (removeMatch && method === 'DELETE') {
    try {
      const result = await removeRuntime(removeMatch[1]);
      return Response.json(result);
    } catch (err) {
      return Response.json({ error: err.message }, { status: 500 });
    }
  }

  // POST /api/runtimes/cancel — cancel active download
  if (path === '/api/runtimes/cancel' && method === 'POST') {
    const id = cancelActiveDownload();
    return Response.json({ cancelled: !!id, downloadId: id });
  }

  return Response.json({ error: 'Unknown runtime endpoint' }, { status: 404 });
}
