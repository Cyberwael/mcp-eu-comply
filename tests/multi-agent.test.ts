import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AuditLogger } from '../src/logger/audit-logger';
import { verifyChain } from '../src/logger/hash-chain';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import type { OversightResult, LoggingConfig } from '../src/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir: string;

const defaultOversight: OversightResult = {
  required: false,
  status: 'not-required',
};

function makeConfig(outputDir: string): LoggingConfig {
  return { outputDir };
}

async function logEntry(
  logger: AuditLogger,
  tool: string,
  index: number
): Promise<void> {
  await logger.log({
    tool,
    args: { index },
    risk: 'low',
    oversight: defaultOversight,
    result: { status: 'success' },
    durationMs: 10,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'multi-agent-test-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('multi-agent chain isolation', () => {
  // -------------------------------------------------------------------------
  // Two agents same outputDir -> verify each independently -> both valid
  // -------------------------------------------------------------------------
  it('two agents in same outputDir produce independently valid chains', async () => {
    const config = makeConfig(tmpDir);

    const loggerA = new AuditLogger(config, undefined, 'agent-alpha');
    const loggerB = new AuditLogger(config, undefined, 'agent-beta');
    await loggerA.init();
    await loggerB.init();

    // Interleave entries from both agents
    await logEntry(loggerA, 'tool_a_0', 0);
    await logEntry(loggerB, 'tool_b_0', 0);
    await logEntry(loggerA, 'tool_a_1', 1);
    await logEntry(loggerB, 'tool_b_1', 1);
    await logEntry(loggerA, 'tool_a_2', 2);

    await loggerA.shutdown();
    await loggerB.shutdown();

    // Verify each agent's chain independently
    const resultA = await verifyChain(tmpDir, 'agent-alpha');
    expect(resultA.valid).toBe(true);
    expect(resultA.entries).toBe(3);

    const resultB = await verifyChain(tmpDir, 'agent-beta');
    expect(resultB.valid).toBe(true);
    expect(resultB.entries).toBe(2);
  });

  // -------------------------------------------------------------------------
  // Tamper one agent's entry -> that agent's chain fails, other is fine
  // -------------------------------------------------------------------------
  it('tampering one agent entry breaks only that agent chain', async () => {
    const config = makeConfig(tmpDir);

    const loggerA = new AuditLogger(config, undefined, 'agent-alpha');
    const loggerB = new AuditLogger(config, undefined, 'agent-beta');
    await loggerA.init();
    await loggerB.init();

    await logEntry(loggerA, 'tool_a_0', 0);
    await logEntry(loggerB, 'tool_b_0', 0);
    await logEntry(loggerA, 'tool_a_1', 1);
    await logEntry(loggerB, 'tool_b_1', 1);

    await loggerA.shutdown();
    await loggerB.shutdown();

    // Tamper with agent-alpha's second entry (tool_a_1) in the NDJSON file
    const files = (await fs.readdir(tmpDir)).filter((f) => f.endsWith('.ndjson')).sort();
    for (const file of files) {
      const filePath = path.join(tmpDir, file);
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n').filter((l) => l.trim().length > 0);
      const newLines: string[] = [];
      for (const line of lines) {
        const entry = JSON.parse(line);
        if (entry.agentId === 'agent-alpha' && entry.tool === 'tool_a_1') {
          entry.args = { index: 1, tampered: true };
        }
        newLines.push(JSON.stringify(entry));
      }
      await fs.writeFile(filePath, newLines.join('\n') + '\n', 'utf-8');
    }

    // agent-alpha's chain should be broken
    const resultA = await verifyChain(tmpDir, 'agent-alpha');
    expect(resultA.valid).toBe(false);
    expect(resultA.firstBrokenAt).toBe(1);

    // agent-beta's chain should still be valid
    const resultB = await verifyChain(tmpDir, 'agent-beta');
    expect(resultB.valid).toBe(true);
    expect(resultB.entries).toBe(2);
  });

  // -------------------------------------------------------------------------
  // No agentId -> backward compatible v0.1 behavior
  // -------------------------------------------------------------------------
  it('no agentId is backward compatible with v0.1 (single chain-state.json)', async () => {
    const config = makeConfig(tmpDir);

    const logger = new AuditLogger(config);
    await logger.init();

    await logEntry(logger, 'tool_0', 0);
    await logEntry(logger, 'tool_1', 1);
    await logEntry(logger, 'tool_2', 2);

    await logger.shutdown();

    // chain-state.json (not namespaced) should exist
    const stateFile = path.join(tmpDir, 'chain-state.json');
    const stat = await fs.stat(stateFile);
    expect(stat.isFile()).toBe(true);

    // verifyChain with no agentId verifies ALL entries
    const result = await verifyChain(tmpDir);
    expect(result.valid).toBe(true);
    expect(result.entries).toBe(3);
  });

  // -------------------------------------------------------------------------
  // chain-state persistence per agent across restarts
  // -------------------------------------------------------------------------
  it('chain-state persists per agent across restarts', async () => {
    const config = makeConfig(tmpDir);

    // Session 1: agent-alpha logs 2 entries
    const loggerA1 = new AuditLogger(config, undefined, 'agent-alpha');
    await loggerA1.init();
    await logEntry(loggerA1, 'tool_a_0', 0);
    await logEntry(loggerA1, 'tool_a_1', 1);
    await loggerA1.shutdown();

    // Session 2: create a NEW agent-alpha logger -> chain continues
    const loggerA2 = new AuditLogger(config, undefined, 'agent-alpha');
    await loggerA2.init();
    await logEntry(loggerA2, 'tool_a_2', 2);
    await loggerA2.shutdown();

    // Full chain for agent-alpha should be valid with 3 entries
    const result = await verifyChain(tmpDir, 'agent-alpha');
    expect(result.valid).toBe(true);
    expect(result.entries).toBe(3);
  });

  // -------------------------------------------------------------------------
  // chain-state files are namespaced per agent
  // -------------------------------------------------------------------------
  it('chain-state files are namespaced: chain-state-{agentId}.json', async () => {
    const config = makeConfig(tmpDir);

    const loggerA = new AuditLogger(config, undefined, 'agent1');
    const loggerB = new AuditLogger(config, undefined, 'agent2');
    await loggerA.init();
    await loggerB.init();

    await logEntry(loggerA, 'tool_a', 0);
    await logEntry(loggerB, 'tool_b', 0);

    await loggerA.shutdown();
    await loggerB.shutdown();

    // Verify namespaced chain-state files exist
    const stateA = path.join(tmpDir, 'chain-state-agent1.json');
    const stateB = path.join(tmpDir, 'chain-state-agent2.json');

    const statA = await fs.stat(stateA);
    expect(statA.isFile()).toBe(true);

    const statB = await fs.stat(stateB);
    expect(statB.isFile()).toBe(true);

    // The default chain-state.json should NOT exist
    const defaultExists = await fs.stat(path.join(tmpDir, 'chain-state.json')).then(
      () => true,
      () => false,
    );
    expect(defaultExists).toBe(false);
  });
});
