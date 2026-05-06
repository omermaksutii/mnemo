import type { Command } from 'commander';
import { Mnemo, CHANNELS, type MemoryChannel } from '@mnemo-mcp/core';
import chalk from 'chalk';
import { formatRecord } from '../output.js';
import { writeJsonResult } from '../json-mode.js';

type Opts = { scope: string; limit: string; channel?: string; dataDir?: string };

export function registerList(program: Command): void {
  program
    .command('list')
    .description('List memories (most recent first)')
    .option('-s, --scope <scope>', 'project | global | team', 'global')
    .option('-l, --limit <n>', 'Max records to show', '20')
    .option('-c, --channel <channels>', `Filter by channel (${CHANNELS.join('|')})`)
    .option('--data-dir <path>', 'Data directory override')
    .action(async (opts: Opts) => {
      const embedderType = (process.env.MNEMO_EMBEDDER === 'hash' ? 'hash' : 'onnx') as 'hash' | 'onnx';
      const m = await Mnemo.open({ dataDir: opts.dataDir, embedderType });
      try {
        const channel = opts.channel
          ? (opts.channel.split(',').map(s => s.trim()).filter(Boolean) as MemoryChannel[])
          : undefined;
        const list = await m.list({
          scope: opts.scope as 'project' | 'global' | 'team',
          limit: Number(opts.limit),
          channel,
        });
        if (writeJsonResult(list)) return;
        if (list.length === 0) {
          console.log(chalk.dim('no memories yet — try `mnemo remember "..."`'));
          return;
        }
        for (const r of list) console.log(formatRecord(r));
      } finally {
        await m.close();
      }
    });
}
