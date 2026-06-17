import { readFile } from 'node:fs/promises';
import { Mnemo, projectHashOf, detectFailures, summarizeFailures } from '@mnemo-mcp/core';

export type ReflectPayload = {
  transcript_path?: string;
  session_id?: string;
  cwd?: string;
  stop_hook_active?: boolean;
};

/**
 * Shared body for the Stop / SubagentStop hooks (self-reflective learning, v2.2).
 * Reads the transcript, looks for failure signals, and — if any are found —
 * captures a single `anti-pattern` memory so future recalls can warn against
 * repeating the mistake. Opt-out with MNEMO_REFLECT=0. Fails open.
 */
export async function runReflection(payload: ReflectPayload, tag: string): Promise<string> {
  if (process.env.MNEMO_REFLECT === '0') return '';
  const path = payload.transcript_path;
  if (!path) return '';

  let text = '';
  try {
    text = await readFile(path, 'utf8');
  } catch {
    return ''; // no transcript, nothing to learn
  }

  const signals = detectFailures(text);
  if (signals.length === 0) return '';

  const cwd = payload.cwd ?? process.cwd();
  const projectHash = projectHashOf(cwd);
  const content = summarizeFailures(signals);

  const embedderType = (process.env.MNEMO_EMBEDDER === 'hash' ? 'hash' : 'onnx') as 'hash' | 'onnx';
  const m = await Mnemo.open({ embedderType });
  try {
    const rec = await m.capture({
      content,
      scope: 'project',
      projectHash,
      channel: 'anti-pattern',
      source: 'auto-task',
      tags: ['reflection', tag, ...signals.map(s => s.kind)],
      // Merge with a recent, similar anti-pattern instead of piling up duplicates.
      dedupThreshold: 0.9,
    });
    const verb = m.lastCaptureDeduped ? 'updated' : 'captured';
    return `mnemo: ${verb} anti-pattern ${rec.id.slice(0, 8)} (${signals.map(s => s.kind).join(', ')})`;
  } finally {
    await m.close();
  }
}
