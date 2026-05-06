import type { Command } from 'commander';
import { Mnemo, sinceFromAgo } from '@mnemo-mcp/core';
import chalk from 'chalk';
import { writeJsonResult } from '../json-mode.js';

type Opts = { since: string; dataDir?: string };

export function registerDigest(program: Command): void {
  program
    .command('digest')
    .description('Summary of recent activity: captures, top-recalled, never-recalled candidates')
    .option('--since <duration>', 'Period to summarize over', '7d')
    .option('--data-dir <path>', 'Data directory override')
    .action(async (opts: Opts) => {
      const embedderType = (process.env.MNEMO_EMBEDDER === 'hash' ? 'hash' : 'onnx') as 'hash' | 'onnx';
      const m = await Mnemo.open({ dataDir: opts.dataDir, embedderType });
      try {
        const since = sinceFromAgo(opts.since) ?? Date.now() - 7 * 86400_000;
        const all = await m.list({ includeExpired: true });
        const captured = all.filter(r => r.createdAt >= since);
        const accessed = all.filter(r => r.lastAccessedAt >= since && r.accessCount > 0);
        const topAccessed = [...all]
          .filter(r => r.accessCount > 0)
          .sort((a, b) => b.accessCount - a.accessCount)
          .slice(0, 5);
        const dead = all.filter(r => r.accessCount === 0 && r.createdAt < since);
        const stats = await m.stats();

        if (writeJsonResult({
          since,
          captured: captured.length,
          accessed: accessed.length,
          top_accessed: topAccessed.map(r => ({ id: r.id, content: r.content, accessCount: r.accessCount })),
          never_recalled: dead.length,
          totals: stats,
        })) return;

        console.log(chalk.bold(`📊 Mnemo digest — last ${opts.since}`));
        console.log('');
        console.log(`${chalk.bold('captured:')}        ${captured.length}`);
        console.log(`${chalk.bold('recalled:')}        ${accessed.length}`);
        console.log(`${chalk.bold('total memories:')}  ${stats.totalMemories} (${stats.expired} expired)`);
        console.log('');
        if (topAccessed.length) {
          console.log(chalk.bold('top recalled:'));
          for (const r of topAccessed) {
            console.log(`  ${chalk.cyan(r.accessCount)}× ${chalk.dim(r.id.slice(0, 8))} ${r.content.slice(0, 70)}`);
          }
          console.log('');
        }
        if (dead.length) {
          console.log(chalk.dim(`${dead.length} memories never recalled (older than ${opts.since}). Run \`mnemo dead\` for details or \`mnemo prune\` to clean up.`));
        }
      } finally {
        await m.close();
      }
    });
}
