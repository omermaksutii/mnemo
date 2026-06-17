import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../src/server.js';

describe('mnemo MCP server', () => {
  let dir: string;
  let client: Client;
  let close: () => Promise<void>;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'mnemo-mcp-'));
    const built = await createServer({ dataDir: dir, embedderType: 'hash' });
    close = built.close;
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: 'test-client', version: '0.0.0' });
    await Promise.all([
      built.server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
  });

  afterEach(async () => {
    await client.close();
    await close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('lists all expected tools', async () => {
    const { tools } = await client.listTools();
    const names = tools.map(t => t.name).sort();
    expect(names).toEqual([
      'mnemo_entity_context',
      'mnemo_forget',
      'mnemo_list',
      'mnemo_procedure_run',
      'mnemo_procedure_suggest',
      'mnemo_recall',
      'mnemo_remember',
      'mnemo_stats',
      'mnemo_what_depends_on',
    ]);
  });

  it('round-trips remember + recall + list + forget + stats', async () => {
    const remembered = await client.callTool({
      name: 'mnemo_remember',
      arguments: { content: 'we use Vitest, never Jest', scope: 'global' },
    });
    expect(JSON.stringify(remembered.content)).toMatch(/saved/);

    const stats = await client.callTool({ name: 'mnemo_stats', arguments: {} });
    expect(JSON.stringify(stats.content)).toMatch(/total: 1/);

    const recalled = await client.callTool({
      name: 'mnemo_recall',
      arguments: { query: 'Vitest test runner', k: 3 },
    });
    expect(JSON.stringify(recalled.content)).toMatch(/Vitest/);

    const listed = await client.callTool({
      name: 'mnemo_list',
      arguments: { scope: 'global' },
    });
    expect(JSON.stringify(listed.content)).toMatch(/Vitest/);

    // Extract id from listed output (first 8-char prefix in brackets)
    const idMatch = JSON.stringify(listed.content).match(/\[([a-f0-9]{8})\]/);
    expect(idMatch).toBeTruthy();
    const id = idMatch![1]!;

    const forgot = await client.callTool({
      name: 'mnemo_forget',
      arguments: { id },
    });
    expect(JSON.stringify(forgot.content)).toMatch(/forgotten/);

    const after = await client.callTool({ name: 'mnemo_stats', arguments: {} });
    expect(JSON.stringify(after.content)).toMatch(/total: 0/);
  });
});
