import type { Command } from 'commander';
import { Mnemo, projectHashOf } from '@mnemo/core';
import chalk from 'chalk';

type Opts = { global: boolean; tags: string; dataDir?: string };

export function registerRemember(program: Command): void {
  program
    .command('remember <content...>')
    .description('Capture a memory')
    .option('-g, --global', 'Store as global (cross-project) memory', false)
    .option('-t, --tags <list>', 'Comma-separated tags', '')
    .option('--data-dir <path>', 'Data directory override')
    .action(async (contentParts: string[], opts: Opts) => {
      const content = contentParts.join(' ');
      const tags = opts.tags ? opts.tags.split(',').map(t => t.trim()).filter(Boolean) : [];
      const embedderType = (process.env.MNEMO_EMBEDDER === 'hash' ? 'hash' : 'onnx') as 'hash' | 'onnx';
      const m = await Mnemo.open({ dataDir: opts.dataDir, embedderType });
      try {
        const rec = await m.capture({
          content,
          scope: opts.global ? 'global' : 'project',
          projectHash: opts.global ? null : projectHashOf(process.cwd()),
          tags,
          source: 'manual',
        });
        console.log(chalk.green('saved'), chalk.dim(rec.id.slice(0, 8)));
      } finally {
        await m.close();
      }
    });
}
