import type { Command } from 'commander';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { Mnemo, projectHashOf, parseMarkdown, parsePlain, hasSecrets, CHANNELS, type IngestChunk, type MemoryChannel } from '@mnemo-mcp/core';
import { SecretContentError } from '@mnemo-mcp/core';
import chalk from 'chalk';
import { writeJsonResult } from '../json-mode.js';

type Opts = {
  global: boolean;
  team: boolean;
  channel?: string;
  defaultChannel?: string;
  skipSensitive: boolean;
  dryRun: boolean;
  dataDir?: string;
};

export function registerIngest(program: Command): void {
  program
    .command('ingest <file>')
    .description('Bulk-import a markdown or text file into memories (one per heading/paragraph/bullet)')
    .option('-g, --global', 'Store all chunks as global memories', false)
    .option('--team', 'Store all chunks as team memories', false)
    .option('-c, --channel <channel>', `Force a single channel (${CHANNELS.join('|')})`)
    .option('--default-channel <channel>', 'Channel to use when ingest cannot infer one')
    .option('--skip-sensitive', 'Skip chunks that look like secrets (default: refuse all)', false)
    .option('--dry-run', 'Show what would be captured without writing', false)
    .option('--data-dir <path>', 'Data directory override')
    .action(async (file: string, opts: Opts) => {
      const raw = await readFile(file, 'utf8');
      const chunks: IngestChunk[] = extname(file).toLowerCase() === '.md' ? parseMarkdown(raw) : parsePlain(raw);
      if (opts.channel && !(CHANNELS as readonly string[]).includes(opts.channel)) {
        console.error(chalk.red(`invalid channel: ${opts.channel}`));
        process.exitCode = 2;
        return;
      }
      const forced: MemoryChannel | undefined = opts.channel as MemoryChannel | undefined;
      const fallback: MemoryChannel | undefined = opts.defaultChannel as MemoryChannel | undefined;

      const skipped: { reason: string; preview: string }[] = [];
      const willCapture: IngestChunk[] = [];
      for (const c of chunks) {
        if (hasSecrets(c.content)) {
          if (opts.skipSensitive) {
            skipped.push({ reason: 'secret', preview: c.content.slice(0, 60) });
            continue;
          }
        }
        willCapture.push({ ...c, channel: forced ?? c.channel ?? fallback ?? null });
      }

      if (writeJsonResult({
        file,
        chunks: chunks.length,
        will_capture: willCapture.length,
        skipped: skipped.length,
        dry_run: opts.dryRun,
        previews: willCapture.slice(0, 5).map(c => ({ channel: c.channel, content: c.content.slice(0, 80) })),
      })) return;

      console.log(chalk.bold(`parsed ${chunks.length} chunks from ${file}`));
      if (skipped.length) console.log(chalk.yellow(`  skipped ${skipped.length} (secret content)`));

      if (opts.dryRun) {
        for (const c of willCapture.slice(0, 10)) {
          console.log(chalk.dim('would capture:'), c.channel ? chalk.dim(`[${c.channel}]`) : '', c.content.slice(0, 80));
        }
        if (willCapture.length > 10) console.log(chalk.dim(`  …and ${willCapture.length - 10} more`));
        return;
      }

      const embedderType = (process.env.MNEMO_EMBEDDER === 'hash' ? 'hash' : 'onnx') as 'hash' | 'onnx';
      const m = await Mnemo.open({ dataDir: opts.dataDir, embedderType });
      try {
        const scope = opts.team ? 'team' : opts.global ? 'global' : 'project';
        let captured = 0;
        let deduped = 0;
        let secrets = 0;
        for (const c of willCapture) {
          try {
            await m.capture({
              content: c.content,
              scope,
              projectHash: scope === 'global' || scope === 'team' ? null : projectHashOf(process.cwd()),
              tags: ['ingested'],
              channel: c.channel,
              source: 'imported',
            });
            captured++;
            if (m.lastCaptureDeduped) deduped++;
          } catch (err) {
            if (err instanceof SecretContentError) {
              secrets++;
              continue;
            }
            throw err;
          }
        }
        console.log(chalk.green('ingested'), captured, 'memories', chalk.dim(`(${deduped} deduped, ${secrets} blocked as secret)`));
      } finally {
        await m.close();
      }
    });
}
