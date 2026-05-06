import type { Command } from 'commander';
import { Mnemo, paths, resolveDataDir } from '@omermaksutii/mnemo-core';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import chalk from 'chalk';

type Opts = { dataDir?: string; scope: 'user' | 'project' };

type Check = { name: string; ok: boolean; detail: string };

export function registerDoctor(program: Command): void {
  program
    .command('doctor')
    .description('Diagnose your Mnemo installation and Claude Code integration')
    .option('--data-dir <path>', 'Memory data directory override')
    .option('--scope <scope>', 'user (default) or project', 'user')
    .action(async (opts: Opts) => {
      const dataDir = resolveDataDir(opts.dataDir);
      const p = paths(dataDir);
      const claudeDir =
        process.env.MNEMO_CLAUDE_DIR ??
        (opts.scope === 'project' ? join(process.cwd(), '.claude') : join(homedir(), '.claude'));
      const settingsFile = join(claudeDir, 'settings.json');
      const skillFile = join(claudeDir, 'skills', 'mnemo', 'SKILL.md');

      const checks: Check[] = [];

      // ---- memory engine ----
      checks.push({ name: 'data dir', ok: existsSync(dataDir), detail: dataDir });
      checks.push({ name: 'database', ok: existsSync(p.dbFile), detail: p.dbFile });
      checks.push({ name: 'vector index', ok: existsSync(p.indexFile), detail: p.indexFile });

      const embedderType = (process.env.MNEMO_EMBEDDER === 'hash' ? 'hash' : 'onnx') as 'hash' | 'onnx';
      let openOk = false;
      let total = 0;
      try {
        const m = await Mnemo.open({ dataDir, embedderType });
        const stats = await m.stats();
        total = stats.totalMemories;
        await m.close();
        openOk = true;
      } catch (err) {
        checks.push({ name: 'mnemo opens', ok: false, detail: (err as Error).message });
      }
      if (openOk) {
        checks.push({ name: 'mnemo opens', ok: true, detail: `${embedderType} embedder, ${total} memories` });
      }

      // ---- claude code integration ----
      checks.push({ name: 'claude config dir', ok: existsSync(claudeDir), detail: claudeDir });
      checks.push({ name: 'mnemo skill', ok: existsSync(skillFile), detail: skillFile });

      let mcpOk = false;
      let hooksOk = false;
      if (existsSync(settingsFile)) {
        try {
          const cfg = JSON.parse(readFileSync(settingsFile, 'utf8')) as Record<string, unknown>;
          const mcp = (cfg.mcpServers as Record<string, unknown> | undefined)?.mnemo;
          mcpOk = !!mcp;
          const hooks = cfg.hooks as Record<string, unknown> | undefined;
          hooksOk = !!hooks?.SessionStart || !!hooks?.PostToolUse || !!hooks?.PreToolUse;
        } catch {}
      }
      checks.push({ name: 'mcp registered', ok: mcpOk, detail: settingsFile });
      checks.push({ name: 'hooks installed', ok: hooksOk, detail: 'optional — run `mnemo init --with-hooks` to enable' });

      let allOk = true;
      let warnings = 0;
      for (const c of checks) {
        let tag: string;
        if (c.ok) {
          tag = chalk.green('OK ');
        } else if (c.name === 'hooks installed') {
          tag = chalk.yellow('WARN');
          warnings++;
        } else {
          tag = chalk.red('FAIL');
          allOk = false;
        }
        console.log(`${tag} ${c.name.padEnd(22)} ${chalk.dim(c.detail)}`);
      }

      console.log('');
      if (allOk && warnings === 0) {
        console.log(chalk.green('healthy'));
      } else if (allOk) {
        console.log(chalk.yellow(`healthy with ${warnings} warning${warnings === 1 ? '' : 's'}`));
      } else {
        console.log(chalk.red('issues detected'));
        console.log(chalk.dim('try `mnemo init` to install missing pieces'));
        process.exitCode = 1;
      }
    });
}
