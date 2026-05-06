import type { Command } from 'commander';
import { writeFile } from 'node:fs/promises';
import { Mnemo } from '@omermaksutii/mnemo-core';
import chalk from 'chalk';

type Opts = { out: string; dataDir?: string };

export function registerExport(program: Command): void {
  program
    .command('export')
    .description('Export all memories to a JSON file')
    .requiredOption('-o, --out <file>', 'Output file path')
    .option('--data-dir <path>', 'Data directory override')
    .action(async (opts: Opts) => {
      const embedderType = (process.env.MNEMO_EMBEDDER === 'hash' ? 'hash' : 'onnx') as 'hash' | 'onnx';
      const m = await Mnemo.open({ dataDir: opts.dataDir, embedderType });
      try {
        const dump = await m.export();
        await writeFile(opts.out, JSON.stringify(dump, null, 2));
        console.log(chalk.green('exported'), dump.length, 'memories →', opts.out);
      } finally {
        await m.close();
      }
    });
}
