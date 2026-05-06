import type { Command } from 'commander';
import { Mnemo, projectHashOf, sinceFromAgo, type MemorySource } from '@omermaksutii/mnemo-core';
import chalk from 'chalk';
import { formatHit } from '../output.js';

type Opts = {
  top: string;
  scope: string;
  minScore: string;
  tag?: string;
  source?: string;
  since?: string;
  includeExpired: boolean;
  dataDir?: string;
};

const SOURCES = ['manual', 'auto-edit', 'auto-task', 'imported'] as const;

export function registerRecall(program: Command): void {
  program
    .command('recall <query...>')
    .description('Semantic search across memories')
    .option('-k, --top <n>', 'Number of hits', '5')
    .option('-s, --scope <scope>', 'project | global | all', 'all')
    .option('--min-score <n>', 'Minimum composite score', '0')
    .option('--tag <tags>', 'Comma-separated tags (memory must have ALL)')
    .option('--source <sources>', `Comma-separated sources (${SOURCES.join('|')})`)
    .option('--since <duration>', 'Only memories updated within (e.g. 7d, 24h, 30m)')
    .option('--include-expired', 'Include expired memories', false)
    .option('--data-dir <path>', 'Data directory override')
    .action(async (queryParts: string[], opts: Opts) => {
      const query = queryParts.join(' ');
      const embedderType = (process.env.MNEMO_EMBEDDER === 'hash' ? 'hash' : 'onnx') as 'hash' | 'onnx';
      const m = await Mnemo.open({ dataDir: opts.dataDir, embedderType });
      try {
        const projectHash = opts.scope === 'project' ? projectHashOf(process.cwd()) : undefined;
        const tags = opts.tag ? opts.tag.split(',').map(t => t.trim()).filter(Boolean) : undefined;
        const source = opts.source
          ? (opts.source.split(',').map(s => s.trim()).filter(Boolean) as MemorySource[])
          : undefined;
        const since = sinceFromAgo(opts.since);
        const hits = await m.recall(query, {
          k: Number(opts.top),
          scope: opts.scope as 'project' | 'global' | 'all',
          projectHash,
          minScore: Number(opts.minScore),
          tags,
          source,
          since,
          includeExpired: opts.includeExpired,
        });
        if (hits.length === 0) {
          console.log(chalk.yellow('no matching memories'));
          return;
        }
        for (const h of hits) console.log(formatHit(h));
      } finally {
        await m.close();
      }
    });
}
