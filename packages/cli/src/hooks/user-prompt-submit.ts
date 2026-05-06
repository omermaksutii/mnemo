import { Mnemo, projectHashOf } from '@mnemo-mcp/core';

type Payload = {
  prompt?: string;
  user_message?: string;
  cwd?: string;
};

/**
 * Fired on every user message in Claude Code. Injects up to 3 strongly-relevant
 * memories as additional context. Designed to be cheap (single embed + index query).
 */
export async function runUserPromptSubmit(payload: Payload): Promise<string> {
  const prompt = payload.prompt ?? payload.user_message ?? '';
  if (!prompt.trim() || prompt.trim().length < 4) return '';
  const cwd = payload.cwd ?? process.cwd();
  const projectHash = projectHashOf(cwd);
  const embedderType = (process.env.MNEMO_EMBEDDER === 'hash' ? 'hash' : 'onnx') as 'hash' | 'onnx';
  const m = await Mnemo.open({ embedderType });
  try {
    const hits = await m.recall(prompt, { k: 3, scope: 'all', minScore: 0.35 });
    const relevant = hits.filter(h => h.record.scope === 'global' || h.record.projectHash === projectHash);
    if (relevant.length === 0) return '';
    const lines = ['## Relevant memories'];
    for (const h of relevant) lines.push(`- ${h.record.content}`);
    return lines.join('\n');
  } finally {
    await m.close();
  }
}
