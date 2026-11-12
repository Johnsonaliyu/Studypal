// Minimal zero-dependency static server for the built Study Pal PWA.
// Serves artifacts/study-pal/dist/public with SPA fallback. Used on Railway.
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createGzip } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'dist/public');
const port = Number(process.env.PORT) || 3000;

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.woff2': 'font/woff2',
};
const compressible = new Set(['.html', '.js', '.mjs', '.css', '.json', '.webmanifest', '.svg', '.txt', '.wasm']);

async function resolveFile(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const candidate = path.normalize(path.join(root, decoded));
  if (!candidate.startsWith(root)) return null; // path traversal guard
  try {
    const info = await stat(candidate);
    if (info.isFile()) return { file: candidate, info };
    if (info.isDirectory()) {
      const index = path.join(candidate, 'index.html');
      return { file: index, info: await stat(index) };
    }
  } catch { /* fall through */ }
  return null;
}

createServer(async (req, res) => {
  try {
    if (req.url === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok');
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' });
      res.end();
      return;
    }
    let found = await resolveFile(req.url ?? '/');
    // SPA fallback: only for extension-less routes, never for missing assets.
    if (!found && !path.extname(req.url.split('?')[0])) found = await resolveFile('/index.html');
    if (!found) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(found.file).toLowerCase();
    const name = path.basename(found.file);
    const headers = { 'Content-Type': types[ext] ?? 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' };
    // Hashed build assets are immutable; the shell and service worker must always revalidate.
    headers['Cache-Control'] = found.file.includes(`${path.sep}assets${path.sep}`)
      ? 'public, max-age=31536000, immutable'
      : (name === 'sw.js' || ext === '.html' || ext === '.webmanifest') ? 'no-cache' : 'public, max-age=3600';
    if (name === 'sw.js') headers['Service-Worker-Allowed'] = '/';
    const gzip = compressible.has(ext) && /\bgzip\b/.test(req.headers['accept-encoding'] ?? '');
    if (gzip) { headers['Content-Encoding'] = 'gzip'; headers['Vary'] = 'Accept-Encoding'; }
    else headers['Content-Length'] = found.info.size;
    res.writeHead(200, headers);
    if (req.method === 'HEAD') { res.end(); return; }
    const stream = createReadStream(found.file);
    stream.on('error', () => res.destroy());
    gzip ? stream.pipe(createGzip()).pipe(res) : stream.pipe(res);
  } catch (error) {
    console.error(error);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Server error');
  }
}).listen(port, '0.0.0.0', () => console.log(`Study Pal listening on :${port}, serving ${root}`));
