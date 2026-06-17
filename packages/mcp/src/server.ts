import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { Mnemo, projectHashOf, discoverPlugins } from '@mnemo-mcp/core';

export type CreateServerOpts = {
  dataDir?: string;
  embedderType?: 'onnx' | 'hash';
  /** Default agent attribution for captures via this server. Falls back to $MNEMO_AGENT. */
  agent?: string;
};

export async function createServer(opts: CreateServerOpts = {}): Promise<{ server: McpServer; close: () => Promise<void> }> {
  const embedderType: 'onnx' | 'hash' =
    opts.embedderType ?? (process.env.MNEMO_EMBEDDER === 'hash' ? 'hash' : 'onnx');
  const defaultAgent = opts.agent ?? process.env.MNEMO_AGENT ?? 'claude-code';
  const plugins = process.env.MNEMO_NO_PLUGINS === '1' ? [] : await discoverPlugins({ cwd: process.cwd() });
  const mnemo = await Mnemo.open({ dataDir: opts.dataDir, embedderType, defaultAgent, plugins });

  const server = new McpServer(
    {
      name: 'mnemo',
      version: '2.6.0',
    },
    {
      // Standard MCP discovery: any MCP-aware client can read these instructions
      // to understand the memory layer without bespoke wiring (cross-agent, v2.3).
      instructions:
        'Mnemo is a shared persistent memory layer. Use mnemo_recall before tasks to ' +
        'retrieve prior decisions, conventions, and gotchas; use mnemo_remember to persist ' +
        'durable facts. Memories are attributed per agent so multiple tools (Claude Code, ' +
        'Cursor, Aider) can share one store. mnemo_entity_context and mnemo_what_depends_on ' +
        'expose the knowledge graph.',
    },
  );

  server.tool(
    'mnemo_recall',
    'Semantic recall of stored memories',
    {
      query: z.string().describe('Natural-language query'),
      k: z.number().int().positive().max(50).optional().describe('Number of results (default 5)'),
      scope: z.enum(['project', 'global', 'all']).optional().describe('Memory scope filter (default: all)'),
      project_hash: z.string().optional().describe('Project hash; defaults to hash of cwd when scope=project'),
      min_score: z.number().min(0).max(1).optional().describe('Minimum composite score (default 0)'),
      agent: z.string().optional().describe('Only memories captured by this agent'),
    },
    async args => {
      const projectHash = args.scope === 'project' ? args.project_hash ?? projectHashOf(process.cwd()) : undefined;
      const hits = await mnemo.recall(args.query, {
        k: args.k ?? 5,
        scope: args.scope,
        projectHash,
        minScore: args.min_score ?? 0,
        agent: args.agent,
        antiPatternBoost: 0.15,
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
      agent: z.string().optional().describe(`Capturing agent (default: ${defaultAgent})`),
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
        agent: args.agent,
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

  server.tool(
    'mnemo_procedure_suggest',
    'Find a procedural workflow that matches a task description, if one exists',
    {
      task: z.string().describe('Description of the task you are about to start'),
      min_score: z.number().min(0).max(1).optional().describe('Minimum composite match score (default 0.4)'),
    },
    async args => {
      const proc = await mnemo.suggestProcedure(args.task, { minScore: args.min_score ?? 0.4 });
      if (!proc) return { content: [{ type: 'text', text: 'no matching procedure' }] };
      const lines = [
        `procedure: ${proc.name}`,
        proc.description,
        '',
        ...proc.steps.map((s, i) => `${i + 1}. ${s}`),
        '',
        `runs=${proc.runs} successes=${proc.successes} failures=${proc.failures}`,
      ];
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    },
  );

  server.tool(
    'mnemo_procedure_run',
    'Retrieve a named procedure as a checklist (use before executing the workflow)',
    { name: z.string().describe('Procedure name (kebab-case)') },
    async args => {
      const proc = await mnemo.findProcedure(args.name);
      if (!proc) return { content: [{ type: 'text', text: `no procedure named "${args.name}"` }] };
      const lines = [
        `## ${proc.name}`,
        proc.description,
        '',
        ...proc.steps.map(s => `- [ ] ${s}`),
      ];
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    },
  );

  server.tool(
    'mnemo_entity_context',
    'Everything known about an entity (a named service/module/concept): its memories and directly-related entities',
    { name: z.string().describe('Entity name') },
    async args => {
      const ctx = await mnemo.entityContext(args.name);
      if (!ctx) return { content: [{ type: 'text', text: `no entity named "${args.name}"` }] };
      const lines = [
        `# ${ctx.entity.name}${ctx.entity.type ? ` (${ctx.entity.type})` : ''}`,
        ...(ctx.entity.description ? [ctx.entity.description] : []),
      ];
      if (ctx.relations.length) {
        lines.push('', '## relations');
        for (const r of ctx.relations) {
          lines.push(`- ${r.direction === 'out' ? '→' : '←'} ${r.relation.kind} ${r.entity.name}`);
        }
      }
      if (ctx.memories.length) {
        lines.push('', `## memories (${ctx.memories.length})`);
        for (const mem of ctx.memories) lines.push(`- [${mem.id.slice(0, 8)}] ${mem.content}`);
      }
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    },
  );

  server.tool(
    'mnemo_what_depends_on',
    'Graph traversal: which entities transitively require or use the named entity',
    { name: z.string().describe('Entity name') },
    async args => {
      const deps = await mnemo.whatDependsOn(args.name);
      if (deps.length === 0) return { content: [{ type: 'text', text: `nothing depends on "${args.name}"` }] };
      return { content: [{ type: 'text', text: deps.map(d => `- ${d.name}`).join('\n') }] };
    },
  );

  return {
    server,
    close: async () => {
      await mnemo.close();
    },
  };
}
