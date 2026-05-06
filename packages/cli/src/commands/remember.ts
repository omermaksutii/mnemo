import type { Command } from 'commander';
import { Mnemo, projectHashOf, expiresAtFromTtl } from '@mnemo-mcp/core';
import chalk from 'chalk';

type Opts = {
  global: boolean;
  tags: string;
  expiresIn?: string;
  dedupThreshold: string;
  dataDir?: string;
};

export function registerRemember(program: Command): void {
  program
    .command('remember <content...>')
    .description('Capture a memory')
    .option('-g, --global', 'Store as global (cross-project) memory', false)
    .option('-t, --tags <list>', 'Comma-separated tags', '')
    .option('--expires-in <duration>', 'Auto-forget after (e.g. 30d, 12h, 7d)')
    .option('--dedup-threshold <n>', 'Cosine similarity above which to update existing instead of inserting (0 disables)', '0.95')
    .option('--data-dir <path>', 'Data directory override')
    .action(async (contentParts: string[], opts: Opts) => {
      const content = contentParts.join(' ');
      const tags = opts.tags ? opts.tags.split(',').map(t => t.trim()).filter(Boolean) : [];
      const embedderType = (process.env.MNEMO_EMBEDDER === 'hash' ? 'hash' : 'onnx') as 'hash' | 'onnx';
      const m = await Mnemo.open({ dataDir: opts.dataDir, embedderType });
      try {
        const expiresAt = expiresAtFromTtl(opts.expiresIn);
        if (opts.expiresIn && expiresAt === null) {
          console.error(chalk.red('invalid --expires-in value:'), opts.expiresIn, chalk.dim('(use 30d, 12h, 45m, 10s, 2w)'));
          process.exitCode = 2;
          return;
        }
        const rec = await m.capture({
          content,
          scope: opts.global ? 'global' : 'project',
          projectHash: opts.global ? null : projectHashOf(process.cwd()),
          tags,
          source: 'manual',
          expiresAt,
          dedupThreshold: Number(opts.dedupThreshold),
        });
        const verb = m.lastCaptureDeduped ? chalk.cyan('updated') : chalk.green('saved');
        const ttl = expiresAt ? chalk.dim(` (expires ${new Date(expiresAt).toISOString().slice(0, 10)})`) : '';
        console.log(verb, chalk.dim(rec.id.slice(0, 8)) + ttl);
      } finally {
        await m.close();
      }
    });
}
