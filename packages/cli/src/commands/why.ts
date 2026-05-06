import type { Command } from 'commander';
import { Mnemo } from '@mnemo-mcp/core';
import chalk from 'chalk';
import { writeJsonResult } from '../json-mode.js';

type Opts = { query?: string; dataDir?: string };

export function registerWhy(program: Command): void {
  program
    .command('why <id>')
    .description('Show why this memory exists: provenance + (with --query) full ranking breakdown for a query')
    .option('-q, --query <text>', 'Show how this memory would score against this query')
    .option('--data-dir <path>', 'Data directory override')
    .action(async (id: string, opts: Opts) => {
      const embedderType = (process.env.MNEMO_EMBEDDER === 'hash' ? 'hash' : 'onnx') as 'hash' | 'onnx';
      const m = await Mnemo.open({ dataDir: opts.dataDir, embedderType });
      try {
        const list = await m.list({ includeExpired: true });
        const r = list.find(x => x.id === id || x.id.startsWith(id));
        if (!r) {
          if (writeJsonResult({ error: 'not_found', query: id })) return;
          console.error(chalk.yellow(`no memory matches "${id}"`));
          process.exitCode = 1;
          return;
        }

        let breakdown: ReturnType<typeof m.scoreBreakdown> | undefined;
        if (opts.query) {
          const hits = await m.recall(opts.query, { k: 50, scope: 'all' });
          const hit = hits.find(h => h.record.id === r.id);
          if (hit) breakdown = m.scoreBreakdown(hit.similarity, r);
        }

        if (writeJsonResult({ record: r, breakdown })) return;

        console.log(chalk.bold('Memory'), chalk.dim(r.id));
        console.log(`  ${chalk.bold('content:')}     ${r.content}`);
        console.log(`  ${chalk.bold('scope:')}       ${r.scope}` + (r.projectHash ? chalk.dim(` (project ${r.projectHash.slice(0, 8)})`) : ''));
        console.log(`  ${chalk.bold('channel:')}     ${r.channel ?? chalk.dim('—')}`);
        console.log(`  ${chalk.bold('source:')}      ${r.source}`);
        console.log(`  ${chalk.bold('tags:')}        ${r.tags.length ? r.tags.join(', ') : chalk.dim('—')}`);
        console.log(`  ${chalk.bold('created:')}     ${new Date(r.createdAt).toISOString()}`);
        console.log(`  ${chalk.bold('updated:')}     ${new Date(r.updatedAt).toISOString()}`);
        console.log(`  ${chalk.bold('accessed:')}    ${r.accessCount} times, last ${new Date(r.lastAccessedAt).toISOString()}`);
        console.log(`  ${chalk.bold('expires:')}     ${r.expiresAt ? new Date(r.expiresAt).toISOString() : chalk.dim('never')}`);

        if (breakdown) {
          console.log('');
          console.log(chalk.bold(`Ranking against "${opts.query}":`));
          console.log(`  similarity:  ${breakdown.similarity.toFixed(4)}  × 0.7  = ${(breakdown.similarity * 0.7).toFixed(4)}`);
          console.log(`  recency:     ${breakdown.recency.toFixed(4)}  × 0.2  = ${(breakdown.recency * 0.2).toFixed(4)}`);
          console.log(`  access:      ${breakdown.accessBoost.toFixed(4)}  × 0.1  = ${(breakdown.accessBoost * 0.1).toFixed(4)}`);
          console.log(`  ${chalk.bold('composite:')}                     ${breakdown.composite.toFixed(4)}`);
        } else if (opts.query) {
          console.log(chalk.dim(`(memory was not in top 50 hits for query "${opts.query}")`));
        }
      } finally {
        await m.close();
      }
    });
}
