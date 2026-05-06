import type { Command } from 'commander';
import { Mnemo } from '@mnemo/core';
import { formatStats } from '../output.js';

type Opts = { dataDir?: string };

export function registerStats(program: Command): void {
  program
    .command('stats')
    .description('Show storage and index stats')
    .option('--data-dir <path>', 'Data directory override')
    .action(async (opts: Opts) => {
      const embedderType = (process.env.MNEMO_EMBEDDER === 'hash' ? 'hash' : 'onnx') as 'hash' | 'onnx';
      const m = await Mnemo.open({ dataDir: opts.dataDir, embedderType });
      try {
        console.log(formatStats(await m.stats()));
      } finally {
        await m.close();
      }
    });
}
