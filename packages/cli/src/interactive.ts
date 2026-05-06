import type { MemoryHit, MemoryRecord } from '@mnemo-mcp/core';
import chalk from 'chalk';
import { stdin, stdout } from 'node:process';
import { emitKeypressEvents } from 'node:readline';

/**
 * Minimal arrow-key interactive picker. No external deps.
 * Returns the chosen MemoryRecord, or null if the user aborted (Esc / Ctrl-C).
 */
export async function interactiveRecall(hits: MemoryHit[]): Promise<MemoryRecord | null> {
  if (hits.length === 0) return null;
  if (!stdin.isTTY) {
    // Non-interactive — fall back to first hit
    return hits[0]!.record;
  }

  let cursor = 0;
  const max = hits.length;

  emitKeypressEvents(stdin);
  stdin.setRawMode(true);
  stdin.resume();

  const render = (first = false) => {
    if (!first) {
      // Move cursor up by previous render height
      stdout.write(`\x1b[${max + 2}A`);
    }
    stdout.write(chalk.dim('↑/↓ select · Enter pick · Esc cancel\n\n'));
    for (let i = 0; i < max; i++) {
      const h = hits[i]!;
      const sel = i === cursor;
      const arrow = sel ? chalk.cyan('▶ ') : '  ';
      const id = chalk.dim(h.record.id.slice(0, 8));
      const score = chalk.cyan(h.score.toFixed(3));
      const content = h.record.content.length > 80 ? h.record.content.slice(0, 77) + '…' : h.record.content;
      const line = sel ? chalk.bold(`${id}  ${score}  ${content}`) : `${id}  ${score}  ${content}`;
      // \x1b[2K clears line so previous render is overwritten
      stdout.write(`\x1b[2K${arrow}${line}\n`);
    }
  };

  return await new Promise<MemoryRecord | null>(resolve => {
    const cleanup = (val: MemoryRecord | null) => {
      stdin.setRawMode(false);
      stdin.removeListener('keypress', onKey);
      stdin.pause();
      // Move below the picker
      stdout.write('\n');
      resolve(val);
    };

    function onKey(_: unknown, key: { name?: string; ctrl?: boolean; sequence?: string }) {
      if (!key) return;
      if (key.ctrl && key.name === 'c') return cleanup(null);
      if (key.name === 'escape' || key.name === 'q') return cleanup(null);
      if (key.name === 'return' || key.name === 'enter') return cleanup(hits[cursor]!.record);
      if (key.name === 'up' || key.name === 'k') {
        cursor = (cursor - 1 + max) % max;
        render();
        return;
      }
      if (key.name === 'down' || key.name === 'j') {
        cursor = (cursor + 1) % max;
        render();
        return;
      }
    }

    stdin.on('keypress', onKey);
    render(true);
  });
}
