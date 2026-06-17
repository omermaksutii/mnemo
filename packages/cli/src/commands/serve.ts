import type { Command } from 'commander';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { Mnemo } from '@mnemo-mcp/core';
import chalk from 'chalk';
import { DASHBOARD_HTML } from '../web/dashboard.js';

type Opts = { port: string; host: string; dataDir?: string };

/**
 * `mnemo serve` — a zero-dependency localhost dashboard. Serves a single-page
 * UI plus a small read/write JSON API backed by the local Mnemo store. No
 * daemon: it runs until you Ctrl-C, in keeping with the no-background-process
 * principle (it's an explicit, foregrounded invocation).
 */
export function registerServe(program: Command): void {
  program
    .command('serve')
    .description('Launch a localhost web dashboard for browsing and searching memories')
    .option('-p, --port <n>', 'Port', '7077')
    .option('-H, --host <host>', 'Host to bind', '127.0.0.1')
    .option('--data-dir <path>', 'Data directory override')
    .action(async (opts: Opts) => {
      const embedderType = (process.env.MNEMO_EMBEDDER === 'hash' ? 'hash' : 'onnx') as 'hash' | 'onnx';
      const m = await Mnemo.open({ dataDir: opts.dataDir, embedderType });

      const server = createServer((req, res) => void handle(req, res, m).catch(err => {
        json(res, 500, { error: (err as Error).message });
      }));

      const port = Number(opts.port);
      await new Promise<void>(r => server.listen(port, opts.host, r));
      console.log(chalk.bold('mnemo dashboard'), chalk.cyan(`http://${opts.host}:${port}`));
      console.log(chalk.dim('Ctrl-C to stop.'));

      await new Promise<void>(resolveStop => {
        const stop = async () => {
          server.close();
          await m.close();
          resolveStop();
        };
        process.on('SIGINT', stop);
        process.on('SIGTERM', stop);
      });
    });
}

async function handle(req: IncomingMessage, res: ServerResponse, m: Mnemo): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const path = url.pathname;

  if (path === '/' || path === '/index.html') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(DASHBOARD_HTML);
    return;
  }

  if (path === '/api/stats') {
    return json(res, 200, await m.stats());
  }

  if (path === '/api/recall') {
    const q = url.searchParams.get('q') ?? '';
    const k = Number(url.searchParams.get('k') ?? '10');
    const scope = (url.searchParams.get('scope') ?? 'all') as 'project' | 'global' | 'team' | 'all';
    if (!q.trim()) return json(res, 200, []);
    const hits = await m.recall(q, { k, scope });
    return json(res, 200, hits.map(h => ({
      id: h.record.id,
      score: h.score,
      similarity: h.similarity,
      content: h.record.content,
      scope: h.record.scope,
      channel: h.record.channel,
      tags: h.record.tags,
    })));
  }

  if (path === '/api/list') {
    const limit = Number(url.searchParams.get('limit') ?? '50');
    const list = await m.list({ limit });
    return json(res, 200, list);
  }

  if (path === '/api/remember' && req.method === 'POST') {
    const body = await readBody(req);
    const rec = await m.capture({
      content: String(body.content ?? ''),
      scope: body.scope === 'global' ? 'global' : 'project',
      tags: Array.isArray(body.tags) ? body.tags : [],
      channel: (body.channel as never) ?? null,
    });
    return json(res, 200, { id: rec.id });
  }

  if (path === '/api/forget' && req.method === 'POST') {
    const body = await readBody(req);
    await m.forget(String(body.id));
    return json(res, 200, { ok: true });
  }

  json(res, 404, { error: 'not found' });
}

function json(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(payload));
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise(resolve => {
    let data = '';
    req.on('data', c => (data += c));
    req.on('end', () => {
      try { resolve(JSON.parse(data || '{}')); } catch { resolve({}); }
    });
  });
}
