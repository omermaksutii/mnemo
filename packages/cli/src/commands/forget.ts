import type { Command } from 'commander';
import { Mnemo } from '@mnemo-mcp/core';
import chalk from 'chalk';

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
        const candidates = await m.list({});
        const match = candidates.find(r => r.id === id || r.id.startsWith(id));
        if (!match) {
          console.log(chalk.yellow(`no memory matches "${id}"`));
          return;
        }
        await m.forget(match.id);
        console.log(chalk.green('forgotten'), chalk.dim(match.id.slice(0, 8)));
      } finally {
        await m.close();
      }
    });
}
