import { getTodos, addTodo, completeTodo, deleteTodo, clearTodos } from '../services/todoService.js';

export async function todosRoute(req, url) {
  const path = url.pathname, method = req.method;

  if (path === '/api/todos' && method === 'GET') {
    return Response.json({ todos: await getTodos() });
  }
  if (path === '/api/todos' && method === 'POST') {
    const { text, priority } = await req.json().catch(() => ({}));
    if (!text) return Response.json({ error: 'text required' }, { status: 400 });
    return Response.json({ todo: await addTodo(text, priority) });
  }
  if (path === '/api/todos' && method === 'DELETE') {
    await clearTodos();
    return Response.json({ ok: true });
  }
  if (path.startsWith('/api/todos/') && method === 'PATCH') {
    const id = path.slice('/api/todos/'.length);
    const item = await completeTodo(id);
    return Response.json({ todo: item, ok: !!item });
  }
  if (path.startsWith('/api/todos/') && method === 'DELETE') {
    const id = path.slice('/api/todos/'.length);
    return Response.json({ ok: await deleteTodo(id) });
  }
  return Response.json({ error: 'Unknown todos endpoint' }, { status: 404 });
}
