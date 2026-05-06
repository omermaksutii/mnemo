import type { Command } from 'commander';
import { Mnemo } from '@mnemo-mcp/core';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import chalk from 'chalk';

type Opts = {
  content?: string;
  tags?: string;
  expiresIn?: string;
  dataDir?: string;
};

export function registerEdit(program: Command): void {
  program
    .command('edit <id>')
    .description('Edit a memory in $EDITOR (or pass --content / --tags non-interactively)')
    .option('-c, --content <text>', 'Replace content directly without opening editor')
    .option('-t, --tags <list>', 'Replace tags (comma-separated)')
    .option('--expires-in <duration>', 'Set TTL (e.g. 30d). Pass empty to clear.')
    .option('--data-dir <path>', 'Data directory override')
    .action(async (id: string, opts: Opts) => {
      const embedderType = (process.env.MNEMO_EMBEDDER === 'hash' ? 'hash' : 'onnx') as 'hash' | 'onnx';
      const m = await Mnemo.open({ dataDir: opts.dataDir, embedderType });
      try {
        const list = await m.list({ includeExpired: true });
        const match = list.find(r => r.id === id || r.id.startsWith(id));
        if (!match) {
          console.log(chalk.yellow(`no memory matches "${id}"`));
          process.exitCode = 1;
          return;
        }

        let nextContent: string | undefined;
        let nextTags: string[] | undefined;

        if (opts.content !== undefined) {
          nextContent = opts.content;
        } else if (opts.tags === undefined && opts.expiresIn === undefined) {
          // Interactive editor mode
          nextContent = await editInTemp(match.content);
          if (nextContent === null || nextContent.trim() === '') {
            console.log(chalk.dim('aborted (empty or unchanged)'));
            return;
          }
        }

        if (opts.tags !== undefined) {
          nextTags = opts.tags.split(',').map(t => t.trim()).filter(Boolean);
        }

        const fields: Parameters<typeof m.update>[1] = {};
        if (nextContent !== undefined && nextContent !== match.content) fields.content = nextContent;
        if (nextTags !== undefined) fields.tags = nextTags;
        if (opts.expiresIn !== undefined) {
          if (opts.expiresIn === '') fields.expiresAt = null;
          else {
            const { expiresAtFromTtl } = await import('@mnemo-mcp/core');
            const exp = expiresAtFromTtl(opts.expiresIn);
            if (exp === null) {
              console.error(chalk.red('invalid --expires-in value:'), opts.expiresIn);
              process.exitCode = 2;
              return;
            }
            fields.expiresAt = exp;
          }
        }

        if (Object.keys(fields).length === 0) {
          console.log(chalk.dim('no changes'));
          return;
        }

        const updated = await m.update(match.id, fields);
        console.log(chalk.green('updated'), chalk.dim(updated!.id.slice(0, 8)));
      } finally {
        await m.close();
      }
    });
}

async function editInTemp(initial: string): Promise<string> {
  const editor = process.env.EDITOR ?? process.env.VISUAL ?? 'vi';
  const dir = mkdtempSync(join(tmpdir(), 'mnemo-edit-'));
  const file = join(dir, 'memory.txt');
  writeFileSync(file, initial);
  try {
    const result = spawnSync(editor, [file], { stdio: 'inherit' });
    if (result.status !== 0) return '';
    return readFileSync(file, 'utf8');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
