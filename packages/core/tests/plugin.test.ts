import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { discoverPlugins, composePlugins, pluginSpecsFromManifest, type MnemoPlugin } from '../src/plugin.js';
import { HashEmbedder } from '../src/embedder.js';
import { Mnemo } from '../src/mnemo.js';

describe('plugin discovery (v2.4)', () => {
  it('reads specs from the mnemo key and from naming-convention deps', () => {
    const specs = pluginSpecsFromManifest({
      mnemo: { plugins: ['./local-plugin.js'] },
      dependencies: { '@mnemo-mcp/plugin-cohere': '1.0.0', 'left-pad': '1.0.0' },
      devDependencies: { 'mnemo-plugin-dev': '1.0.0' },
    });
    expect(specs.sort()).toEqual(['./local-plugin.js', '@mnemo-mcp/plugin-cohere', 'mnemo-plugin-dev'].sort());
  });

  it('instantiates plugins from a default-export factory via an injected importer', async () => {
    const fakeModules: Record<string, unknown> = {
      'mnemo-plugin-a': { default: () => ({ name: 'a' } satisfies MnemoPlugin) },
      'mnemo-plugin-b': { mnemoPlugin: async () => ({ name: 'b' } satisfies MnemoPlugin) },
      'mnemo-plugin-broken': { default: () => { throw new Error('boom'); } },
    };
    const plugins = await discoverPlugins({
      plugins: ['mnemo-plugin-a', 'mnemo-plugin-b', 'mnemo-plugin-broken', 'does-not-exist'],
      importer: async spec => {
        if (!(spec in fakeModules)) throw new Error('not found');
        return fakeModules[spec];
      },
    });
    expect(plugins.map(p => p.name).sort()).toEqual(['a', 'b']); // broken + missing skipped
  });

  it('composePlugins picks the first embedder/ranker and merges rules + hooks', () => {
    const p1: MnemoPlugin = { name: 'p1', ranker: () => 1, captureRules: [{ match: () => true }] };
    const p2: MnemoPlugin = { name: 'p2', ranker: () => 2, captureRules: [{ match: () => false }], hooks: { x: () => 'hi' } };
    const composed = composePlugins([p1, p2]);
    expect(composed.ranker?.(0, {} as never, 0)).toBe(1); // p1 wins
    expect(composed.captureRules.length).toBe(2);
    expect(composed.hooks.x).toBeDefined();
  });
});

describe('plugin engine wiring (v2.4)', () => {
  let dir: string;
  afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

  it('uses a plugin-provided embedder', async () => {
    dir = mkdtempSync(join(tmpdir(), 'mnemo-plugin-emb-'));
    let used = false;
    const plugin: MnemoPlugin = {
      name: 'emb',
      embedder: () => { used = true; return new HashEmbedder({ dimension: 384 }); },
    };
    const m = await Mnemo.open({ dataDir: dir, embedderType: 'onnx', plugins: [plugin] });
    await m.capture({ content: 'plugin embedder works', scope: 'global' });
    const hits = await m.recall('plugin embedder', { scope: 'all' });
    expect(used).toBe(true);
    expect(hits.length).toBe(1);
    await m.close();
  });

  it('uses a plugin-provided ranker that inverts ordering', async () => {
    dir = mkdtempSync(join(tmpdir(), 'mnemo-plugin-rank-'));
    // Ranker that prefers LOWER similarity — proves the custom ranker is in effect.
    const plugin: MnemoPlugin = { name: 'rank', ranker: sim => 1 - sim };
    const m = await Mnemo.open({ dataDir: dir, embedderType: 'hash', plugins: [plugin] });
    await m.capture({ content: 'alpha beta gamma', scope: 'global' });
    await m.capture({ content: 'completely unrelated wording', scope: 'global' });
    const hits = await m.recall('alpha beta gamma', { scope: 'all', k: 2 });
    // With inverted ranking, the least-similar memory should sort first.
    expect(hits[0].record.content).toBe('completely unrelated wording');
    await m.close();
  });
});
