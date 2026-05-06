import type { Command } from 'commander';
import { Mnemo } from '@mnemo-mcp/core';
import chalk from 'chalk';
import { writeJsonResult } from '../json-mode.js';

type Opts = { dataDir?: string };

export function registerForget(program: Command): void {
  program
    .command('forget <id>')
    .description('Delete a memory by id (full or 8-char prefix)')
    .option('--data-dir <path>', 'Data directory override')
    .action(async (id: string, opts: Opts) => {
      const embedderType = (process.env.MNEMO_EMBEDDER === 'hash' ? 'hash' : 'onnx') as 'hash' | 'onnx';
      const m = await Mnemo.open({ dataDir: opts.dataDir, embedderType });
      try {
        const candidates = await m.list({ includeExpired: true });
        const match = candidates.find(r => r.id === id || r.id.startsWith(id));
        if (!match) {
          if (writeJsonResult({ error: 'not_found', query: id })) return;
          console.log(chalk.yellow(`no memory matches "${id}"`));
          process.exitCode = 1;
          return;
        }
        await m.forget(match.id);
        if (writeJsonResult({ forgotten: match.id })) return;
        console.log(chalk.green('forgotten'), chalk.dim(match.id.slice(0, 8)));
      } finally {
        await m.close();
      }
    });
}
