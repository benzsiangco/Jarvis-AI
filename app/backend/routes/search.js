import { spawn } from 'child_process';

export async function searchRoute(req, url) {
  if (url.pathname !== '/api/search') {
    return Response.json({ error: 'Unknown search endpoint' }, { status: 404 });
  }

  const query = url.searchParams.get('q');
  const searchPath = url.searchParams.get('path') || '.';
  const maxResults = parseInt(url.searchParams.get('limit') || '50');

  if (!query) {
    return Response.json({ error: 'q (query) required' }, { status: 400 });
  }

  try {
    const results = await ripgrepSearch(query, searchPath, maxResults);
    return Response.json({ results, query });
  } catch (err) {
    // Fallback message if ripgrep not installed
    return Response.json({ error: `Search failed: ${err.message}. Is ripgrep (rg) installed?` }, { status: 500 });
  }
}

function ripgrepSearch(query, searchPath, maxResults) {
  return new Promise((resolve, reject) => {
    const args = [
      '--json', '--max-count', '5', '--max-filesize', '1M',
      '-i', '-n', query, searchPath,
    ];

    const proc = spawn('rg', args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });

    proc.on('close', (code) => {
      if (code > 1) return reject(new Error(stderr || `rg exited with ${code}`));

      const results = [];
      const lines = stdout.split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          if (parsed.type === 'match' && results.length < maxResults) {
            results.push({
              path: parsed.data.path?.text,
              lineNumber: parsed.data.line_number,
              text: parsed.data.lines?.text?.trim(),
            });
          }
        } catch {}
      }
      resolve(results);
    });

    proc.on('error', reject);
  });
}
