import type { Command } from 'commander';
import chalk from 'chalk';
import { writeJsonResult } from '../json-mode.js';
import { loadPlugins } from '../engine.js';

/**
 * `mnemo plugins` — list discovered plugins and the extension points each
 * provides. Plugins are declared via the `mnemo.plugins` key in package.json or
 * by depending on a `@mnemo-mcp/plugin-*` / `mnemo-plugin-*` package (v2.4).
 */
export function registerPlugins(program: Command): void {
  program
    .command('plugins')
    .description('List discovered Mnemo plugins and their capabilities')
    .action(async () => {
      const plugins = await loadPlugins();
      const summary = plugins.map(p => ({
        name: p.name,
        embedder: !!p.embedder,
        ranker: !!p.ranker,
        captureRules: p.captureRules?.length ?? 0,
        hooks: Object.keys(p.hooks ?? {}),
      }));
      if (writeJsonResult(summary)) return;
      if (summary.length === 0) {
        console.log(chalk.dim('no plugins discovered.'));
        console.log(chalk.dim('declare them in package.json: { "mnemo": { "plugins": ["@mnemo-mcp/plugin-foo"] } }'));
        return;
      }
      for (const p of summary) {
        const caps = [
          p.embedder ? 'embedder' : null,
          p.ranker ? 'ranker' : null,
          p.captureRules ? `${p.captureRules} capture-rule(s)` : null,
          p.hooks.length ? `hooks: ${p.hooks.join(', ')}` : null,
        ].filter(Boolean).join(', ');
        console.log(`${chalk.cyan(p.name)}  ${chalk.dim(caps || 'no extension points')}`);
      }
    });
}
