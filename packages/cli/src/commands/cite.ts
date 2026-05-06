import type { Command } from 'commander';
import { Mnemo } from '@mnemo-mcp/core';
import chalk from 'chalk';
import { writeJsonResult } from '../json-mode.js';

type Opts = { dataDir?: string };

export function registerCite(program: Command): void {
  program
    .command('cite <id>')
    .description('Print a memory in a referencable format ([mem:id] header + content) for prompt injection')
    .option('--data-dir <path>', 'Data directory override')
    .action(async (id: string, opts: Opts) => {
      const embedderType = (process.env.MNEMO_EMBEDDER === 'hash' ? 'hash' : 'onnx') as 'hash' | 'onnx';
      const m = await Mnemo.open({ dataDir: opts.dataDir, embedderType });
      try {
        const list = await m.list({ includeExpired: true });
        const match = list.find(r => r.id === id || r.id.startsWith(id));
        if (!match) {
          if (writeJsonResult({ error: 'not_found', query: id })) return;
          console.error(chalk.yellow(`no memory matches "${id}"`));
          process.exitCode = 1;
          return;
        }
        if (writeJsonResult({ id: match.id, content: match.content, scope: match.scope, channel: match.channel })) return;
        process.stdout.write(`[mem:${match.id.slice(0, 8)}] ${match.content}\n`);
      } finally {
        await m.close();
      }
    });
}
