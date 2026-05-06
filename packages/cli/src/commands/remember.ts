import type { Command } from 'commander';
import { Mnemo, projectHashOf, expiresAtFromTtl, CHANNELS, SecretContentError, type MemoryChannel } from '@mnemo-mcp/core';
import chalk from 'chalk';
import { writeJsonResult } from '../json-mode.js';

type Opts = {
  global: boolean;
  team: boolean;
  tags: string;
  channel?: string;
  expiresIn?: string;
  dedupThreshold: string;
  allowSensitive: boolean;
  dataDir?: string;
};

export function registerRemember(program: Command): void {
  program
    .command('remember <content...>')
    .description('Capture a memory')
    .option('-g, --global', 'Store as global (cross-project) memory', false)
    .option('--team', 'Store as team-shared memory (sync via mnemo team push)', false)
    .option('-t, --tags <list>', 'Comma-separated tags', '')
    .option('-c, --channel <channel>', `Structured channel: ${CHANNELS.join('|')}`)
    .option('--expires-in <duration>', 'Auto-forget after (e.g. 30d, 12h, 7d)')
    .option('--dedup-threshold <n>', 'Cosine similarity above which to update existing instead of inserting (0 disables)', '0.95')
    .option('--allow-sensitive', 'Bypass the secret-guard (use with care)', false)
    .option('--data-dir <path>', 'Data directory override')
    .action(async (contentParts: string[], opts: Opts) => {
      const content = contentParts.join(' ');
      const tags = opts.tags ? opts.tags.split(',').map(t => t.trim()).filter(Boolean) : [];
      const embedderType = (process.env.MNEMO_EMBEDDER === 'hash' ? 'hash' : 'onnx') as 'hash' | 'onnx';

      if (opts.channel && !(CHANNELS as readonly string[]).includes(opts.channel)) {
        console.error(chalk.red(`invalid channel: ${opts.channel}. Valid: ${CHANNELS.join(', ')}`));
        process.exitCode = 2;
        return;
      }

      const m = await Mnemo.open({ dataDir: opts.dataDir, embedderType });
      try {
        const expiresAt = expiresAtFromTtl(opts.expiresIn);
        if (opts.expiresIn && expiresAt === null) {
          console.error(chalk.red('invalid --expires-in value:'), opts.expiresIn);
          process.exitCode = 2;
          return;
        }
        const scope = opts.team ? 'team' : opts.global ? 'global' : 'project';
        try {
          const rec = await m.capture({
            content,
            scope,
            projectHash: scope === 'global' || scope === 'team' ? null : projectHashOf(process.cwd()),
            tags,
            source: 'manual',
            channel: (opts.channel as MemoryChannel) ?? null,
            expiresAt,
            dedupThreshold: Number(opts.dedupThreshold),
            allowSensitive: opts.allowSensitive,
          });
          if (writeJsonResult({ id: rec.id, scope: rec.scope, channel: rec.channel, deduped: m.lastCaptureDeduped })) return;
          const verb = m.lastCaptureDeduped ? chalk.cyan('updated') : chalk.green('saved');
          const ttl = expiresAt ? chalk.dim(` (expires ${new Date(expiresAt).toISOString().slice(0, 10)})`) : '';
          const ch = rec.channel ? chalk.dim(` [${rec.channel}]`) : '';
          console.log(verb, chalk.dim(rec.id.slice(0, 8)) + ch + ttl);
        } catch (err) {
          if (err instanceof SecretContentError) {
            console.error(chalk.red('refused to capture:'), err.message);
            console.error(chalk.dim('use --allow-sensitive if you really mean it'));
            process.exitCode = 3;
            return;
          }
          throw err;
        }
      } finally {
        await m.close();
      }
    });
}
