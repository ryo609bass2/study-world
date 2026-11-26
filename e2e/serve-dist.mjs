import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const prefix = '/study-world/';
const mime = { '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8' };
createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    const pathname = decodeURIComponent(url.pathname);
    if (!pathname.startsWith(prefix)) throw new Error('Page outside test subpath');
    const file = path.resolve(root, pathname.slice(prefix.length) || 'index.html');
    if (path.relative(root, file).startsWith('..') || path.isAbsolute(path.relative(root, file))) throw new Error('Path outside dist');
    const body = await readFile(file);
    response.setHeader('Content-Type', mime[path.extname(file)] ?? 'application/octet-stream');
    response.end(body);
  } catch {
    response.writeHead(404).end();
  }
}).listen(4173, '127.0.0.1');
