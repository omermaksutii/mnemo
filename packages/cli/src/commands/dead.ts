import type { Command } from 'commander';
import { Mnemo, parseDuration } from '@mnemo-mcp/core';
import chalk from 'chalk';
import { writeJsonResult } from '../json-mode.js';

type Opts = { olderThan: string; dataDir?: string };

export function registerDead(program: Command): void {
  program
    .command('dead')
    .description('List memories that have never been recalled (candidates for prune)')
    .option('--older-than <duration>', 'Only show memories older than this', '7d')
    .option('--data-dir <path>', 'Data directory override')
    .action(async (opts: Opts) => {
      const embedderType = (process.env.MNEMO_EMBEDDER === 'hash' ? 'hash' : 'onnx') as 'hash' | 'onnx';
      const m = await Mnemo.open({ dataDir: opts.dataDir, embedderType });
      try {
        const olderMs = parseDuration(opts.olderThan);
        const days = olderMs !== null ? Math.floor(olderMs / 86400_000) : 7;
        const dead = await m.dead({ olderThanDays: days });
        if (writeJsonResult(dead.map(r => ({ id: r.id, content: r.content, scope: r.scope, channel: r.channel, age_days: Math.floor((Date.now() - r.createdAt) / 86400_000) })))) return;

        if (dead.length === 0) {
          console.log(chalk.green(`no never-recalled memories older than ${opts.olderThan}`));
          return;
        }
        console.log(chalk.bold(`${dead.length} never-recalled, older than ${opts.olderThan}:`));
        for (const r of dead) {
          const age = Math.floor((Date.now() - r.createdAt) / 86400_000);
          console.log(`  ${chalk.dim(r.id.slice(0, 8))}  ${chalk.yellow(`${age}d`)}  ${r.content.slice(0, 80)}`);
        }
        console.log('');
        console.log(chalk.dim(`run \`mnemo prune --min-access-count 1 --stale-after-days ${days}\` to clean these up`));
      } finally {
        await m.close();
      }
    });
}
