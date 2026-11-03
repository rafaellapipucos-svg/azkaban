// Serves `apps/app/dist` on the port given, falling back to `index.html` for the app's routes, as the
// host does with `_redirects`. `expo serve` answers 404 to a deep link of an `output: 'single'` build.
// Only for `E2E_BUILD=1` in playwright.config.ts; stdlib, so no new dependency.
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';
import { URL } from 'node:url';

const root = join(import.meta.dirname, '../apps/app/dist');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};

createServer((req, res) => {
  // A rooted path normalizes `..` away, and the `startsWith` stays as a backstop. A malformed `%` is a
  // route like any other, not a crash.
  let path;
  try {
    path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
  } catch {
    path = sep;
  }
  let file = join(root, path);
  if (!file.startsWith(root + sep) || !statSync(file, { throwIfNoEntry: false })?.isFile())
    file = join(root, 'index.html');
  res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
}).listen(Number(process.argv[2]));
