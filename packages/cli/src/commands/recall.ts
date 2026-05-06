import type { Command } from 'commander';
import { Mnemo, projectHashOf, sinceFromAgo, CHANNELS, type MemorySource, type MemoryChannel } from '@mnemo-mcp/core';
import chalk from 'chalk';
import { formatHit } from '../output.js';
import { interactiveRecall } from '../interactive.js';
import { writeJsonResult } from '../json-mode.js';

type Opts = {
  top: string;
  scope: string;
  minScore: string;
  tag?: string;
  source?: string;
  channel?: string;
  since?: string;
  includeExpired: boolean;
  interactive: boolean;
  dataDir?: string;
};

const SOURCES = ['manual', 'auto-edit', 'auto-task', 'imported', 'team-sync'] as const;

export function registerRecall(program: Command): void {
  program
    .command('recall <query...>')
    .description('Semantic search across memories')
    .option('-k, --top <n>', 'Number of hits', '5')
    .option('-s, --scope <scope>', 'project | global | team | all', 'all')
    .option('--min-score <n>', 'Minimum composite score', '0')
    .option('--tag <tags>', 'Comma-separated tags (memory must have ALL)')
    .option('--source <sources>', `Comma-separated sources (${SOURCES.join('|')})`)
    .option('-c, --channel <channels>', `Comma-separated channels (${CHANNELS.join('|')})`)
    .option('--since <duration>', 'Only memories updated within (e.g. 7d)')
    .option('--include-expired', 'Include expired memories', false)
    .option('-i, --interactive', 'Interactive picker (arrow keys + Enter)', false)
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
        const channel = opts.channel
          ? (opts.channel.split(',').map(s => s.trim()).filter(Boolean) as MemoryChannel[])
          : undefined;
        const since = sinceFromAgo(opts.since);
        const hits = await m.recall(query, {
          k: Number(opts.top),
          scope: opts.scope as 'project' | 'global' | 'team' | 'all',
          projectHash,
          minScore: Number(opts.minScore),
          tags,
          source,
          channel,
          since,
          includeExpired: opts.includeExpired,
        });

        if (writeJsonResult(hits.map(h => ({
          id: h.record.id,
          score: h.score,
          similarity: h.similarity,
          content: h.record.content,
          scope: h.record.scope,
          channel: h.record.channel,
          tags: h.record.tags,
        })))) return;

        if (hits.length === 0) {
          console.log(chalk.yellow('no matching memories'));
          return;
        }

        if (opts.interactive) {
          const chosen = await interactiveRecall(hits);
          if (chosen) {
            console.log('');
            console.log(chalk.bold('selected'), chalk.dim(chosen.id.slice(0, 8)));
            console.log(chosen.content);
          }
          return;
        }

        for (const h of hits) console.log(formatHit(h));
      } finally {
        await m.close();
      }
    });
}
