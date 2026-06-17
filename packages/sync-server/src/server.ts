import { createServer as createHttpServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { timingSafeEqual } from 'node:crypto';

/**
 * Mnemo sync server (roadmap v2.5). A deliberately dumb, self-hostable blob
 * store: it holds one opaque ciphertext blob per namespace and never sees
 * plaintext. The client encrypts with the user's key before upload
 * (end-to-end), so the server — hosted or self-run — cannot read memories.
 *
 * This is the open-source backend that mnemo.dev would run; point the client at
 * any instance with `mnemo sync --server <url>`.
 */

export type SyncServerOpts = {
  /** Directory where namespace blobs are stored. */
  dir: string;
  /** Bearer token required for all requests. If unset, the server runs open (dev only). */
  token?: string;
  /** Max blob size in bytes (default 32 MiB). */
  maxBytes?: number;
};

const NAMESPACE_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;
const BLOB_ROUTE = /^\/v1\/blobs\/([^/]+)$/;

export type SyncServerHandle = {
  server: Server;
  /** The bound port (after listen). */
  port: number;
  close: () => Promise<void>;
};

export function createSyncHandler(opts: SyncServerOpts) {
  const maxBytes = opts.maxBytes ?? 32 * 1024 * 1024;
  const blobPath = (ns: string) => join(opts.dir, `${ns}.blob`);

  const authorized = (req: IncomingMessage): boolean => {
    if (!opts.token) return true;
    const header = req.headers['authorization'];
    if (typeof header !== 'string' || !header.startsWith('Bearer ')) return false;
    const provided = Buffer.from(header.slice('Bearer '.length));
    const expected = Buffer.from(opts.token);
    return provided.length === expected.length && timingSafeEqual(provided, expected);
  };

  return async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');

      if (url.pathname === '/v1/health') {
        return json(res, 200, { ok: true, service: 'mnemo-sync', e2e: true });
      }

      if (!authorized(req)) {
        return json(res, 401, { error: 'unauthorized' });
      }

      const m = BLOB_ROUTE.exec(url.pathname);
      if (!m) return json(res, 404, { error: 'not found' });
      const ns = m[1]!;
      if (!NAMESPACE_RE.test(ns)) return json(res, 400, { error: 'invalid namespace' });

      await mkdir(opts.dir, { recursive: true });
      const file = blobPath(ns);

      if (req.method === 'PUT' || req.method === 'POST') {
        const body = await readRawBody(req, maxBytes);
        if (body === null) return json(res, 413, { error: 'payload too large' });
        await writeFile(file, body);
        return json(res, 200, { ok: true, namespace: ns, size: body.length, updatedAt: Date.now() });
      }

      if (req.method === 'GET') {
        if (!existsSync(file)) return json(res, 404, { error: 'no blob for namespace' });
        const bytes = await readFile(file);
        res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': String(bytes.length) });
        res.end(bytes);
        return;
      }

      if (req.method === 'HEAD') {
        res.writeHead(existsSync(file) ? 200 : 404);
        res.end();
        return;
      }

      if (req.method === 'DELETE') {
        if (existsSync(file)) await unlink(file);
        return json(res, 200, { ok: true });
      }

      return json(res, 405, { error: 'method not allowed' });
    } catch (err) {
      json(res, 500, { error: (err as Error).message });
    }
  };
}

/** Start an HTTP sync server. Resolves once it is listening. */
export async function startSyncServer(
  opts: SyncServerOpts & { port?: number; host?: string },
): Promise<SyncServerHandle> {
  const handler = createSyncHandler(opts);
  const server = createHttpServer((req, res) => void handler(req, res));
  await new Promise<void>(r => server.listen(opts.port ?? 0, opts.host ?? '127.0.0.1', r));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : (opts.port ?? 0);
  return {
    server,
    port,
    close: () => new Promise<void>((resolve, reject) => server.close(e => (e ? reject(e) : resolve()))),
  };
}

function json(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(payload));
}

async function readRawBody(req: IncomingMessage, maxBytes: number): Promise<Buffer | null> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > maxBytes) {
        resolve(null);
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
