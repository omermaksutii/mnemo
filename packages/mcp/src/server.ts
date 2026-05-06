import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { Mnemo, projectHashOf } from '@mnemo-mcp/core';

export type CreateServerOpts = {
  dataDir?: string;
  embedderType?: 'onnx' | 'hash';
};

export async function createServer(opts: CreateServerOpts = {}): Promise<{ server: McpServer; close: () => Promise<void> }> {
  const embedderType: 'onnx' | 'hash' =
    opts.embedderType ?? (process.env.MNEMO_EMBEDDER === 'hash' ? 'hash' : 'onnx');
  const mnemo = await Mnemo.open({ dataDir: opts.dataDir, embedderType });

  const server = new McpServer({
    name: 'mnemo',
    version: '0.2.0',
  });

  server.tool(
    'mnemo_recall',
    'Semantic recall of stored memories',
    {
      query: z.string().describe('Natural-language query'),
      k: z.number().int().positive().max(50).optional().describe('Number of results (default 5)'),
      scope: z.enum(['project', 'global', 'all']).optional().describe('Memory scope filter (default: all)'),
      project_hash: z.string().optional().describe('Project hash; defaults to hash of cwd when scope=project'),
      min_score: z.number().min(0).max(1).optional().describe('Minimum composite score (default 0)'),
    },
    async args => {
      const projectHash = args.scope === 'project' ? args.project_hash ?? projectHashOf(process.cwd()) : undefined;
      const hits = await mnemo.recall(args.query, {
        k: args.k ?? 5,
        scope: args.scope,
        projectHash,
        minScore: args.min_score ?? 0,
      });
      if (hits.length === 0) {
        return { content: [{ type: 'text', text: 'no matching memories' }] };
      }
      const lines = hits.map(
        h =>
          `• [${h.record.id.slice(0, 8)}] (score ${h.score.toFixed(3)}, sim ${h.similarity.toFixed(3)}) ${h.record.scope}: ${h.record.content}`,
      );
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    },
  );

  server.tool(
    'mnemo_remember',
    'Capture a memory',
    {
      content: z.string().describe('What to remember'),
      scope: z.enum(['project', 'global']).optional().describe('Scope (default: project)'),
      tags: z.array(z.string()).optional().describe('Optional tags'),
      project_hash: z.string().optional().describe('Project hash; defaults to hash of cwd'),
    },
    async args => {
      const scope = args.scope ?? 'project';
      const projectHash = scope === 'global' ? null : args.project_hash ?? projectHashOf(process.cwd());
      const rec = await mnemo.capture({
        content: args.content,
        scope,
        projectHash,
        tags: args.tags ?? [],
        source: 'manual',
      });
      return { content: [{ type: 'text', text: `saved ${rec.id.slice(0, 8)} (${scope})` }] };
    },
  );

  server.tool(
    'mnemo_forget',
    'Delete a memory by id (full or 8-char prefix)',
    {
      id: z.string().describe('Memory id'),
    },
    async args => {
      const list = await mnemo.list({});
      const match = list.find(r => r.id === args.id || r.id.startsWith(args.id));
      if (!match) {
        return { content: [{ type: 'text', text: `no memory matches "${args.id}"` }] };
      }
      await mnemo.forget(match.id);
      return { content: [{ type: 'text', text: `forgotten ${match.id.slice(0, 8)}` }] };
    },
  );

  server.tool(
    'mnemo_list',
    'List recent memories',
    {
      scope: z.enum(['project', 'global']).optional().describe('Filter scope'),
      limit: z.number().int().positive().max(200).optional().describe('Max results (default 20)'),
      project_hash: z.string().optional(),
    },
    async args => {
      const list = await mnemo.list({
        scope: args.scope,
        projectHash: args.project_hash,
        limit: args.limit ?? 20,
      });
      if (list.length === 0) {
        return { content: [{ type: 'text', text: 'no memories yet' }] };
      }
      const lines = list.map(r => `• [${r.id.slice(0, 8)}] ${r.scope}: ${r.content}`);
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    },
  );

  server.tool(
    'mnemo_stats',
    'Show memory engine stats',
    {},
    async () => {
      const s = await mnemo.stats();
      const text = [
        `total: ${s.totalMemories}`,
        `  project: ${s.byScope.project}`,
        `  global:  ${s.byScope.global}`,
        `index size: ${s.indexSize}`,
        `embedding dim: ${s.embeddingDimension}`,
        `storage bytes: ${s.storageBytes}`,
      ].join('\n');
      return { content: [{ type: 'text', text }] };
    },
  );

  return {
    server,
    close: async () => {
      await mnemo.close();
    },
  };
}
