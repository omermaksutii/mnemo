import type { Command } from 'commander';
import { Mnemo } from '@mnemo/core';
import chalk from 'chalk';
import { formatRecord } from '../output.js';

type Opts = { scope: string; limit: string; dataDir?: string };

export function registerList(program: Command): void {
  program
    .command('list')
    .description('List memories (most recent first)')
    .option('-s, --scope <scope>', 'project | global', 'global')
    .option('-l, --limit <n>', 'Max records to show', '20')
    .option('--data-dir <path>', 'Data directory override')
    .action(async (opts: Opts) => {
      const embedderType = (process.env.MNEMO_EMBEDDER === 'hash' ? 'hash' : 'onnx') as 'hash' | 'onnx';
      const m = await Mnemo.open({ dataDir: opts.dataDir, embedderType });
      try {
        const list = await m.list({
          scope: opts.scope as 'project' | 'global',
          limit: Number(opts.limit),
        });
        if (list.length === 0) {
          console.log(chalk.dim('no memories yet — try `mnemo remember "..."`'));
          return;
        }
        for (const r of list) console.log(formatRecord(r));
      } finally {
        await m.close();
      }
    });
}
