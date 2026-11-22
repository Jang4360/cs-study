import http from 'node:http';
import { readFile, stat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.resolve(ROOT_DIR, 'public');
const CONTENT_DIR = path.resolve(ROOT_DIR, 'content');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

function sendError(res, status, message, extraHeaders = {}) {
  const body = Buffer.from(`${status} ${message}\n`, 'utf-8');
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': body.length,
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders,
  });
  res.end(body);
}

export function resolveRequestPath(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl.startsWith('/')) {
    return { status: 400, error: 'Bad Request' };
  }

  const rawPathname = rawUrl.split('?')[0].split('#')[0];
  let decoded;
  try {
    decoded = decodeURIComponent(rawPathname);
  } catch {
    return { status: 400, error: 'Bad Request' };
  }

  // Block null bytes, backslashes, and any parent directory traversal segments.
  if (decoded.includes('\0') || decoded.includes('\\')) {
    return { status: 400, error: 'Bad Request' };
  }

  const segments = decoded.split('/');
  if (segments.some((seg) => seg === '..')) {
    return { status: 400, error: 'Bad Request' };
  }

  const normalized = path.posix.normalize(decoded);
  if (normalized.startsWith('/..') || !normalized.startsWith('/')) {
    return { status: 400, error: 'Bad Request' };
  }

  let baseDir;
  let relPath;
  if (normalized === '/') {
    baseDir = PUBLIC_DIR;
    relPath = 'index.html';
  } else if (normalized === '/content' || normalized === '/content/') {
    return { status: 404, error: 'Not Found' };
  } else if (normalized.startsWith('/content/')) {
    baseDir = CONTENT_DIR;
    relPath = normalized.slice('/content/'.length);
  } else {
    baseDir = PUBLIC_DIR;
    relPath = normalized.slice(1);
  }

  const resolved = path.resolve(baseDir, relPath);
  if (resolved !== baseDir && !resolved.startsWith(baseDir + path.sep)) {
    return { status: 400, error: 'Bad Request' };
  }

  return { status: 200, baseDir, filePath: resolved };
}

export function createAppServer() {
  return http.createServer(async (req, res) => {
    const method = req.method || '';
    if (method !== 'GET' && method !== 'HEAD') {
      sendError(res, 405, 'Method Not Allowed', { Allow: 'GET, HEAD' });
      return;
    }

    const resolved = resolveRequestPath(req.url || '/');
    if (resolved.status !== 200) {
      sendError(res, resolved.status, resolved.error);
      return;
    }

    try {
      const [realBase, realFile] = await Promise.all([
        realpath(resolved.baseDir),
        realpath(resolved.filePath),
      ]);

      if (!realFile.startsWith(realBase + path.sep)) {
        sendError(res, 403, 'Forbidden');
        return;
      }

      const fileStat = await stat(realFile);
      if (!fileStat.isFile()) {
        sendError(res, 404, 'Not Found');
        return;
      }

      const ext = path.extname(realFile).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      const headers = {
        'Content-Type': contentType,
        'Content-Length': fileStat.size,
        'X-Content-Type-Options': 'nosniff',
      };
      if (ext === '.html') {
        headers['Cache-Control'] = 'no-cache';
      }

      if (method === 'HEAD') {
        res.writeHead(200, headers);
        res.end();
        return;
      }

      const body = await readFile(realFile);
      res.writeHead(200, headers);
      res.end(body);
    } catch (err) {
      if (err && (err.code === 'ENOENT' || err.code === 'ENOTDIR')) {
        sendError(res, 404, 'Not Found');
        return;
      }
      sendError(res, 500, 'Internal Server Error');
    }
  });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isMain) {
  const host = process.env.HOST || '127.0.0.1';
  const port = Number(process.env.PORT || 8790);

  if (host === '0.0.0.0' || host === '::') {
    console.error(`Refusing to bind to wildcard address (${host}). Set HOST to 127.0.0.1 or a specific interface IP.`);
    process.exit(1);
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error(`Invalid PORT: ${process.env.PORT}`);
    process.exit(1);
  }

  const server = createAppServer();
  server.listen(port, host, () => {
    console.log(`Static server listening on http://${host}:${port}`);
  });
}
