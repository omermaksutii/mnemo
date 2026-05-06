import type { Command } from 'commander';
import { Mnemo, projectHashOf } from '@mnemo/core';
import chalk from 'chalk';
import { formatHit } from '../output.js';

type Opts = { top: string; scope: string; minScore: string; dataDir?: string };

export function registerRecall(program: Command): void {
  program
    .command('recall <query...>')
    .description('Semantic search across memories')
    .option('-k, --top <n>', 'Number of hits', '5')
    .option('-s, --scope <scope>', 'project | global | all', 'all')
    .option('--min-score <n>', 'Minimum composite score', '0')
    .option('--data-dir <path>', 'Data directory override')
    .action(async (queryParts: string[], opts: Opts) => {
      const query = queryParts.join(' ');
      const embedderType = (process.env.MNEMO_EMBEDDER === 'hash' ? 'hash' : 'onnx') as 'hash' | 'onnx';
      const m = await Mnemo.open({ dataDir: opts.dataDir, embedderType });
      try {
        const projectHash = opts.scope === 'project' ? projectHashOf(process.cwd()) : undefined;
        const hits = await m.recall(query, {
          k: Number(opts.top),
          scope: opts.scope as 'project' | 'global' | 'all',
          projectHash,
          minScore: Number(opts.minScore),
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
