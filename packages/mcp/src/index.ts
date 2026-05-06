import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';

async function main() {
  const { server, close } = await createServer();
  const transport = new StdioServerTransport();
  process.on('SIGINT', async () => {
    await close();
    process.exit(0);
  });
  process.on('SIGTERM', async () => {
    await close();
    process.exit(0);
  });
  await server.connect(transport);
}

main().catch(err => {
  console.error('mnemo-mcp:', err);
  process.exit(1);
});

export { createServer } from './server.js';
