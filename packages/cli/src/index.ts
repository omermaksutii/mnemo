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
import { registerIngest } from './commands/ingest.js';
import { registerCite } from './commands/cite.js';
import { registerWhy } from './commands/why.js';
import { registerDigest } from './commands/digest.js';
import { registerDead } from './commands/dead.js';
import { registerTeam } from './commands/team.js';
import { registerCompletion } from './commands/completion.js';
import { registerProcedure } from './commands/procedure.js';

// Set JSON mode before commander parses anything — the hook-based
// approach is unreliable when --json sits between the program name and
// the subcommand on the argv.
if (process.argv.includes('--json')) {
  process.env.MNEMO_JSON = '1';
  // Strip it so subcommands don't choke on an unknown option
  process.argv = process.argv.filter(a => a !== '--json');
}

const program = new Command();
program
  .name('mnemo')
  .description('Persistent memory for Claude Code')
  .version("2.0.0");

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
registerIngest(program);
registerCite(program);
registerWhy(program);
registerDigest(program);
registerDead(program);
registerTeam(program);
registerCompletion(program);
registerProcedure(program);

program.parseAsync(process.argv).catch(err => {
  console.error('mnemo:', err.message);
  process.exit(1);
});
