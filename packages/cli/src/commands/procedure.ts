import type { Command } from 'commander';
import { Mnemo, projectHashOf, validateProcedureName, type Procedure } from '@mnemo-mcp/core';
import chalk from 'chalk';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { writeJsonResult } from '../json-mode.js';

type Scope = 'project' | 'global' | 'team';

function scopeFromOpts(opts: { global?: boolean; team?: boolean }): Scope {
  if (opts.team) return 'team';
  if (opts.global) return 'global';
  return 'project';
}

export function registerProcedure(program: Command): void {
  const proc = program
    .command('procedure')
    .alias('proc')
    .description('Procedural memory: capture and execute named workflows');

  // --- record (interactive or non-interactive) ---
  proc
    .command('record [name]')
    .description('Record a procedure (interactive prompt unless --steps given)')
    .option('-d, --description <text>', 'One-line summary used for matching')
    .option('-s, --steps <list>', 'Comma- or newline-separated steps (skips interactive prompt)')
    .option('-g, --global', 'Store as global procedure', false)
    .option('--team', 'Store as team procedure', false)
    .option('--data-dir <path>', 'Data directory override')
    .action(async (
      nameArg: string | undefined,
      opts: { description?: string; steps?: string; global?: boolean; team?: boolean; dataDir?: string },
    ) => {
      const embedderType = (process.env.MNEMO_EMBEDDER === 'hash' ? 'hash' : 'onnx') as 'hash' | 'onnx';
      const m = await Mnemo.open({ dataDir: opts.dataDir, embedderType });
      try {
        let name = nameArg ?? '';
        let description = opts.description ?? '';
        let steps: string[] = opts.steps
          ? opts.steps.split(/[,\n]/).map(s => s.trim()).filter(Boolean)
          : [];

        const interactive = !nameArg || !opts.steps;
        if (interactive && stdin.isTTY) {
          const rl = createInterface({ input: stdin, output: stdout });
          try {
            if (!name) name = (await rl.question('Procedure name (kebab-case): ')).trim();
            if (!description) description = (await rl.question('Description (one line): ')).trim();
            if (steps.length === 0) {
              console.log(chalk.dim('Enter steps. Empty line to finish.'));
              for (let i = 1; ; i++) {
                const s = (await rl.question(`Step ${i}: `)).trim();
                if (!s) break;
                steps.push(s);
              }
            }
          } finally {
            rl.close();
          }
        }

        try { validateProcedureName(name); } catch (err) {
          console.error(chalk.red((err as Error).message));
          process.exitCode = 2;
          return;
        }
        if (steps.length === 0) {
          console.error(chalk.red('procedure must have at least one step'));
          process.exitCode = 2;
          return;
        }

        const scope = scopeFromOpts(opts);
        const projectHash = scope === 'project' ? projectHashOf(process.cwd()) : null;
        const procedure = await m.recordProcedure({
          name,
          description: description || name,
          steps,
          scope,
          projectHash,
        });

        if (writeJsonResult(procedure)) return;
        console.log(chalk.green('recorded'), chalk.cyan(procedure.name), chalk.dim(`(${procedure.steps.length} steps, ${procedure.scope})`));
      } finally {
        await m.close();
      }
    });

  // --- list ---
  proc
    .command('list')
    .description('List all procedures')
    .option('-s, --scope <scope>', 'project | global | team', undefined)
    .option('--data-dir <path>', 'Data directory override')
    .action(async (opts: { scope?: Scope; dataDir?: string }) => {
      const embedderType = (process.env.MNEMO_EMBEDDER === 'hash' ? 'hash' : 'onnx') as 'hash' | 'onnx';
      const m = await Mnemo.open({ dataDir: opts.dataDir, embedderType });
      try {
        const all = await m.listProcedures(opts.scope);
        if (writeJsonResult(all)) return;
        if (all.length === 0) {
          console.log(chalk.dim('no procedures yet — try `mnemo procedure record`'));
          return;
        }
        for (const p of all) {
          const stats = p.runs > 0 ? chalk.dim(`(${p.successes}/${p.runs} succeeded)`) : chalk.dim('(never run)');
          console.log(`${chalk.cyan(p.name)}  ${chalk.dim(p.scope)}  ${stats}`);
          console.log(`  ${p.description}`);
          console.log(chalk.dim(`  ${p.steps.length} steps`));
        }
      } finally {
        await m.close();
      }
    });

  // --- show ---
  proc
    .command('show <name>')
    .description('Print a procedure as a markdown checklist')
    .option('--data-dir <path>', 'Data directory override')
    .action(async (name: string, opts: { dataDir?: string }) => {
      const embedderType = (process.env.MNEMO_EMBEDDER === 'hash' ? 'hash' : 'onnx') as 'hash' | 'onnx';
      const m = await Mnemo.open({ dataDir: opts.dataDir, embedderType });
      try {
        const p = await m.findProcedure(name);
        if (!p) {
          if (writeJsonResult({ error: 'not_found', query: name })) return;
          console.error(chalk.yellow(`no procedure named "${name}"`));
          process.exitCode = 1;
          return;
        }
        if (writeJsonResult(p)) return;
        printProcedureChecklist(p);
      } finally {
        await m.close();
      }
    });

  // --- run (alias for show — prints the checklist for Claude/the user to follow) ---
  proc
    .command('run <name>')
    .description('Print the procedure checklist (alias for show); pair with `procedure done` after')
    .option('--data-dir <path>', 'Data directory override')
    .action(async (name: string, opts: { dataDir?: string }) => {
      const embedderType = (process.env.MNEMO_EMBEDDER === 'hash' ? 'hash' : 'onnx') as 'hash' | 'onnx';
      const m = await Mnemo.open({ dataDir: opts.dataDir, embedderType });
      try {
        const p = await m.findProcedure(name);
        if (!p) {
          if (writeJsonResult({ error: 'not_found', query: name })) return;
          console.error(chalk.yellow(`no procedure named "${name}"`));
          process.exitCode = 1;
          return;
        }
        if (writeJsonResult(p)) return;
        printProcedureChecklist(p);
        console.log('');
        console.log(chalk.dim(`run \`mnemo procedure done ${name}\` (with --success or --failure) when finished`));
      } finally {
        await m.close();
      }
    });

  // --- done (record outcome) ---
  proc
    .command('done <name>')
    .description('Record the outcome of a procedure run')
    .option('--success', 'Mark as successful run', false)
    .option('--failure', 'Mark as failed run', false)
    .option('--data-dir <path>', 'Data directory override')
    .action(async (name: string, opts: { success?: boolean; failure?: boolean; dataDir?: string }) => {
      const embedderType = (process.env.MNEMO_EMBEDDER === 'hash' ? 'hash' : 'onnx') as 'hash' | 'onnx';
      const m = await Mnemo.open({ dataDir: opts.dataDir, embedderType });
      try {
        const success = opts.success === true ? true : opts.failure === true ? false : true;
        const updated = await m.recordProcedureOutcome(name, success);
        if (!updated) {
          if (writeJsonResult({ error: 'not_found', query: name })) return;
          console.error(chalk.yellow(`no procedure named "${name}"`));
          process.exitCode = 1;
          return;
        }
        if (writeJsonResult(updated)) return;
        const tag = success ? chalk.green('success') : chalk.red('failure');
        console.log(tag, chalk.cyan(updated.name), chalk.dim(`(${updated.successes}/${updated.runs})`));
      } finally {
        await m.close();
      }
    });

  // --- suggest ---
  proc
    .command('suggest <task...>')
    .description('Find the best matching procedure for a task description')
    .option('--min-score <n>', 'Minimum composite score', '0.4')
    .option('--data-dir <path>', 'Data directory override')
    .action(async (taskParts: string[], opts: { minScore: string; dataDir?: string }) => {
      const task = taskParts.join(' ');
      const embedderType = (process.env.MNEMO_EMBEDDER === 'hash' ? 'hash' : 'onnx') as 'hash' | 'onnx';
      const m = await Mnemo.open({ dataDir: opts.dataDir, embedderType });
      try {
        const p = await m.suggestProcedure(task, { minScore: Number(opts.minScore) });
        if (!p) {
          if (writeJsonResult(null)) return;
          console.log(chalk.yellow('no procedure matched'));
          process.exitCode = 1;
          return;
        }
        if (writeJsonResult(p)) return;
        console.log(chalk.green('matched'), chalk.cyan(p.name));
        printProcedureChecklist(p);
      } finally {
        await m.close();
      }
    });

  // --- delete ---
  proc
    .command('delete <name>')
    .alias('rm')
    .description('Delete a procedure')
    .option('--data-dir <path>', 'Data directory override')
    .action(async (name: string, opts: { dataDir?: string }) => {
      const embedderType = (process.env.MNEMO_EMBEDDER === 'hash' ? 'hash' : 'onnx') as 'hash' | 'onnx';
      const m = await Mnemo.open({ dataDir: opts.dataDir, embedderType });
      try {
        const ok = await m.deleteProcedure(name);
        if (writeJsonResult({ deleted: ok, name })) return;
        if (!ok) {
          console.error(chalk.yellow(`no procedure named "${name}"`));
          process.exitCode = 1;
          return;
        }
        console.log(chalk.green('deleted'), chalk.cyan(name));
      } finally {
        await m.close();
      }
    });
}

function printProcedureChecklist(p: Procedure): void {
  console.log(`## ${p.name}`);
  if (p.description && p.description !== p.name) console.log(p.description);
  console.log('');
  for (const step of p.steps) {
    console.log(`- [ ] ${step}`);
  }
}
