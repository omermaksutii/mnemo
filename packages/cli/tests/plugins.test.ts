import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { registerPlugins } from '../src/commands/plugins.js';

describe('mnemo plugins command', () => {
  let logs: string[];
  let origLog: typeof console.log;
  beforeEach(() => {
    process.env.MNEMO_NO_PLUGINS = '1';
    logs = [];
    origLog = console.log;
    console.log = (...a: unknown[]) => { logs.push(a.join(' ')); };
  });
  afterEach(() => {
    delete process.env.MNEMO_NO_PLUGINS;
    console.log = origLog;
  });

  it('reports no plugins and how to declare them', async () => {
    const program = new Command().exitOverride();
    registerPlugins(program);
    await program.parseAsync(['node', 'mnemo', 'plugins']);
    const out = logs.join('\n');
    expect(out).toMatch(/no plugins discovered/);
    expect(out).toMatch(/mnemo.*plugins/);
  });
});
