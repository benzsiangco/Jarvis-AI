import { fileURLToPath } from 'url';
import { dirname, join, basename, resolve } from 'path';
import { createWriteStream, mkdirSync, existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MODELS_DIR = resolve(__dirname, '../../../models');

export async function uploadRoute(req, url) {
  if (url.pathname !== '/api/models/upload') {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    // Ensure models dir exists
    if (!existsSync(MODELS_DIR)) mkdirSync(MODELS_DIR, { recursive: true });

    const formData = await req.formData();
    const file = formData.get('model');

    if (!file || typeof file === 'string') {
      return Response.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const filename = basename(file.name);
    if (!filename.endsWith('.gguf')) {
      return Response.json({ error: 'Only .gguf files are supported' }, { status: 400 });
    }

    const destPath = join(MODELS_DIR, filename);
    const arrayBuffer = await file.arrayBuffer();
    await Bun.write(destPath, arrayBuffer);

    return Response.json({
      success: true,
      filename,
      path: destPath,
      size: arrayBuffer.byteLength,
      sizeMB: Math.round(arrayBuffer.byteLength / 1024 / 1024),
    });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
