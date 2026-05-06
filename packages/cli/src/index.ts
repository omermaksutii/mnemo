import { Command } from 'commander';
import { registerRemember } from './commands/remember.js';
import { registerRecall } from './commands/recall.js';
import { registerList } from './commands/list.js';
import { registerForget } from './commands/forget.js';
import { registerStats } from './commands/stats.js';
import { registerExport } from './commands/export.js';
import { registerImport } from './commands/import.js';
import { registerDoctor } from './commands/doctor.js';
import { registerHook } from './commands/hook.js';
import { registerInit } from './commands/init.js';
import { registerEdit } from './commands/edit.js';
import { registerPrune } from './commands/prune.js';

const program = new Command();
program
  .name('mnemo')
  .description('Persistent memory for Claude Code')
  .version('1.0.0');

registerRemember(program);
registerRecall(program);
registerList(program);
registerForget(program);
registerStats(program);
registerExport(program);
registerImport(program);
registerDoctor(program);
registerHook(program);
registerInit(program);
registerEdit(program);
registerPrune(program);

program.parseAsync(process.argv).catch(err => {
  console.error('mnemo:', err.message);
  process.exit(1);
});
