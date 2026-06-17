import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startSyncServer, type SyncServerHandle } from '../src/server.js';

describe('mnemo sync server', () => {
  let dir: string;
  let h: SyncServerHandle;
  let base: string;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'mnemo-sync-srv-'));
    h = await startSyncServer({ dir, token: 'secret' });
    base = `http://127.0.0.1:${h.port}`;
  });
  afterEach(async () => {
    await h.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const auth = { authorization: 'Bearer secret' };

  it('serves health without auth', async () => {
    const res = await fetch(`${base}/v1/health`);
    expect(res.ok).toBe(true);
    expect(await res.json()).toMatchObject({ ok: true, e2e: true });
  });

  it('rejects unauthorized requests', async () => {
    const res = await fetch(`${base}/v1/blobs/alice`, { method: 'GET' });
    expect(res.status).toBe(401);
  });

  it('round-trips a blob via PUT then GET', async () => {
    const payload = new Uint8Array([1, 2, 3, 4, 250]);
    const put = await fetch(`${base}/v1/blobs/alice`, { method: 'PUT', headers: auth, body: payload });
    expect(put.ok).toBe(true);
    const get = await fetch(`${base}/v1/blobs/alice`, { headers: auth });
    expect(get.ok).toBe(true);
    const got = new Uint8Array(await get.arrayBuffer());
    expect([...got]).toEqual([...payload]);
  });

  it('404s an unknown namespace and HEAD reflects existence', async () => {
    expect((await fetch(`${base}/v1/blobs/ghost`, { headers: auth })).status).toBe(404);
    expect((await fetch(`${base}/v1/blobs/ghost`, { method: 'HEAD', headers: auth })).status).toBe(404);
    await fetch(`${base}/v1/blobs/ghost`, { method: 'PUT', headers: auth, body: new Uint8Array([9]) });
    expect((await fetch(`${base}/v1/blobs/ghost`, { method: 'HEAD', headers: auth })).status).toBe(200);
  });

  it('rejects invalid namespaces', async () => {
    const res = await fetch(`${base}/v1/blobs/has%20space`, { method: 'PUT', headers: auth, body: new Uint8Array([1]) });
    expect(res.status).toBe(400);
  });

  it('deletes a blob', async () => {
    await fetch(`${base}/v1/blobs/bob`, { method: 'PUT', headers: auth, body: new Uint8Array([7]) });
    expect((await fetch(`${base}/v1/blobs/bob`, { method: 'DELETE', headers: auth })).ok).toBe(true);
    expect((await fetch(`${base}/v1/blobs/bob`, { headers: auth })).status).toBe(404);
  });
});
