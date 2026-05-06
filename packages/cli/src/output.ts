import chalk from 'chalk';
import type { MemoryHit, MemoryRecord, MnemoStats } from '@mnemo-mcp/core';

export function formatHit(hit: MemoryHit): string {
  const id = chalk.dim(hit.record.id.slice(0, 8));
  const score = chalk.cyan(hit.score.toFixed(3));
  const sim = chalk.dim(`(sim ${hit.similarity.toFixed(3)})`);
  const scope = hit.record.scope === 'global' ? chalk.magenta('global') : chalk.green('project');
  const tags = hit.record.tags.length ? chalk.dim(' #' + hit.record.tags.join(' #')) : '';
  return `${score} ${sim}  ${id}  ${scope}${tags}\n  ${hit.record.content}`;
}

export function formatRecord(rec: MemoryRecord): string {
  const id = chalk.dim(rec.id.slice(0, 8));
  const scope = rec.scope === 'global' ? chalk.magenta('global') : chalk.green('project');
  const tags = rec.tags.length ? chalk.dim(' #' + rec.tags.join(' #')) : '';
  const ago = relTime(rec.updatedAt);
  return `${id}  ${scope}  ${chalk.dim(ago)}${tags}\n  ${rec.content}`;
}

export function formatStats(s: MnemoStats): string {
  return [
    `${chalk.bold('memories:')} ${s.totalMemories}`,
    `  ${chalk.green('project')}: ${s.byScope.project}`,
    `  ${chalk.magenta('global')}:  ${s.byScope.global}`,
    `${chalk.bold('index size:')} ${s.indexSize}`,
    `${chalk.bold('embedding dim:')} ${s.embeddingDimension}`,
    `${chalk.bold('storage bytes:')} ${s.storageBytes}`,
  ].join('\n');
}

function relTime(ts: number): string {
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}
