import type { Command } from 'commander';
import { Mnemo } from '@mnemo-mcp/core';
import { formatStats } from '../output.js';
import { writeJsonResult } from '../json-mode.js';

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
        const s = await m.stats();
        if (writeJsonResult(s)) return;
        console.log(formatStats(s));
      } finally {
        await m.close();
      }
    });
}
