import type { Command } from 'commander';
import { Mnemo } from '@mnemo-mcp/core';
import chalk from 'chalk';
import { writeJsonResult } from '../json-mode.js';

type Opts = { dataDir?: string };

/**
 * `mnemo agents` — cross-agent attribution view (v2.3). Shows which agents have
 * contributed memories and how many, so a shared store across Claude Code,
 * Cursor, Aider, etc. is legible. Set `MNEMO_AGENT` (or `remember --agent`) to
 * tag captures.
 */
export function registerAgents(program: Command): void {
  program
    .command('agents')
    .description('List agents that have captured memories, with counts')
    .option('--data-dir <path>', 'Data directory override')
    .action(async (opts: Opts) => {
      const embedderType = (process.env.MNEMO_EMBEDDER === 'hash' ? 'hash' : 'onnx') as 'hash' | 'onnx';
      const m = await Mnemo.open({ dataDir: opts.dataDir, embedderType });
      try {
        const stats = await m.stats();
        const entries = Object.entries(stats.byAgent).sort((a, b) => b[1] - a[1]);
        const unattributed = stats.totalMemories - entries.reduce((s, [, n]) => s + n, 0);
        if (writeJsonResult({ byAgent: stats.byAgent, unattributed })) return;
        if (entries.length === 0) {
          console.log(chalk.dim('no agent-attributed memories yet — set MNEMO_AGENT or use `remember --agent`'));
        } else {
          for (const [agent, n] of entries) {
            console.log(`${chalk.cyan(agent)}  ${chalk.dim(String(n))}`);
          }
        }
        if (unattributed > 0) console.log(`${chalk.dim('(unattributed)')}  ${chalk.dim(String(unattributed))}`);
      } finally {
        await m.close();
      }
    });
}
