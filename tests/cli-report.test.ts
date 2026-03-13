import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import type { AuditLogEntry } from '../src/types.js';
import { computeEntryHash } from '../src/logger/hash-chain.js';
import { runReport } from '../src/cli/report.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(
  overrides: Partial<AuditLogEntry> & { prevHash: string },
): AuditLogEntry {
  const base: Omit<AuditLogEntry, 'hash'> = {
    id: overrides.id ?? crypto.randomUUID(),
    timestamp: overrides.timestamp ?? new Date().toISOString(),
    prevHash: overrides.prevHash,
    tool: overrides.tool ?? 'test_tool',
    args: overrides.args ?? {},
    risk: overrides.risk ?? 'low',
    oversight: overrides.oversight ?? { required: false, status: 'not-required' },
    result: overrides.result ?? { status: 'success' },
    durationMs: overrides.durationMs ?? 10,
    agentId: overrides.agentId,
    sessionId: overrides.sessionId,
    schemaVersion: '0.1.0',
  };
  const entryWithoutHash = base as AuditLogEntry;
  // Temporarily set hash to empty so computeEntryHash excludes it
  (entryWithoutHash as Record<string, unknown>)['hash'] = '';
  const hash = computeEntryHash(entryWithoutHash);
  entryWithoutHash.hash = hash;
  return entryWithoutHash;
}

function buildChain(specs: Array<Partial<AuditLogEntry>>): AuditLogEntry[] {
  const entries: AuditLogEntry[] = [];
  let prevHash = 'genesis';
  for (const spec of specs) {
    const entry = makeEntry({ ...spec, prevHash });
    entries.push(entry);
    prevHash = entry.hash;
  }
  return entries;
}

function toNdjson(entries: AuditLogEntry[]): string {
  return entries.map((e) => JSON.stringify(e)).join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'cli-report-test-'));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('runReport', () => {
  it('should produce correct counts for a mixed set of entries', async () => {
    const entries = buildChain([
      {
        timestamp: '2026-03-01T00:00:00Z',
        risk: 'low',
        oversight: { required: false, status: 'not-required' },
        args: { query: 'hello' },
      },
      {
        timestamp: '2026-03-02T00:00:00Z',
        risk: 'high',
        oversight: { required: true, status: 'approved', approvedBy: 'alice' },
        args: { email: '***REDACTED***' },
      },
      {
        timestamp: '2026-03-03T00:00:00Z',
        risk: 'critical',
        oversight: { required: true, status: 'denied', approvedBy: 'bob', reason: 'too risky' },
        args: { name: '***REDACTED***', phone: '***REDACTED***' },
      },
      {
        timestamp: '2026-03-04T00:00:00Z',
        risk: 'medium',
        oversight: { required: true, status: 'timeout' },
        args: { data: 'safe' },
      },
      {
        timestamp: '2026-03-05T00:00:00Z',
        risk: 'low',
        oversight: { required: false, status: 'not-required' },
        args: { note: 'plain' },
      },
    ]);

    await writeFile(join(tmpDir, '2026-03-01.ndjson'), toNdjson(entries));

    const report = await runReport({ dir: tmpDir, format: 'json' });

    expect(report.chainIntegrity.valid).toBe(true);
    expect(report.totalEntries).toBe(5);
    expect(report.timeRange.first).toBe('2026-03-01T00:00:00Z');
    expect(report.timeRange.last).toBe('2026-03-05T00:00:00Z');

    expect(report.riskDistribution).toEqual({
      low: 2,
      medium: 1,
      high: 1,
      critical: 1,
    });

    expect(report.oversightSummary).toEqual({
      totalRequired: 3,
      approved: 1,
      denied: 1,
      timeout: 1,
      notRequired: 2,
    });

    expect(report.piiRedactionCount).toBe(2);
  });

  it('should output valid JSON for json format', async () => {
    const entries = buildChain([
      {
        timestamp: '2026-03-10T00:00:00Z',
        risk: 'low',
        oversight: { required: false, status: 'not-required' },
      },
    ]);
    await writeFile(join(tmpDir, '2026-03-10.ndjson'), toNdjson(entries));

    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    };

    try {
      await runReport({ dir: tmpDir, format: 'json' });
    } finally {
      console.log = origLog;
    }

    const output = logs.join('\n');
    const parsed = JSON.parse(output) as Record<string, unknown>;
    expect(parsed).toHaveProperty('chainIntegrity');
    expect(parsed).toHaveProperty('totalEntries');
    expect(parsed).toHaveProperty('riskDistribution');
    expect(parsed).toHaveProperty('oversightSummary');
    expect(parsed).toHaveProperty('piiRedactionCount');
    expect(parsed).toHaveProperty('generatedAt');
  });

  it('should output human-readable format with key sections', async () => {
    const entries = buildChain([
      {
        timestamp: '2026-03-10T00:00:00Z',
        risk: 'medium',
        oversight: { required: true, status: 'approved', approvedBy: 'alice' },
      },
    ]);
    await writeFile(join(tmpDir, '2026-03-10.ndjson'), toNdjson(entries));

    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    };

    try {
      await runReport({ dir: tmpDir, format: 'human' });
    } finally {
      console.log = origLog;
    }

    const output = logs.join('\n');
    expect(output).toContain('Chain Integrity');
    expect(output).toContain('Risk Distribution');
    expect(output).toContain('Oversight Summary');
    expect(output).toContain('PII Redactions');
    expect(output).toContain('VALID');
  });

  it('should handle an empty directory with zero counts and valid chain', async () => {
    const report = await runReport({ dir: tmpDir, format: 'json' });

    expect(report.chainIntegrity.valid).toBe(true);
    expect(report.totalEntries).toBe(0);
    expect(report.timeRange.first).toBe('');
    expect(report.timeRange.last).toBe('');
    expect(report.riskDistribution).toEqual({ low: 0, medium: 0, high: 0, critical: 0 });
    expect(report.oversightSummary).toEqual({
      totalRequired: 0,
      approved: 0,
      denied: 0,
      timeout: 0,
      notRequired: 0,
    });
    expect(report.piiRedactionCount).toBe(0);
  });

  it('should throw when directory does not exist', async () => {
    await expect(
      runReport({ dir: join(tmpDir, 'nonexistent'), format: 'json' }),
    ).rejects.toThrow('Audit log directory not found');
  });
});
