import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Mnemo } from '../src/mnemo.js';
import { validateProcedureName } from '../src/procedure.js';

describe('procedural memory (v2.0)', () => {
  let dir: string;
  let m: Mnemo;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'mnemo-proc-'));
    m = await Mnemo.open({ dataDir: dir, embedderType: 'hash' });
  });
  afterEach(async () => {
    await m.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('validateProcedureName rejects bad names', () => {
    expect(() => validateProcedureName('Add Endpoint')).toThrow();
    expect(() => validateProcedureName('add_endpoint')).toThrow();
    expect(() => validateProcedureName('')).toThrow();
    expect(() => validateProcedureName('add-endpoint')).not.toThrow();
    expect(() => validateProcedureName('a1-b2')).not.toThrow();
  });

  it('records and retrieves a procedure', async () => {
    const p = await m.recordProcedure({
      name: 'add-endpoint',
      description: 'Add a new REST API endpoint',
      steps: ['Write spec', 'Add migration', 'Implement handler', 'Write test'],
      scope: 'global',
    });
    expect(p.name).toBe('add-endpoint');
    expect(p.steps).toHaveLength(4);
    expect(p.runs).toBe(0);

    const found = await m.findProcedure('add-endpoint');
    expect(found?.steps).toEqual(p.steps);
  });

  it('updating an existing procedure preserves run stats', async () => {
    await m.recordProcedure({ name: 'p1', description: 'd', steps: ['a'], scope: 'global' });
    await m.recordProcedureOutcome('p1', true);
    await m.recordProcedureOutcome('p1', false);
    // Re-record with new steps
    const updated = await m.recordProcedure({
      name: 'p1',
      description: 'd2',
      steps: ['a', 'b'],
      scope: 'global',
    });
    expect(updated.steps).toEqual(['a', 'b']);
    expect(updated.runs).toBe(2);
    expect(updated.successes).toBe(1);
    expect(updated.failures).toBe(1);
  });

  it('refuses procedures with no steps', async () => {
    await expect(
      m.recordProcedure({ name: 'p', description: 'd', steps: [], scope: 'global' }),
    ).rejects.toThrow();
  });

  it('listProcedures returns all', async () => {
    await m.recordProcedure({ name: 'a', description: 'd', steps: ['x'], scope: 'global' });
    await m.recordProcedure({ name: 'b', description: 'd', steps: ['x'], scope: 'global' });
    const all = await m.listProcedures();
    expect(all.map(p => p.name).sort()).toEqual(['a', 'b']);
  });

  it('suggestProcedure does semantic matching', async () => {
    await m.recordProcedure({
      name: 'add-endpoint',
      description: 'Add a new REST API endpoint with full pipeline',
      steps: ['Write spec', 'Migration', 'Handler', 'Test'],
      scope: 'global',
    });
    // Hash embedder: semantic match is weak. Just verify the API works
    // with the same words; a hash-of-tokens match should hit.
    const proc = await m.suggestProcedure('Add a new REST API endpoint with full pipeline', { minScore: 0.0 });
    expect(proc?.name).toBe('add-endpoint');
  });

  it('records outcomes', async () => {
    await m.recordProcedure({ name: 'p', description: 'd', steps: ['x'], scope: 'global' });
    const after = await m.recordProcedureOutcome('p', true);
    expect(after?.runs).toBe(1);
    expect(after?.successes).toBe(1);
  });

  it('deletes a procedure', async () => {
    await m.recordProcedure({ name: 'p', description: 'd', steps: ['x'], scope: 'global' });
    expect(await m.deleteProcedure('p')).toBe(true);
    expect(await m.findProcedure('p')).toBeNull();
  });

  it('procedures show up in stats.byChannel', async () => {
    await m.recordProcedure({ name: 'p', description: 'd', steps: ['x'], scope: 'global' });
    const s = await m.stats();
    expect(s.byChannel.procedure).toBe(1);
  });
});
