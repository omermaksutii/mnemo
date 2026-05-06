import type { Command } from 'commander';
import { Mnemo } from '@mnemo-mcp/core';
import chalk from 'chalk';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

type Opts = {
  dryRun: boolean;
  yes: boolean;
  noExpired: boolean;
  duplicateThreshold: string;
  minAccessCount: string;
  staleAfterDays: string;
  dataDir?: string;
};

export function registerPrune(program: Command): void {
  program
    .command('prune')
    .description('Drop expired, duplicate, or low-value memories (interactive by default)')
    .option('--dry-run', 'Show what would be pruned without deleting', false)
    .option('-y, --yes', 'Skip confirmation', false)
    .option('--no-expired', 'Do not drop expired memories')
    .option('--duplicate-threshold <n>', 'Cosine similarity above which to dedupe (0 disables)', '0.97')
    .option('--min-access-count <n>', 'Drop memories accessed fewer than this (0 = off)', '0')
    .option('--stale-after-days <n>', 'Combined with --min-access-count: drop if older AND under-accessed', '30')
    .option('--data-dir <path>', 'Data directory override')
    .action(async (opts: Opts) => {
      const embedderType = (process.env.MNEMO_EMBEDDER === 'hash' ? 'hash' : 'onnx') as 'hash' | 'onnx';
      const m = await Mnemo.open({ dataDir: opts.dataDir, embedderType });
      try {
        // Always do a dry run first to show the user
        const preview = await m.prune({
          expired: opts.noExpired ? false : true,
          duplicateThreshold: Number(opts.duplicateThreshold),
          minAccessCount: Number(opts.minAccessCount),
          staleAfterDays: Number(opts.staleAfterDays),
          dryRun: true,
        });

        const totalCandidates =
          preview.expired.length + preview.duplicates.length + preview.stale.length;

        if (totalCandidates === 0) {
          console.log(chalk.green('nothing to prune'));
          return;
        }

        if (preview.expired.length) {
          console.log(chalk.bold(`expired: ${preview.expired.length}`));
          preview.expired.slice(0, 5).forEach(r => console.log('  ', chalk.dim(r.id.slice(0, 8)), r.content.slice(0, 80)));
          if (preview.expired.length > 5) console.log(chalk.dim(`  …and ${preview.expired.length - 5} more`));
        }
        if (preview.duplicates.length) {
          console.log(chalk.bold(`duplicates: ${preview.duplicates.length}`));
          preview.duplicates.slice(0, 5).forEach(d =>
            console.log('  ', chalk.dim(d.dropped.id.slice(0, 8)), '→ kept', chalk.dim(d.kept.id.slice(0, 8)), '·', d.dropped.content.slice(0, 60)),
          );
          if (preview.duplicates.length > 5) console.log(chalk.dim(`  …and ${preview.duplicates.length - 5} more`));
        }
        if (preview.stale.length) {
          console.log(chalk.bold(`stale (low-access + old): ${preview.stale.length}`));
          preview.stale.slice(0, 5).forEach(r => console.log('  ', chalk.dim(r.id.slice(0, 8)), r.content.slice(0, 80)));
          if (preview.stale.length > 5) console.log(chalk.dim(`  …and ${preview.stale.length - 5} more`));
        }

        if (opts.dryRun) {
          console.log(chalk.dim(`(dry run — pass --yes or omit --dry-run to delete ${totalCandidates})`));
          return;
        }

        if (!opts.yes) {
          if (!stdin.isTTY) {
            console.log(chalk.yellow('non-interactive: pass --yes to confirm'));
            return;
          }
          const rl = createInterface({ input: stdin, output: stdout });
          const ans = await rl.question(chalk.yellow(`Delete ${totalCandidates} memories? [y/N] `));
          rl.close();
          if (ans.trim().toLowerCase() !== 'y') {
            console.log(chalk.dim('cancelled'));
            return;
          }
        }

        const result = await m.prune({
          expired: opts.noExpired ? false : true,
          duplicateThreshold: Number(opts.duplicateThreshold),
          minAccessCount: Number(opts.minAccessCount),
          staleAfterDays: Number(opts.staleAfterDays),
          dryRun: false,
        });
        console.log(chalk.green('pruned'), result.totalDeleted, 'memories');
      } finally {
        await m.close();
      }
    });
}
