import { describe, it, expect } from 'vitest';
import { resolveDataDir, projectHashOf, paths } from '../src/paths.js';
import { homedir } from 'node:os';
import { join } from 'node:path';

describe('paths', () => {
  it('defaults to ~/.mnemo when no override given', () => {
    const orig = process.env.MNEMO_DATA_DIR;
    delete process.env.MNEMO_DATA_DIR;
    try {
      expect(resolveDataDir()).toBe(join(homedir(), '.mnemo'));
    } finally {
      if (orig !== undefined) process.env.MNEMO_DATA_DIR = orig;
    }
  });

  it('honors explicit override', () => {
    expect(resolveDataDir('/tmp/custom')).toBe('/tmp/custom');
  });

  it('honors MNEMO_DATA_DIR env var', () => {
    const orig = process.env.MNEMO_DATA_DIR;
    process.env.MNEMO_DATA_DIR = '/tmp/from-env';
    try {
      expect(resolveDataDir()).toBe('/tmp/from-env');
    } finally {
      if (orig === undefined) delete process.env.MNEMO_DATA_DIR;
      else process.env.MNEMO_DATA_DIR = orig;
    }
  });

  it('builds subpaths', () => {
    const p = paths('/tmp/m');
    expect(p.dataDir).toBe('/tmp/m');
    expect(p.dbFile).toBe('/tmp/m/memory.db');
    expect(p.indexFile).toBe('/tmp/m/hnsw.bin');
    expect(p.modelDir).toBe('/tmp/m/model');
    expect(p.configFile).toBe('/tmp/m/config.json');
  });

  it('hashes a project path deterministically', () => {
    const a = projectHashOf('/some/repo');
    const b = projectHashOf('/some/repo');
    expect(a).toBe(b);
    expect(a).toHaveLength(16);
  });

  it('produces different hashes for different paths', () => {
    expect(projectHashOf('/a')).not.toBe(projectHashOf('/b'));
  });
});
