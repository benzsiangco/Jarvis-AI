import { runTerminalCommand } from '../services/terminalCommand.js';

export async function terminalRoute(req) {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  const url = new URL(req.url);
  if (url.pathname !== '/api/terminal/exec') {
    return Response.json({ error: 'Unknown terminal endpoint' }, { status: 404 });
  }

  const body = await req.json();
  const { command, cwd } = body;

  if (!command) {
    return Response.json({ error: 'command required' }, { status: 400 });
  }

  // Stream command output
  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      try {
        const result = await runTerminalCommand({
          command,
          cwd: cwd || process.cwd(),
          timeoutMs: 0,
          onData: (data) => controller.enqueue(enc.encode(data)),
        });
        controller.enqueue(enc.encode(`\n[exit code: ${result.exitCode}]\n`));
      } catch (err) {
        controller.enqueue(enc.encode(`\n[error: ${err.message}]\n`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Transfer-Encoding': 'chunked' },
  });
}
