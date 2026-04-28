import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import dotenv from 'dotenv';
import { Tools } from './tools.js';
import { SolidTimeService } from './adapters/solidtime.api.js';

console.log = () => {};

dotenv.config({ debug: false });

export const server = new McpServer({
  name: 'solidtime',
  version: '0.0.1'
});

await new Tools(server, new SolidTimeService()).hydrate();

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('SolidTime MCP server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error in main():', error);
  process.exit(1);
});
