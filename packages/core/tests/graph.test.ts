import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Mnemo } from '../src/mnemo.js';

describe('knowledge graph (v2.1)', () => {
  let dir: string;
  let m: Mnemo;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'mnemo-graph-'));
    m = await Mnemo.open({ dataDir: dir, embedderType: 'hash' });
  });
  afterEach(async () => {
    await m.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('creates and updates entities idempotently by name', async () => {
    const a = await m.createEntity({ name: 'AuthService', type: 'service', scope: 'global' });
    const b = await m.createEntity({ name: 'AuthService', description: 'handles login', scope: 'global' });
    expect(b.id).toBe(a.id); // same entity updated, not duplicated
    expect(b.type).toBe('service'); // preserved
    expect(b.description).toBe('handles login'); // updated
    const list = await m.listEntities({ scope: 'global' });
    expect(list.length).toBe(1);
  });

  it('links entities and surfaces them in entityContext', async () => {
    await m.relate('Billing', 'requires', 'AuthService', { scope: 'global' });
    const ctx = await m.entityContext('AuthService', 'global');
    expect(ctx).not.toBeNull();
    const inbound = ctx!.relations.find(r => r.direction === 'in');
    expect(inbound?.entity.name).toBe('Billing');
    expect(inbound?.relation.kind).toBe('requires');
  });

  it('attaches memories and entityContext returns them', async () => {
    const rec = await m.capture({ content: 'AuthService uses JWT with 1h expiry', scope: 'global' });
    await m.attachMemory(rec.id, 'AuthService', { scope: 'global' });
    const ctx = await m.entityContext('AuthService', 'global');
    expect(ctx!.memories.map(x => x.id)).toContain(rec.id);
  });

  it('recall surfaces linked entities when includeEntities is set', async () => {
    const rec = await m.capture({ content: 'token rotation policy for the gateway', scope: 'global' });
    await m.attachMemory(rec.id, 'Gateway', { scope: 'global' });
    const hits = await m.recall('token rotation', { scope: 'all', includeEntities: true });
    expect(hits[0].entities?.some(e => e.name === 'Gateway')).toBe(true);
  });

  it('whatDependsOn does a transitive BFS over requires/uses', async () => {
    // Web --uses--> Billing --requires--> AuthService
    await m.relate('Billing', 'requires', 'AuthService', { scope: 'global' });
    await m.relate('Web', 'uses', 'Billing', { scope: 'global' });
    const deps = await m.whatDependsOn('AuthService', 'global');
    const names = deps.map(d => d.name).sort();
    expect(names).toEqual(['Billing', 'Web']);
  });

  it('deleting an entity removes its relations', async () => {
    await m.relate('Billing', 'requires', 'AuthService', { scope: 'global' });
    expect(await m.deleteEntity('AuthService', 'global')).toBe(true);
    const ctx = await m.entityContext('Billing', 'global');
    expect(ctx!.relations.length).toBe(0);
  });

  it('persists the graph across reopen', async () => {
    await m.relate('Billing', 'requires', 'AuthService', { scope: 'global' });
    await m.close();
    m = await Mnemo.open({ dataDir: dir, embedderType: 'hash' });
    const deps = await m.whatDependsOn('AuthService', 'global');
    expect(deps.map(d => d.name)).toContain('Billing');
  });
});
