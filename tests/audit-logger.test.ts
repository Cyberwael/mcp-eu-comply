import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AuditLogger } from '../src/logger/audit-logger';
import { verifyChain } from '../src/logger/hash-chain';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

import type { OversightResult, RiskLevel, LoggingConfig, DataResidencyConfig } from '../src/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir: string;

/** Create a fresh temp directory for each test. */
async function makeTmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'audit-logger-test-'));
}

/** Default oversight result for tests (no approval required). */
const defaultOversight: OversightResult = {
  required: false,
  status: 'not-required',
};

/** Get today's UTC date as YYYY-MM-DD. */
function todayUTC(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(async () => {
  tmpDir = await makeTmpDir();
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('AuditLogger', () => {
  it('writes single log entry to correct NDJSON file', async () => {
    const config: LoggingConfig = { outputDir: tmpDir };
    const logger = new AuditLogger(config);
    await logger.init();

    const entry = await logger.log({
      tool: 'read_file',
      args: { path: '/etc/hosts' },
      risk: 'low',
      oversight: defaultOversight,
      result: { status: 'success', content: 'file contents here' },
      durationMs: 42,
    });

    // File should exist with today's date
    const expectedFile = path.join(tmpDir, `${todayUTC()}.ndjson`);
    const content = await fs.readFile(expectedFile, 'utf-8');
    const lines = content.split('\n').filter((l) => l.trim().length > 0);

    expect(lines).toHaveLength(1);

    const parsed = JSON.parse(lines[0]!);
    expect(parsed.id).toBe(entry.id);
    expect(parsed.tool).toBe('read_file');
    expect(parsed.schemaVersion).toBe('0.1.0');
  });

  it('hash chain valid across 10 entries', async () => {
    const config: LoggingConfig = { outputDir: tmpDir };
    const logger = new AuditLogger(config);
    await logger.init();

    for (let i = 0; i < 10; i++) {
      await logger.log({
        tool: `tool_${i}`,
        args: { index: i },
        risk: 'medium',
        oversight: defaultOversight,
        result: { status: 'success' },
        durationMs: i * 10,
      });
    }

    const verification = await verifyChain(tmpDir);
    expect(verification.valid).toBe(true);
    expect(verification.entries).toBe(10);
  });

  it('PII redacted in logged args', async () => {
    const config: LoggingConfig = { outputDir: tmpDir };
    const dataResidency: DataResidencyConfig = {
      region: 'EU',
      piiFields: ['email'],
      redactInLogs: true,
    };
    const logger = new AuditLogger(config, dataResidency);
    await logger.init();

    await logger.log({
      tool: 'send_email',
      args: { email: 'test@test.com', amount: 100 },
      risk: 'high',
      oversight: defaultOversight,
      result: { status: 'success' },
      durationMs: 55,
    });

    // Read the logged entry from file
    const content = await fs.readFile(
      path.join(tmpDir, `${todayUTC()}.ndjson`),
      'utf-8',
    );
    const entry = JSON.parse(content.trim());

    expect(entry.args.email).toBe('***REDACTED***');
    expect(entry.args.amount).toBe(100);

    // Chain must still be valid on redacted data
    const verification = await verifyChain(tmpDir);
    expect(verification.valid).toBe(true);
  });

  it('contentHash stored instead of full output', async () => {
    const config: LoggingConfig = { outputDir: tmpDir };
    const logger = new AuditLogger(config);
    await logger.init();

    const sensitiveContent = { data: 'sensitive' };
    const entry = await logger.log({
      tool: 'query_db',
      args: { query: 'SELECT *' },
      risk: 'high',
      oversight: defaultOversight,
      result: { status: 'success', content: sensitiveContent },
      durationMs: 200,
    });

    // Entry should have contentHash
    expect(entry.result.contentHash).toBeDefined();
    expect(typeof entry.result.contentHash).toBe('string');
    expect(entry.result.contentHash!.length).toBe(64); // SHA-256 hex = 64 chars

    // Read from file — verify no raw content stored
    const content = await fs.readFile(
      path.join(tmpDir, `${todayUTC()}.ndjson`),
      'utf-8',
    );
    const logged = JSON.parse(content.trim());

    expect(logged.result.contentHash).toBe(entry.result.contentHash);
    // The raw content must NOT appear in the logged entry
    expect(JSON.stringify(logged)).not.toContain('"sensitive"');
  });

  it('chain-state.json updated after each log', async () => {
    const config: LoggingConfig = { outputDir: tmpDir };
    const logger = new AuditLogger(config);
    await logger.init();

    const entry1 = await logger.log({
      tool: 'tool_a',
      args: {},
      risk: 'low',
      oversight: defaultOversight,
      result: { status: 'success' },
      durationMs: 10,
    });

    const entry2 = await logger.log({
      tool: 'tool_b',
      args: {},
      risk: 'low',
      oversight: defaultOversight,
      result: { status: 'success' },
      durationMs: 20,
    });

    // chain-state.json should exist and contain the last entry's hash
    const stateRaw = await fs.readFile(
      path.join(tmpDir, 'chain-state.json'),
      'utf-8',
    );
    const state = JSON.parse(stateRaw);

    expect(state.lastHash).toBe(entry2.hash);
    expect(state.lastHash).not.toBe(entry1.hash);
  });

  it('NDJSON format: each line is valid JSON', async () => {
    const config: LoggingConfig = { outputDir: tmpDir };
    const logger = new AuditLogger(config);
    await logger.init();

    for (let i = 0; i < 5; i++) {
      await logger.log({
        tool: `tool_${i}`,
        args: { i },
        risk: 'medium',
        oversight: defaultOversight,
        result: { status: 'success' },
        durationMs: i,
      });
    }

    const content = await fs.readFile(
      path.join(tmpDir, `${todayUTC()}.ndjson`),
      'utf-8',
    );
    const lines = content.split('\n').filter((l) => l.trim().length > 0);

    expect(lines).toHaveLength(5);

    for (const line of lines) {
      const parsed = JSON.parse(line);
      expect(parsed.id).toBeDefined();
      expect(parsed.hash).toBeDefined();
      expect(parsed.prevHash).toBeDefined();
      expect(parsed.timestamp).toBeDefined();
      expect(parsed.schemaVersion).toBe('0.1.0');
    }

    // First entry's prevHash should be "genesis"
    const first = JSON.parse(lines[0]!);
    expect(first.prevHash).toBe('genesis');
  });

  it('generateReport produces summary stats', async () => {
    const config: LoggingConfig = { outputDir: tmpDir };
    const logger = new AuditLogger(config);
    await logger.init();

    // Log entries with different risk levels and statuses
    await logger.log({
      tool: 'read_file',
      args: {},
      risk: 'low',
      oversight: { required: false, status: 'not-required' },
      result: { status: 'success' },
      durationMs: 10,
    });

    await logger.log({
      tool: 'write_file',
      args: {},
      risk: 'high',
      oversight: { required: true, status: 'approved', approvedBy: 'admin' },
      result: { status: 'success' },
      durationMs: 20,
    });

    await logger.log({
      tool: 'delete_db',
      args: {},
      risk: 'critical',
      oversight: { required: true, status: 'denied', approvedBy: 'admin' },
      result: { status: 'denied' },
      durationMs: 5,
    });

    await logger.log({
      tool: 'query_api',
      args: {},
      risk: 'medium',
      oversight: { required: false, status: 'not-required' },
      result: { status: 'error', error: 'timeout' },
      durationMs: 3000,
    });

    const today = todayUTC();
    const report = await logger.generateReport(today, today);

    expect(report.totalActions).toBe(4);
    expect(report.from).toBe(today);
    expect(report.to).toBe(today);

    // Risk breakdown
    expect(report.byRisk.low).toBe(1);
    expect(report.byRisk.medium).toBe(1);
    expect(report.byRisk.high).toBe(1);
    expect(report.byRisk.critical).toBe(1);

    // Result breakdown
    expect(report.byResult.success).toBe(2);
    expect(report.byResult.error).toBe(1);
    expect(report.byResult.denied).toBe(1);

    // Oversight breakdown
    expect(report.byOversight['not-required']).toBe(2);
    expect(report.byOversight.approved).toBe(1);
    expect(report.byOversight.denied).toBe(1);

    // Tools called
    expect(report.toolsCalled).toContain('read_file');
    expect(report.toolsCalled).toContain('delete_db');
    expect(report.toolsCalled).toHaveLength(4);

    // Chain integrity
    expect(report.chainIntegrity.valid).toBe(true);
    expect(report.chainIntegrity.entries).toBe(4);
  });
});
