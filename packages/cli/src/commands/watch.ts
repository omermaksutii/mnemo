import type { Command } from 'commander';
import { watch as fsWatch } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { Mnemo, projectHashOf } from '@mnemo-mcp/core';
import chalk from 'chalk';
import { shouldAutoCapture, snippet } from '../hooks/capture-rules.js';

type Opts = {
  glob?: string;
  scope: string;
  channel?: string;
  debounce: string;
  dataDir?: string;
};

/**
 * `mnemo watch <dir>` — auto-capture changes to matching files. By default it
 * follows the same rules as the post-edit hook (CLAUDE.md, ADRs, decisions),
 * but `--glob` lets you widen it to any substring/extension. Debounced so a
 * burst of saves produces a single capture.
 */
export function registerWatch(program: Command): void {
  program
    .command('watch <dir>')
    .description('Watch a directory and auto-capture changes to matching files')
    .option('--glob <substr>', 'Capture files whose path contains this substring (e.g. ".md")')
    .option('-s, --scope <scope>', 'project | global', 'project')
    .option('-c, --channel <channel>', 'Channel for captured memories')
    .option('--debounce <ms>', 'Debounce window in ms', '500')
    .option('--data-dir <path>', 'Data directory override')
    .action(async (dir: string, opts: Opts) => {
      const root = resolve(dir);
      try {
        const s = await stat(root);
        if (!s.isDirectory()) throw new Error('not a directory');
      } catch {
        console.error(chalk.red(`cannot watch ${root}: not a directory`));
        process.exitCode = 1;
        return;
      }

      const embedderType = (process.env.MNEMO_EMBEDDER === 'hash' ? 'hash' : 'onnx') as 'hash' | 'onnx';
      const m = await Mnemo.open({ dataDir: opts.dataDir, embedderType });
      const projectHash = opts.scope === 'global' ? null : projectHashOf(process.cwd());
      const debounceMs = Number(opts.debounce) || 500;

      const matches = (p: string) =>
        opts.glob ? p.includes(opts.glob) : shouldAutoCapture(p);

      const pending = new Map<string, ReturnType<typeof setTimeout>>();

      const captureFile = async (abs: string) => {
        let content = '';
        try {
          content = await readFile(abs, 'utf8');
        } catch {
          return; // deleted/unreadable — skip
        }
        if (!content.trim()) return;
        const rel = relative(process.cwd(), abs);
        try {
          const rec = await m.capture({
            content: `${rel}: ${snippet(content)}`,
            scope: opts.scope === 'global' ? 'global' : 'project',
            projectHash,
            tags: ['watch'],
            source: 'auto-edit',
            channel: opts.channel as never,
            dedupThreshold: 0.92,
          });
          const verb = m.lastCaptureDeduped ? 'updated' : 'captured';
          console.log(chalk.dim(new Date().toLocaleTimeString()), chalk.green(verb), chalk.dim(rec.id.slice(0, 8)), rel);
        } catch (err) {
          console.error(chalk.yellow('skip'), rel, chalk.dim((err as Error).message));
        }
      };

      console.log(chalk.bold('mnemo watch'), root, chalk.dim(`(${opts.glob ? `glob *${opts.glob}*` : 'default rules'}, scope ${opts.scope})`));
      console.log(chalk.dim('Ctrl-C to stop.'));

      const watcher = fsWatch(root, { recursive: true }, (_event, filename) => {
        if (!filename) return;
        const fname = filename.toString();
        const abs = isAbsolute(fname) ? fname : join(root, fname);
        if (!matches(abs)) return;
        const existing = pending.get(abs);
        if (existing) clearTimeout(existing);
        pending.set(abs, setTimeout(() => {
          pending.delete(abs);
          void captureFile(abs);
        }, debounceMs));
      });

      await new Promise<void>(resolveStop => {
        const stop = async () => {
          watcher.close();
          for (const t of pending.values()) clearTimeout(t);
          await m.close();
          resolveStop();
        };
        process.on('SIGINT', stop);
        process.on('SIGTERM', stop);
      });
    });
}
