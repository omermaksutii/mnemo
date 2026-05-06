import { Mnemo, projectHashOf } from '@mnemo/core';

type Payload = { session_id?: string; source?: string; cwd?: string };

export async function runSessionStart(payload: Payload): Promise<string> {
  const cwd = payload.cwd ?? process.cwd();
  const projectHash = projectHashOf(cwd);
  const embedderType = (process.env.MNEMO_EMBEDDER === 'hash' ? 'hash' : 'onnx') as 'hash' | 'onnx';
  const m = await Mnemo.open({ embedderType });
  try {
    const recents = await m.list({ scope: 'project', projectHash, limit: 5 });
    const globals = await m.list({ scope: 'global', limit: 3 });
    const lines: string[] = [];
    if (recents.length === 0 && globals.length === 0) return '';
    lines.push('## Mnemo memory snapshot');
    if (recents.length) {
      lines.push('', '### This project', ...recents.map(r => `- ${r.content}`));
    }
    if (globals.length) {
      lines.push('', '### Global preferences', ...globals.map(r => `- ${r.content}`));
    }
    return lines.join('\n');
  } finally {
    await m.close();
  }
}
