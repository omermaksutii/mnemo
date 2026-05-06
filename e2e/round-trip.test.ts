import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Mnemo } from '@mnemo/core';

const RUN = process.env.MNEMO_E2E === '1';
const d = RUN ? describe : describe.skip;

d('Mnemo end-to-end with real embeddings', () => {
  it('captures and recalls semantically related queries', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mnemo-e2e-'));
    try {
      const m = await Mnemo.open({ dataDir: dir, embedderType: 'onnx' });
      await m.capture({ content: 'we use Vitest, never Jest, for all tests', scope: 'global' });
      await m.capture({ content: 'database migrations live in src/db/migrations', scope: 'global' });
      await m.capture({ content: 'OAuth tokens refresh every 30 minutes', scope: 'global' });

      const hits = await m.recall('which test framework do we use?');
      expect(hits[0]!.record.content).toMatch(/Vitest/);

      const hits2 = await m.recall('where do schema changes go?');
      expect(hits2[0]!.record.content).toMatch(/migrations/);

      await m.close();

      // Reopen and confirm persistence
      const m2 = await Mnemo.open({ dataDir: dir, embedderType: 'onnx' });
      const persisted = await m2.recall('test framework');
      expect(persisted[0]!.record.content).toMatch(/Vitest/);
      await m2.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 240_000);
});
