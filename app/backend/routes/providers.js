import {
  listProviders,
  addProvider,
  updateProvider,
  deleteProvider,
  setActiveProvider,
  getActiveProvider,
  fetchProviderModels,
  testProvider,
  testProviderDraft,
} from '../services/providerService.js';

export async function providersRoute(req, url) {
  const path = url.pathname;
  const method = req.method;

  // GET /api/providers — list all
  if (path === '/api/providers' && method === 'GET') {
    return Response.json(await listProviders());
  }

  // POST /api/providers — add a provider
  if (path === '/api/providers' && method === 'POST') {
    try {
      const body = await req.json();
      const result = await addProvider(body);
      return Response.json(result, { status: 201 });
    } catch (err) {
      return Response.json({ error: err.message }, { status: 400 });
    }
  }

  // POST /api/providers/test-draft — test before saving
  if (path === '/api/providers/test-draft' && method === 'POST') {
    try {
      const body = await req.json();
      const result = await testProviderDraft(body);
      return Response.json(result);
    } catch (err) {
      return Response.json({ error: err.message }, { status: 400 });
    }
  }

  // GET/POST /api/providers/active
  if (path === '/api/providers/active') {
    if (method === 'GET') {
      return Response.json((await getActiveProvider()) || {});
    }
    if (method === 'POST') {
      try {
        const body = await req.json();
        const result = await setActiveProvider(body.providerId, body.modelId);
        return Response.json(result);
      } catch (err) {
        return Response.json({ error: err.message }, { status: 400 });
      }
    }
  }

  // POST /api/providers/:id/fetch-models
  const fetchMatch = path.match(/^\/api\/providers\/([^/]+)\/fetch-models$/);
  if (fetchMatch && method === 'POST') {
    try {
      const models = await fetchProviderModels(fetchMatch[1]);
      return Response.json({ models });
    } catch (err) {
      return Response.json({ error: err.message }, { status: 400 });
    }
  }

  // POST /api/providers/:id/test
  const testMatch = path.match(/^\/api\/providers\/([^/]+)\/test$/);
  if (testMatch && method === 'POST') {
    try {
      const result = await testProvider(testMatch[1]);
      return Response.json(result);
    } catch (err) {
      return Response.json({ error: err.message }, { status: 400 });
    }
  }

  // PUT/DELETE /api/providers/:id
  const idMatch = path.match(/^\/api\/providers\/([^/]+)$/);
  if (idMatch && method === 'PUT') {
    try {
      const body = await req.json();
      const result = await updateProvider(idMatch[1], body);
      return Response.json(result);
    } catch (err) {
      return Response.json({ error: err.message }, { status: 400 });
    }
  }
  if (idMatch && method === 'DELETE') {
    try {
      const result = await deleteProvider(idMatch[1]);
      return Response.json(result);
    } catch (err) {
      return Response.json({ error: err.message }, { status: 400 });
    }
  }

  return Response.json({ error: 'Unknown providers endpoint' }, { status: 404 });
}
