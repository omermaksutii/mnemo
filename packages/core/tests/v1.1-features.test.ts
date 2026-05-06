import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  Mnemo,
  SecretContentError,
  detectSecrets,
  hasSecrets,
  parseMarkdown,
  parsePlain,
  CHANNELS,
} from '../src/index.js';

describe('v1.1 features', () => {
  let dir: string;
  let m: Mnemo;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'mnemo-v11-'));
    m = await Mnemo.open({ dataDir: dir, embedderType: 'hash' });
  });
  afterEach(async () => {
    await m.close();
    rmSync(dir, { recursive: true, force: true });
  });

  describe('channels', () => {
    it('exposes the canonical channel list', () => {
      expect(CHANNELS).toEqual(['decision', 'convention', 'gotcha', 'todo', 'anti-pattern', 'note']);
    });

    it('captures and recalls by channel', async () => {
      await m.capture({ content: 'use OAuth2', scope: 'global', channel: 'decision' });
      await m.capture({ content: 'lint warning is fine', scope: 'global', channel: 'note' });
      const decisions = await m.recall('OAuth', { channel: 'decision' });
      expect(decisions.every(h => h.record.channel === 'decision')).toBe(true);
      expect(decisions[0]?.record.content).toMatch(/OAuth2/);
    });

    it('list filters by channel', async () => {
      await m.capture({ content: 'a', scope: 'global', channel: 'convention' });
      await m.capture({ content: 'b', scope: 'global', channel: 'gotcha' });
      const conventions = await m.list({ channel: 'convention' });
      expect(conventions.length).toBe(1);
      expect(conventions[0]?.content).toBe('a');
    });

    it('stats include byChannel breakdown', async () => {
      await m.capture({ content: 'a', scope: 'global', channel: 'decision' });
      await m.capture({ content: 'b', scope: 'global', channel: 'decision' });
      await m.capture({ content: 'c', scope: 'global', channel: 'gotcha' });
      const s = await m.stats();
      expect(s.byChannel.decision).toBe(2);
      expect(s.byChannel.gotcha).toBe(1);
    });
  });

  describe('secret guard', () => {
    it('detects common token formats', () => {
      expect(hasSecrets('here is my token ghp_AbCdEfGhIjKlMnOpQrStUvWxYzAbCdEfGhIj')).toBe(true);
      expect(hasSecrets('npm token: npm_AbCdEfGhIjKlMnOpQrStUvWxYzAbCdEfGhIjAb')).toBe(true);
      expect(hasSecrets('AKIAIOSFODNN7EXAMPLE')).toBe(true);
      expect(hasSecrets('plain text without secrets')).toBe(false);
    });

    it('redacts in detection output', () => {
      const matches = detectSecrets('ghp_AbCdEfGhIjKlMnOpQrStUvWxYzAbCdEfGhIj');
      expect(matches.length).toBe(1);
      expect(matches[0]?.preview).not.toContain('AbCdEfGhIjKlMnOpQrStUvWxYzAbCdEfGhIj');
      expect(matches[0]?.kind).toBe('github-token-classic');
    });

    it('Mnemo.capture refuses sensitive content by default', async () => {
      await expect(
        m.capture({ content: 'secret: ghp_AbCdEfGhIjKlMnOpQrStUvWxYzAbCdEfGhIj', scope: 'global' }),
      ).rejects.toBeInstanceOf(SecretContentError);
      const list = await m.list({});
      expect(list.length).toBe(0);
    });

    it('allowSensitive bypass works', async () => {
      const r = await m.capture({
        content: 'this contains ghp_AbCdEfGhIjKlMnOpQrStUvWxYzAbCdEfGhIj',
        scope: 'global',
        allowSensitive: true,
      });
      expect(r.id).toBeTruthy();
    });
  });

  describe('ingest parsers', () => {
    it('parseMarkdown splits on headings + bullets', () => {
      const md = `# Project conventions

We use Vitest, never Jest.

## Auth

- OAuth2 with refresh tokens every 30 minutes
- Never store passwords in plain text
- Always rotate API keys quarterly

## Database

Migrations live in src/db/migrations.`;
      const chunks = parseMarkdown(md);
      const contents = chunks.map(c => c.content);
      expect(contents).toContain('We use Vitest, never Jest.');
      expect(contents).toContain('OAuth2 with refresh tokens every 30 minutes');
      expect(contents).toContain('Migrations live in src/db/migrations.');
      expect(chunks.length).toBeGreaterThanOrEqual(5);
    });

    it('parsePlain splits on blank lines', () => {
      const text = `First paragraph.\n\nSecond paragraph.\n\nThird here.`;
      expect(parsePlain(text).length).toBe(3);
    });

    it('inferred channels are reasonable', () => {
      const chunks = parseMarkdown('# x\n\nWe always use Vitest.\n\nWarning: never delete this file.');
      const conv = chunks.find(c => c.content.includes('Vitest'));
      const gotcha = chunks.find(c => c.content.includes('Warning'));
      expect(conv?.channel).toBe('convention');
      expect(gotcha?.channel).toBe('gotcha');
    });
  });

  describe('Mnemo.dead', () => {
    it('returns memories with accessCount = 0 older than threshold', async () => {
      const fresh = await m.capture({ content: 'fresh', scope: 'global' });
      void fresh;
      // Simulate aging by accessing one and not the other
      await m.recall('fresh');
      const dead = await m.dead({ olderThanDays: 0 });
      expect(dead.length).toBe(0); // the one was just recalled
    });

    it('lists never-recalled when olderThanDays not set', async () => {
      await m.capture({ content: 'orphan', scope: 'global' });
      const dead = await m.dead();
      expect(dead.length).toBe(1);
      expect(dead[0]?.content).toBe('orphan');
    });
  });

  describe('Mnemo.scoreBreakdown', () => {
    it('returns the four components', async () => {
      const r = await m.capture({ content: 'x', scope: 'global' });
      const b = m.scoreBreakdown(0.5, r);
      expect(b.similarity).toBe(0.5);
      expect(b.recency).toBeGreaterThan(0);
      expect(b.accessBoost).toBeGreaterThanOrEqual(0);
      expect(b.composite).toBeGreaterThan(0);
    });
  });
});
