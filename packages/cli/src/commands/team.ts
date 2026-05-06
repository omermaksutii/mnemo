import type { Command } from 'commander';
import { Mnemo, projectHashOf, type MemoryRecord } from '@mnemo-mcp/core';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import chalk from 'chalk';
import { writeJsonResult } from '../json-mode.js';

type SharedOpts = { dataDir?: string };
type PushOpts = SharedOpts & { from?: string };
type PullOpts = SharedOpts;
type StatusOpts = SharedOpts;
type InitOpts = SharedOpts;

const TEAM_DIR = '.mnemo';
const TEAM_FILE = 'team.json';

function teamFile(): string {
  return join(process.cwd(), TEAM_DIR, TEAM_FILE);
}

export function registerTeam(program: Command): void {
  const team = program.command('team').description('Team-shared memory synced via git (.mnemo/team.json)');

  team
    .command('init')
    .description('Create .mnemo/team.json so memories can be checked into git')
    .option('--data-dir <path>', 'Data directory override')
    .action(async (_opts: InitOpts) => {
      const file = teamFile();
      if (existsSync(file)) {
        console.log(chalk.yellow('team file already exists at'), file);
        return;
      }
      await mkdir(join(process.cwd(), TEAM_DIR), { recursive: true });
      await writeFile(file, JSON.stringify({ version: 1, memories: [] }, null, 2));
      console.log(chalk.green('created'), file);
      console.log(chalk.dim('commit this file. Use `mnemo team push` to publish your team-scoped memories.'));
    });

  team
    .command('push')
    .description('Export local team-scoped memories to .mnemo/team.json')
    .option('--from <scope>', 'Source scope: team (default), project, global', 'team')
    .option('--data-dir <path>', 'Data directory override')
    .action(async (opts: PushOpts) => {
      const file = teamFile();
      const embedderType = (process.env.MNEMO_EMBEDDER === 'hash' ? 'hash' : 'onnx') as 'hash' | 'onnx';
      const m = await Mnemo.open({ dataDir: opts.dataDir, embedderType });
      try {
        const fromScope = (opts.from ?? 'team') as 'team' | 'project' | 'global';
        const projectHash = fromScope === 'project' ? projectHashOf(process.cwd()) : undefined;
        const all = await m.list({ scope: fromScope, projectHash, includeExpired: true });
        await mkdir(join(process.cwd(), TEAM_DIR), { recursive: true });
        const payload = { version: 1, memories: all.map(toShareable) };
        await writeFile(file, JSON.stringify(payload, null, 2));
        if (writeJsonResult({ pushed: all.length, file })) return;
        console.log(chalk.green('pushed'), all.length, 'memories →', file);
        console.log(chalk.dim('commit + push to share with the team.'));
      } finally {
        await m.close();
      }
    });

  team
    .command('pull')
    .description('Import .mnemo/team.json into local DB as scope=team')
    .option('--data-dir <path>', 'Data directory override')
    .action(async (opts: PullOpts) => {
      const file = teamFile();
      if (!existsSync(file)) {
        console.error(chalk.red('no team file found at'), file);
        console.error(chalk.dim('run `mnemo team init` first, or pull from your remote.'));
        process.exitCode = 1;
        return;
      }
      const raw = JSON.parse(await readFile(file, 'utf8')) as { memories: MemoryRecord[] };
      const embedderType = (process.env.MNEMO_EMBEDDER === 'hash' ? 'hash' : 'onnx') as 'hash' | 'onnx';
      const m = await Mnemo.open({ dataDir: opts.dataDir, embedderType });
      try {
        let imported = 0;
        let updated = 0;
        for (const rec of raw.memories ?? []) {
          await m.capture({
            id: rec.id,
            content: rec.content,
            scope: 'team',
            projectHash: null,
            tags: rec.tags ?? [],
            channel: rec.channel ?? null,
            source: 'team-sync',
            allowSensitive: true, // already vetted upstream
            dedupThreshold: 0,
          });
          if (m.lastCaptureDeduped) updated++;
          else imported++;
        }
        if (writeJsonResult({ imported, updated, file })) return;
        console.log(chalk.green('pulled'), imported, 'new,', updated, 'updated');
      } finally {
        await m.close();
      }
    });

  team
    .command('status')
    .description('Show team file vs local team-scoped memories')
    .option('--data-dir <path>', 'Data directory override')
    .action(async (opts: StatusOpts) => {
      const file = teamFile();
      const embedderType = (process.env.MNEMO_EMBEDDER === 'hash' ? 'hash' : 'onnx') as 'hash' | 'onnx';
      const m = await Mnemo.open({ dataDir: opts.dataDir, embedderType });
      try {
        const local = await m.list({ scope: 'team', includeExpired: true });
        let remote: MemoryRecord[] = [];
        if (existsSync(file)) {
          const raw = JSON.parse(await readFile(file, 'utf8')) as { memories: MemoryRecord[] };
          remote = raw.memories ?? [];
        }
        const localIds = new Set(local.map(r => r.id));
        const remoteIds = new Set(remote.map(r => r.id));
        const onlyLocal = [...local].filter(r => !remoteIds.has(r.id));
        const onlyRemote = [...remote].filter(r => !localIds.has(r.id));

        if (writeJsonResult({
          file,
          file_exists: existsSync(file),
          local: local.length,
          remote: remote.length,
          only_local: onlyLocal.length,
          only_remote: onlyRemote.length,
        })) return;

        console.log(chalk.bold('Team file:'), existsSync(file) ? file : chalk.yellow('(missing — run team init)'));
        console.log(chalk.bold('Local team memories:'), local.length);
        console.log(chalk.bold('Remote (file) memories:'), remote.length);
        if (onlyLocal.length) console.log(chalk.cyan(`  ${onlyLocal.length} local-only — will be sent on next push`));
        if (onlyRemote.length) console.log(chalk.magenta(`  ${onlyRemote.length} remote-only — will be added on next pull`));
        if (!onlyLocal.length && !onlyRemote.length && existsSync(file)) {
          console.log(chalk.green('  in sync ✓'));
        }
      } finally {
        await m.close();
      }
    });
}

function toShareable(r: MemoryRecord): MemoryRecord {
  return {
    ...r,
    scope: 'team',
    projectHash: null,
    accessCount: 0,
    lastAccessedAt: r.lastAccessedAt,
  };
}
