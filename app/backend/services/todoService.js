/**
 * todoService — JARVIS task list.
 * Persisted in app-settings.json under `todos`.
 */
import { randomUUID } from 'crypto';
import { readSettings, updateSettings } from './settingsStore.js';

export async function getTodos() {
  const s = await readSettings();
  return Array.isArray(s.todos) ? s.todos : [];
}

export async function addTodo(text, priority = 'normal') {
  let item;
  await updateSettings((current) => {
    const todos = Array.isArray(current.todos) ? [...current.todos] : [];
    item = { id: randomUUID(), text: text.trim(), done: false, priority, ts: Date.now() };
    todos.push(item);
    return { todos };
  });
  return item;
}

export async function completeTodo(id) {
  let result = null;
  await updateSettings((current) => {
    const todos = Array.isArray(current.todos) ? [...current.todos] : [];
    const idx = todos.findIndex((t) => t.id === id || t.text.toLowerCase().includes(id.toLowerCase()));
    if (idx >= 0) {
      todos[idx] = { ...todos[idx], done: true, doneAt: Date.now() };
      result = todos[idx];
    }
    return { todos };
  });
  return result;
}

export async function deleteTodo(id) {
  let removed = false;
  await updateSettings((current) => {
    const todos = Array.isArray(current.todos) ? [...current.todos] : [];
    const idx = todos.findIndex((t) => t.id === id || t.text.toLowerCase().includes(id.toLowerCase()));
    if (idx >= 0) { todos.splice(idx, 1); removed = true; }
    return { todos };
  });
  return removed;
}

export async function clearTodos() {
  await updateSettings(() => ({ todos: [] }));
}
