import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';
import { registerInit } from '../src/commands/init.js';

describe('mnemo init', () => {
  let claudeDir: string;
  let logs: string[];
  let origLog: typeof console.log;

  beforeEach(() => {
    const root = mkdtempSync(join(tmpdir(), 'mnemo-init-'));
    claudeDir = join(root, '.claude');
    process.env.MNEMO_CLAUDE_DIR = claudeDir;
    logs = [];
    origLog = console.log;
    console.log = (...a: unknown[]) => { logs.push(a.join(' ')); };
  });
  afterEach(() => {
    delete process.env.MNEMO_CLAUDE_DIR;
    console.log = origLog;
    rmSync(claudeDir, { recursive: true, force: true });
  });

  it('installs skill and registers MCP server', async () => {
    const program = new Command().exitOverride();
    registerInit(program);
    await program.parseAsync(['node', 'mnemo', 'init']);
    const skill = join(claudeDir, 'skills', 'mnemo', 'SKILL.md');
    const settings = join(claudeDir, 'settings.json');
    expect(existsSync(skill)).toBe(true);
    expect(readFileSync(skill, 'utf8')).toMatch(/Persistent memory/);
    const cfg = JSON.parse(readFileSync(settings, 'utf8'));
    expect(cfg.mcpServers.mnemo.command).toBe('npx');
    expect(cfg.mcpServers.mnemo.args).toContain('@omermaksutii/mnemo-mcp');
  });

  it('--with-hooks adds hook entries', async () => {
    const program = new Command().exitOverride();
    registerInit(program);
    await program.parseAsync(['node', 'mnemo', 'init', '--with-hooks']);
    const settings = join(claudeDir, 'settings.json');
    const cfg = JSON.parse(readFileSync(settings, 'utf8'));
    expect(cfg.hooks.SessionStart).toBeTruthy();
    expect(cfg.hooks.PreToolUse).toBeTruthy();
    expect(cfg.hooks.PostToolUse).toBeTruthy();
  });

  it('--dry-run does not write', async () => {
    const program = new Command().exitOverride();
    registerInit(program);
    await program.parseAsync(['node', 'mnemo', 'init', '--dry-run']);
    expect(existsSync(join(claudeDir))).toBe(false);
    expect(logs.join('\n')).toMatch(/would/);
  });

  it('preserves existing settings keys when merging', async () => {
    const fs = await import('node:fs');
    fs.mkdirSync(claudeDir, { recursive: true });
    writeFileSync(
      join(claudeDir, 'settings.json'),
      JSON.stringify({ theme: 'dark', mcpServers: { other: { command: 'foo' } } }),
    );
    const program = new Command().exitOverride();
    registerInit(program);
    await program.parseAsync(['node', 'mnemo', 'init']);
    const cfg = JSON.parse(readFileSync(join(claudeDir, 'settings.json'), 'utf8'));
    expect(cfg.theme).toBe('dark');
    expect(cfg.mcpServers.other.command).toBe('foo');
    expect(cfg.mcpServers.mnemo).toBeTruthy();
  });
});
