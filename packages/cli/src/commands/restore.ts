import type { Command } from 'commander';
import { readFile } from 'node:fs/promises';
import { Mnemo, type MemoryRecord } from '@mnemo-mcp/core';
import chalk from 'chalk';
import { writeJsonResult } from '../json-mode.js';

type Opts = { dataDir?: string };

/**
 * `mnemo restore <file>` — first-class wrapper over `import`. Accepts both the
 * raw `export` array format and the `backup` envelope `{ memories: [...] }`.
 */
export function registerRestore(program: Command): void {
  program
    .command('restore <file>')
    .description('Restore memories from a backup or export file')
    .option('--data-dir <path>', 'Data directory override')
    .action(async (file: string, opts: Opts) => {
      const embedderType = (process.env.MNEMO_EMBEDDER === 'hash' ? 'hash' : 'onnx') as 'hash' | 'onnx';
      const m = await Mnemo.open({ dataDir: opts.dataDir, embedderType });
      try {
        const raw = await readFile(file, 'utf8');
        const parsed = JSON.parse(raw);
        const records: MemoryRecord[] = Array.isArray(parsed) ? parsed : parsed.memories;
        if (!Array.isArray(records)) {
          throw new Error('unrecognized backup format: expected an array or { memories: [...] }');
        }
        await m.import(records);
        if (writeJsonResult({ restored: records.length, file })) return;
        console.log(chalk.green('restored'), records.length, 'memories from', file);
      } finally {
        await m.close();
      }
    });
}
