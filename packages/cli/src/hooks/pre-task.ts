import { Mnemo, projectHashOf } from '@mnemo/core';

type Payload = {
  tool_input?: { description?: string; prompt?: string };
  cwd?: string;
};

export async function runPreTask(payload: Payload): Promise<string> {
  const description =
    payload.tool_input?.description ?? payload.tool_input?.prompt ?? '';
  if (!description.trim()) return '';
  const cwd = payload.cwd ?? process.cwd();
  const projectHash = projectHashOf(cwd);
  const embedderType = (process.env.MNEMO_EMBEDDER === 'hash' ? 'hash' : 'onnx') as 'hash' | 'onnx';
  const m = await Mnemo.open({ embedderType });
  try {
    const hits = await m.recall(description, { k: 3, scope: 'all', minScore: 0.3 });
    const projectHits = hits.filter(h => h.record.scope === 'global' || h.record.projectHash === projectHash);
    if (projectHits.length === 0) return '';
    const lines = ['## Relevant memories', ...projectHits.map(h => `- ${h.record.content}`)];
    return lines.join('\n');
  } finally {
    await m.close();
  }
}
