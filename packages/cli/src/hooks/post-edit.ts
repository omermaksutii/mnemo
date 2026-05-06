import { Mnemo, projectHashOf } from '@mnemo-mcp/core';
import { shouldAutoCapture, snippet } from './capture-rules.js';

type Payload = {
  tool_name?: string;
  tool_input?: {
    file_path?: string;
    new_string?: string;
    content?: string;
    old_string?: string;
  };
  cwd?: string;
};

/**
 * Auto-capture rule: only the *new* content of a matching file edit gets stored.
 * For Edit tool calls we use `new_string` (the diff insertion), not the whole file.
 * For Write tool calls we use the full content but truncated.
 */
export async function runPostEdit(payload: Payload): Promise<string> {
  const filePath = payload.tool_input?.file_path;
  if (!filePath || !shouldAutoCapture(filePath)) return '';

  const isEdit = payload.tool_name === 'Edit' || payload.tool_name === 'MultiEdit';
  const newPart = payload.tool_input?.new_string;
  const fullContent = payload.tool_input?.content;
  const captured = isEdit && newPart ? newPart : fullContent ?? newPart ?? '';
  if (!captured.trim()) return '';

  const cwd = payload.cwd ?? process.cwd();
  const projectHash = projectHashOf(cwd);
  const embedderType = (process.env.MNEMO_EMBEDDER === 'hash' ? 'hash' : 'onnx') as 'hash' | 'onnx';
  const m = await Mnemo.open({ embedderType });
  try {
    const rec = await m.capture({
      content: `${filePath}: ${snippet(captured)}`,
      scope: 'project',
      projectHash,
      tags: ['auto-edit'],
      source: 'auto-edit',
      dedupThreshold: 0.92, // generous threshold for auto-captured snippets
    });
    const verb = m.lastCaptureDeduped ? 'updated' : 'captured';
    return `mnemo: ${verb} ${rec.id.slice(0, 8)} from ${filePath}`;
  } finally {
    await m.close();
  }
}
