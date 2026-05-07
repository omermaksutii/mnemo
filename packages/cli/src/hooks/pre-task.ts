import { Mnemo, projectHashOf } from '@mnemo-mcp/core';

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
    const sections: string[] = [];

    // Suggest a procedure if one matches strongly.
    const proc = await m.suggestProcedure(description, { minScore: 0.45 });
    if (proc) {
      const procLines = [
        `## Suggested procedure: \`${proc.name}\``,
        proc.description,
        '',
        ...proc.steps.map(s => `- [ ] ${s}`),
        '',
        `(run \`mnemo procedure done ${proc.name}\` when finished)`,
      ];
      sections.push(procLines.join('\n'));
    }

    const hits = await m.recall(description, {
      k: 3,
      scope: 'all',
      minScore: 0.3,
    });
    const relevant = hits.filter(
      h => (h.record.scope === 'global' || h.record.projectHash === projectHash) && h.record.channel !== 'procedure',
    );
    if (relevant.length > 0) {
      const lines = ['## Relevant memories', ...relevant.map(h => `- ${h.record.content}`)];
      sections.push(lines.join('\n'));
    }
    return sections.join('\n\n');
  } finally {
    await m.close();
  }
}
