import type { Command } from 'commander';
import { readFile } from 'node:fs/promises';
import { Mnemo } from '@mnemo-mcp/core';
import chalk from 'chalk';

type Opts = { dataDir?: string };

export function registerImport(program: Command): void {
  program
    .command('import <file>')
    .description('Import memories from a JSON file')
    .option('--data-dir <path>', 'Data directory override')
    .action(async (file: string, opts: Opts) => {
      const embedderType = (process.env.MNEMO_EMBEDDER === 'hash' ? 'hash' : 'onnx') as 'hash' | 'onnx';
      const m = await Mnemo.open({ dataDir: opts.dataDir, embedderType });
      try {
        const raw = await readFile(file, 'utf8');
        const records = JSON.parse(raw);
        await m.import(records);
        console.log(chalk.green('imported'), records.length, 'memories');
      } finally {
        await m.close();
      }
    });
}
