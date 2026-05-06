import type { Command } from 'commander';
import { runSessionStart } from '../hooks/session-start.js';
import { runPreTask } from '../hooks/pre-task.js';
import { runPostEdit } from '../hooks/post-edit.js';
import { runUserPromptSubmit } from '../hooks/user-prompt-submit.js';

type Handler = (payload: Record<string, unknown>) => Promise<string>;

const HANDLERS: Record<string, Handler> = {
  'session-start': runSessionStart as Handler,
  'pre-task': runPreTask as Handler,
  'post-edit': runPostEdit as Handler,
  'user-prompt-submit': runUserPromptSubmit as Handler,
};

async function readStdin(): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let data = '';
    if (process.stdin.isTTY) return resolve({});
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => { data += chunk; });
    process.stdin.on('end', () => {
      if (!data.trim()) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        resolve({});
      }
    });
    process.stdin.on('error', reject);
  });
}

export function registerHook(program: Command): void {
  program
    .command('hook <name>')
    .description('Run a Claude Code hook handler. Reads payload JSON from stdin.')
    .option('--print-json', 'Print Claude Code hook JSON envelope', false)
    .action(async (name: string, opts: { printJson: boolean }) => {
      const handler = HANDLERS[name];
      if (!handler) {
        process.stderr.write(`unknown hook "${name}". Known: ${Object.keys(HANDLERS).join(', ')}\n`);
        process.exit(2);
      }
      const payload = await readStdin();
      let text = '';
      try {
        text = await handler(payload);
      } catch (err) {
        // Hooks fail open — never block Claude Code.
        process.stderr.write(`mnemo hook ${name} error: ${(err as Error).message}\n`);
        process.exit(0);
      }
      if (!text) return;
      if (opts.printJson) {
        const envelope = {
          hookSpecificOutput: {
            hookEventName: hookEventNameFor(name),
            additionalContext: text,
          },
        };
        process.stdout.write(JSON.stringify(envelope));
      } else {
        process.stdout.write(text);
      }
    });
}

function hookEventNameFor(name: string): string {
  switch (name) {
    case 'session-start': return 'SessionStart';
    case 'pre-task': return 'PreToolUse';
    case 'post-edit': return 'PostToolUse';
    case 'user-prompt-submit': return 'UserPromptSubmit';
    default: return name;
  }
}
