import type { Command } from 'commander';
import { Mnemo, paths, resolveDataDir } from '@mnemo/core';
import { existsSync } from 'node:fs';
import chalk from 'chalk';

type Opts = { dataDir?: string };

export function registerDoctor(program: Command): void {
  program
    .command('doctor')
    .description('Diagnose your Mnemo installation')
    .option('--data-dir <path>', 'Data directory override')
    .action(async (opts: Opts) => {
      const dataDir = resolveDataDir(opts.dataDir);
      const p = paths(dataDir);
      const checks: Array<[string, boolean, string]> = [];

      checks.push(['data dir exists', existsSync(dataDir), dataDir]);
      checks.push(['db file exists', existsSync(p.dbFile), p.dbFile]);
      checks.push(['index file exists', existsSync(p.indexFile), p.indexFile]);

      const embedderType = (process.env.MNEMO_EMBEDDER === 'hash' ? 'hash' : 'onnx') as 'hash' | 'onnx';
      let openOk = false;
      try {
        const m = await Mnemo.open({ dataDir, embedderType });
        await m.close();
        openOk = true;
      } catch {}
      checks.push(['mnemo opens cleanly', openOk, embedderType]);

      let allOk = true;
      for (const [name, ok, note] of checks) {
        const tag = ok ? chalk.green('OK ') : chalk.red('FAIL');
        console.log(`${tag} ${name} ${chalk.dim(note)}`);
        if (!ok) allOk = false;
      }
      console.log('');
      console.log(allOk ? chalk.green('healthy') : chalk.red('issues detected'));
      if (!allOk) process.exitCode = 1;
    });
}
