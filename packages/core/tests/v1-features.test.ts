import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Mnemo, parseDuration, expiresAtFromTtl, sinceFromAgo } from '../src/index.js';

describe('v1.0 features', () => {
  let dir: string;
  let m: Mnemo;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'mnemo-v1-'));
    m = await Mnemo.open({ dataDir: dir, embedderType: 'hash' });
  });
  afterEach(async () => {
    await m.close();
    rmSync(dir, { recursive: true, force: true });
  });

  describe('duration parser', () => {
    it('parses common units', () => {
      expect(parseDuration('30s')).toBe(30_000);
      expect(parseDuration('5m')).toBe(300_000);
      expect(parseDuration('2h')).toBe(7_200_000);
      expect(parseDuration('7d')).toBe(7 * 86_400_000);
      expect(parseDuration('1w')).toBe(7 * 86_400_000);
    });
    it('returns null for invalid input', () => {
      expect(parseDuration('garbage')).toBeNull();
      expect(parseDuration('30')).toBeNull();
      expect(parseDuration('')).toBeNull();
    });
    it('expiresAtFromTtl returns null for empty', () => {
      expect(expiresAtFromTtl(undefined)).toBeNull();
      expect(expiresAtFromTtl('')).toBeNull();
    });
    it('sinceFromAgo subtracts from now', () => {
      const now = 1_000_000;
      expect(sinceFromAgo('1h', now)).toBe(now - 3_600_000);
    });
  });

  describe('TTL / expiresAt', () => {
    it('skips expired memories from recall', async () => {
      await m.capture({ content: 'fresh fact', scope: 'global' });
      await m.capture({
        content: 'expired fact',
        scope: 'global',
        expiresAt: Date.now() - 1000,
      });
      const hits = await m.recall('fact');
      const ids = hits.map(h => h.record.content);
      expect(ids).toContain('fresh fact');
      expect(ids).not.toContain('expired fact');
    });
    it('includeExpired surfaces them again', async () => {
      await m.capture({
        content: 'expired fact',
        scope: 'global',
        expiresAt: Date.now() - 1000,
      });
      const hits = await m.recall('fact', { includeExpired: true });
      expect(hits[0]!.record.content).toBe('expired fact');
    });
    it('list omits expired by default, includes with flag', async () => {
      await m.capture({ content: 'a', scope: 'global' });
      await m.capture({ content: 'b', scope: 'global', expiresAt: Date.now() - 1 });
      expect((await m.list({ scope: 'global' })).length).toBe(1);
      expect((await m.list({ scope: 'global', includeExpired: true })).length).toBe(2);
    });
    it('stats counts expired', async () => {
      await m.capture({ content: 'a', scope: 'global' });
      await m.capture({ content: 'b', scope: 'global', expiresAt: Date.now() - 1 });
      const s = await m.stats();
      expect(s.totalMemories).toBe(2);
      expect(s.expired).toBe(1);
    });
  });

  describe('smart dedup', () => {
    it('updates existing instead of inserting near-duplicate', async () => {
      const first = await m.capture({ content: 'we use Vitest, never Jest', scope: 'global' });
      expect(m.lastCaptureDeduped).toBe(false);
      const second = await m.capture({ content: 'we use Vitest, never Jest', scope: 'global' });
      expect(m.lastCaptureDeduped).toBe(true);
      expect(second.id).toBe(first.id);
      const list = await m.list({ scope: 'global' });
      expect(list.length).toBe(1);
    });
    it('honors dedupThreshold=0 to always insert', async () => {
      await m.capture({ content: 'x', scope: 'global' });
      await m.capture({ content: 'x', scope: 'global', dedupThreshold: 0 });
      expect(m.lastCaptureDeduped).toBe(false);
      const list = await m.list({ scope: 'global' });
      expect(list.length).toBe(2);
    });
    it('does not dedup across different scopes', async () => {
      await m.capture({ content: 'shared text', scope: 'global' });
      await m.capture({ content: 'shared text', scope: 'project', projectHash: 'p1' });
      const all = await m.list({});
      expect(all.length).toBe(2);
    });
  });

  describe('update()', () => {
    it('changes content and re-embeds', async () => {
      const r = await m.capture({ content: 'old content', scope: 'global' });
      const updated = await m.update(r.id, { content: 'new content' });
      expect(updated?.content).toBe('new content');
      const hits = await m.recall('new content');
      expect(hits[0]?.record.id).toBe(r.id);
    });
    it('returns null for missing id', async () => {
      expect(await m.update('nope', { content: 'x' })).toBeNull();
    });
    it('clears expiresAt with null', async () => {
      const r = await m.capture({ content: 'x', scope: 'global', expiresAt: Date.now() + 1000 });
      const updated = await m.update(r.id, { expiresAt: null });
      expect(updated?.expiresAt).toBeNull();
    });
  });

  describe('recall filters', () => {
    beforeEach(async () => {
      await m.capture({ content: 'manual fact', scope: 'global', source: 'manual', tags: ['auth'] });
      await m.capture({
        content: 'auto-edit fact',
        scope: 'global',
        source: 'auto-edit',
        tags: ['build'],
      });
      await m.capture({ content: 'imported fact', scope: 'global', source: 'imported', tags: ['auth', 'legacy'] });
    });

    it('filters by source', async () => {
      const hits = await m.recall('fact', { source: 'manual' });
      expect(hits.every(h => h.record.source === 'manual')).toBe(true);
    });
    it('filters by required tags (must have all)', async () => {
      const hits = await m.recall('fact', { tags: ['auth', 'legacy'] });
      expect(hits.length).toBe(1);
      expect(hits[0]!.record.content).toBe('imported fact');
    });
    it('filters by since', async () => {
      const future = Date.now() + 60_000;
      const hits = await m.recall('fact', { since: future });
      expect(hits.length).toBe(0);
    });
  });

  describe('prune()', () => {
    it('drops expired in non-dryRun mode', async () => {
      await m.capture({ content: 'fresh', scope: 'global' });
      await m.capture({ content: 'gone', scope: 'global', expiresAt: Date.now() - 1 });
      const result = await m.prune({});
      expect(result.expired.length).toBe(1);
      expect(result.totalDeleted).toBe(1);
      const list = await m.list({ scope: 'global', includeExpired: true });
      expect(list.length).toBe(1);
    });
    it('dryRun reports without deleting', async () => {
      await m.capture({ content: 'gone', scope: 'global', expiresAt: Date.now() - 1 });
      const result = await m.prune({ dryRun: true });
      expect(result.expired.length).toBe(1);
      expect(result.totalDeleted).toBe(0);
      const list = await m.list({ scope: 'global', includeExpired: true });
      expect(list.length).toBe(1);
    });
    it('detects and removes duplicates leaving exactly one', async () => {
      await m.capture({ content: 'duplicate text here', scope: 'global', dedupThreshold: 0 });
      await new Promise(r => setTimeout(r, 5));
      await m.capture({ content: 'duplicate text here', scope: 'global', dedupThreshold: 0 });
      const result = await m.prune({ duplicateThreshold: 0.99, expired: false });
      expect(result.totalDeleted).toBeGreaterThanOrEqual(1);
      const remaining = await m.list({ scope: 'global' });
      expect(remaining.length).toBe(1);
    });
  });
});
