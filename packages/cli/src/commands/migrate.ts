import type { Command } from 'commander';
import { Mnemo } from '@mnemo-mcp/core';
import chalk from 'chalk';
import { writeJsonResult } from '../json-mode.js';

type Opts = { dataDir?: string };

/**
 * `mnemo migrate` — rebuild the vector index from the database with the current
 * embedder. Run this after changing embedders (hash ↔ onnx), upgrading the model
 * (embedding-dimension change), or if the index ever falls out of sync with the
 * store. The schema itself auto-migrates on open; this fixes the vector side.
 */
export function registerMigrate(program: Command): void {
  program
    .command('migrate')
    .description('Rebuild the vector index from the database (after embedder/schema changes)')
    .option('--data-dir <path>', 'Data directory override')
    .action(async (opts: Opts) => {
      const embedderType = (process.env.MNEMO_EMBEDDER === 'hash' ? 'hash' : 'onnx') as 'hash' | 'onnx';
      const m = await Mnemo.open({ dataDir: opts.dataDir, embedderType });
      try {
        const count = await m.reindex();
        if (writeJsonResult({ reindexed: count, embedder: embedderType })) return;
        console.log(chalk.green('reindexed'), count, 'memories with the', chalk.cyan(embedderType), 'embedder');
      } finally {
        await m.close();
      }
    });
}
