import { Mnemo, projectHashOf } from '@mnemo/core';
import { shouldAutoCapture, snippet } from './capture-rules.js';

type Payload = {
  tool_name?: string;
  tool_input?: {
    file_path?: string;
    new_string?: string;
    content?: string;
  };
  cwd?: string;
};

export async function runPostEdit(payload: Payload): Promise<string> {
  const filePath = payload.tool_input?.file_path;
  if (!filePath || !shouldAutoCapture(filePath)) return '';
  const captured = payload.tool_input?.new_string ?? payload.tool_input?.content ?? '';
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
    });
    return `mnemo: captured ${rec.id.slice(0, 8)} from ${filePath}`;
  } finally {
    await m.close();
  }
}
