#!/usr/bin/env node

/**
 * CLI entry point for mcp-eu-comply.
 *
 * Commands:
 *   verify  — Validate hash chain integrity of audit logs
 *   report  — Generate a compliance summary from audit logs
 *
 * Uses Node.js built-in util.parseArgs() (Node 18+). Zero external deps.
 *
 * @module cli
 */

import { parseArgs } from 'node:util';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runVerify } from './verify.js';
import { runReport } from './report.js';
import { runDemo } from './demo.js';

// ---------------------------------------------------------------------------
// Version
// ---------------------------------------------------------------------------

function getVersion(): string {
  const pkgPath = join(__dirname, '..', '..', 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version: string };
  return pkg.version;
}

// ---------------------------------------------------------------------------
// Help
// ---------------------------------------------------------------------------

const HELP = `
mcp-eu-comply — EU AI Act compliance CLI for MCP servers

Usage:
  mcp-eu-comply <command> [options]

Commands:
  verify    Validate hash chain integrity of audit logs
  report    Generate a compliance summary from audit logs
  demo      Run an interactive compliance demonstration

Options:
  --dir <path>       Audit log directory (default: ./audit-logs)
  --agent <id>       Filter by agent ID (multi-agent setups)
  --format <type>    Report format: json | human (default: json)
  --keep             Keep demo audit logs after completion
  --help, -h         Show this help message
  --version, -v      Show version

Examples:
  npx mcp-eu-comply demo
  npx mcp-eu-comply demo --keep
  npx mcp-eu-comply verify --dir ./audit-logs
  npx mcp-eu-comply report --dir ./audit-logs --format human
  npx mcp-eu-comply verify --dir ./audit-logs --agent payment-service
`.trim();

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      dir: { type: 'string', default: './audit-logs' },
      agent: { type: 'string' },
      format: { type: 'string', default: 'json' },
      keep: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
      version: { type: 'boolean', short: 'v', default: false },
    },
    strict: false,
  });

  if (values.help) {
    console.log(HELP);
    process.exit(0);
  }

  if (values.version) {
    console.log(getVersion());
    process.exit(0);
  }

  const command = positionals[0];

  if (!command || (command !== 'verify' && command !== 'report' && command !== 'demo')) {
    console.log(HELP);
    process.exit(command ? 1 : 0);
  }

  const dir = (values.dir as string) ?? './audit-logs';
  const agent = values.agent as string | undefined;

  if (command === 'verify') {
    try {
      const result = await runVerify({ dir, agent });

      // JSON output
      console.log(JSON.stringify(result, null, 2));

      // Exit codes: 0 = valid, 1 = broken chain
      process.exit(result.valid ? 0 : 1);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Error: ${message}`);
      process.exit(2);
    }
  }

  if (command === 'report') {
    const format = (values.format as string) === 'human' ? 'human' as const : 'json' as const;

    try {
      await runReport({ dir, format, agent });
      process.exit(0);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Error: ${message}`);
      process.exit(2);
    }
  }

  if (command === 'demo') {
    try {
      const keep = values.keep as boolean;
      const demoDir = values.dir !== './audit-logs' ? (values.dir as string) : undefined;
      await runDemo({ keep, dir: demoDir });
      process.exit(0);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Error: ${message}`);
      process.exit(2);
    }
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(2);
});
