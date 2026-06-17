import type { Command } from 'commander';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Mnemo } from '@mnemo-mcp/core';
import chalk from 'chalk';
import { writeJsonResult } from '../json-mode.js';

type Opts = { out?: string; dataDir?: string };

/**
 * `mnemo backup` — a first-class, friendlier wrapper over `export`. Writes a
 * timestamped snapshot to ./mnemo-backups/ by default so users get a sensible
 * filename without thinking about it.
 */
export function registerBackup(program: Command): void {
  program
    .command('backup')
    .description('Snapshot all memories to a timestamped JSON file')
    .option('-o, --out <file>', 'Output file (default: ./mnemo-backups/mnemo-<date>.json)')
    .option('--data-dir <path>', 'Data directory override')
    .action(async (opts: Opts) => {
      const embedderType = (process.env.MNEMO_EMBEDDER === 'hash' ? 'hash' : 'onnx') as 'hash' | 'onnx';
      const m = await Mnemo.open({ dataDir: opts.dataDir, embedderType });
      try {
        const dump = await m.export();
        const out = opts.out ?? join('mnemo-backups', `mnemo-${stamp()}.json`);
        await mkdir(dirname(out), { recursive: true });
        await writeFile(out, JSON.stringify({ version: 1, exportedAt: Date.now(), memories: dump }, null, 2));
        if (writeJsonResult({ out, count: dump.length })) return;
        console.log(chalk.green('backed up'), dump.length, 'memories →', out);
      } finally {
        await m.close();
      }
    });
}

function stamp(): string {
  // YYYY-MM-DDTHH-MM-SS in local time, filesystem-safe.
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}
