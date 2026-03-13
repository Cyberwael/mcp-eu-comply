/**
 * basic-server.ts — Minimal mcp-eu-comply example.
 *
 * Demonstrates the simplest possible setup: wrap an MCP server with compliance
 * in ~20 lines. All tool calls are risk-classified and audit-logged to NDJSON
 * with a tamper-evident SHA-256 hash chain.
 *
 * Usage:
 *   npx ts-node examples/basic-server.ts
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { wrapWithCompliance } from 'mcp-eu-comply';

const server = new McpServer({ name: 'basic-example', version: '1.0.0' });

// Wrap the server with EU AI Act compliance in one line
const compliantServer = wrapWithCompliance(server, {
  riskRules: [
    { toolPattern: /write|delete|update/, level: 'high' },
    { toolPattern: /read|get|list/, level: 'low' },
    // Any tool not matching the above defaults to 'medium' (precautionary)
  ],
  logging: { outputDir: './audit-logs' },
});

// Register tools as usual — the compliance layer is transparent
compliantServer.tool(
  'greet',
  { description: 'Greet a user by name' },
  async (args: { name: string }) => {
    return { content: [{ type: 'text' as const, text: `Hello, ${args.name}!` }] };
  }
);

const transport = new StdioServerTransport();
await compliantServer.connect(transport);
