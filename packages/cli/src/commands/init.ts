import type { Command } from 'commander';
import { mkdir, copyFile, writeFile, readFile, access } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';

const HERE = dirname(fileURLToPath(import.meta.url));
const SKILL_SRC = join(HERE, '..', '..', 'assets', 'skill', 'SKILL.md');

type Opts = {
  dryRun: boolean;
  withHooks: boolean;
  scope: 'user' | 'project';
};

type Step = { label: string; run: () => Promise<void> };

export function registerInit(program: Command): void {
  program
    .command('init')
    .description('Install Mnemo into Claude Code (MCP server, skill, optional hooks)')
    .option('--dry-run', 'Show what would change without writing', false)
    .option('--with-hooks', 'Also install Claude Code hooks for auto-capture', false)
    .option('--scope <scope>', 'user (default) or project', 'user')
    .action(async (opts: Opts) => {
      const claudeDir =
        process.env.MNEMO_CLAUDE_DIR ??
        (opts.scope === 'project' ? join(process.cwd(), '.claude') : join(homedir(), '.claude'));
      const settingsFile = join(claudeDir, 'settings.json');
      const skillDir = join(claudeDir, 'skills', 'mnemo');
      const skillFile = join(skillDir, 'SKILL.md');

      const steps: Step[] = [
        {
          label: `ensure ${claudeDir} exists`,
          run: async () => { await mkdir(claudeDir, { recursive: true }); },
        },
        {
          label: `install skill → ${skillFile}`,
          run: async () => {
            await mkdir(skillDir, { recursive: true });
            await copyFile(SKILL_SRC, skillFile);
          },
        },
        {
          label: `register MCP server in ${settingsFile}`,
          run: async () => { await mergeSettings(settingsFile, mcpPatch()); },
        },
      ];

      if (opts.withHooks) {
        steps.push({
          label: `add hooks to ${settingsFile}`,
          run: async () => { await mergeSettings(settingsFile, hooksPatch()); },
        });
      }

      console.log(chalk.bold(`Mnemo init (scope: ${opts.scope}${opts.dryRun ? ', dry-run' : ''})`));
      for (const s of steps) {
        if (opts.dryRun) {
          console.log(chalk.dim('  would'), s.label);
        } else {
          try {
            await s.run();
            console.log(chalk.green('  ok '), s.label);
          } catch (err) {
            console.log(chalk.red('  fail'), s.label, chalk.dim(`(${(err as Error).message})`));
            process.exitCode = 1;
            return;
          }
        }
      }

      if (!opts.dryRun) {
        console.log('');
        console.log(chalk.bold('Done.'), 'Restart Claude Code, then try:');
        console.log('  /mnemo  — see the skill load');
        console.log('  ask Claude to recall something — it will use mnemo_recall');
        console.log('');
        console.log(chalk.dim('Run `mnemo doctor` to verify everything works.'));
      }
    });
}

function mcpPatch(): Record<string, unknown> {
  return {
    mcpServers: {
      mnemo: {
        command: 'npx',
        args: ['-y', '@mnemo-mcp/server'],
      },
    },
  };
}

function hooksPatch(): Record<string, unknown> {
  return {
    hooks: {
      SessionStart: [
        {
          hooks: [
            { type: 'command', command: 'npx -y @mnemo-mcp/cli hook session-start --print-json' },
          ],
        },
      ],
      UserPromptSubmit: [
        {
          hooks: [
            { type: 'command', command: 'npx -y @mnemo-mcp/cli hook user-prompt-submit --print-json' },
          ],
        },
      ],
      PreToolUse: [
        {
          matcher: 'Task',
          hooks: [
            { type: 'command', command: 'npx -y @mnemo-mcp/cli hook pre-task --print-json' },
          ],
        },
      ],
      PostToolUse: [
        {
          matcher: 'Edit|Write|MultiEdit',
          hooks: [
            { type: 'command', command: 'npx -y @mnemo-mcp/cli hook post-edit' },
          ],
        },
      ],
    },
  };
}

async function mergeSettings(file: string, patch: Record<string, unknown>): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  let existing: Record<string, unknown> = {};
  if (existsSync(file)) {
    try {
      existing = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;
    } catch {
      // backup the broken file before overwriting
      await writeFile(file + '.mnemo-backup', await readFile(file, 'utf8'));
      existing = {};
    }
  }
  const merged = deepMerge(existing, patch);
  await writeFile(file, JSON.stringify(merged, null, 2));
}

const HOOK_EVENT_NAMES = new Set([
  'SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse',
  'SessionEnd', 'Stop', 'SubagentStop', 'Notification',
]);

function mergeHookArrays(existing: unknown[], incoming: unknown[]): unknown[] {
  const seen = new Set(existing.map(e => JSON.stringify(e)));
  const out = [...existing];
  for (const e of incoming) {
    const k = JSON.stringify(e);
    if (!seen.has(k)) {
      out.push(e);
      seen.add(k);
    }
  }
  return out;
}

function deepMerge(a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...a };
  for (const [k, v] of Object.entries(b)) {
    const existing = out[k];
    if (Array.isArray(existing) && Array.isArray(v) && HOOK_EVENT_NAMES.has(k)) {
      // Hook arrays merge with dedup (so re-running init is idempotent)
      out[k] = mergeHookArrays(existing, v);
      continue;
    }
    if (Array.isArray(existing) && Array.isArray(v)) {
      // Plain arrays (e.g. mcpServers.<name>.args) replace, never concat
      out[k] = v;
      continue;
    }
    if (isPlainObject(existing) && isPlainObject(v)) {
      out[k] = deepMerge(existing, v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
