import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import type { AuditLogEntry } from '../src/types.js';
import { computeEntryHash } from '../src/logger/hash-chain.js';
import { runVerify } from '../src/cli/verify.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal AuditLogEntry (without hash — caller must compute it). */
function buildEntry(overrides: Partial<AuditLogEntry> & { prevHash: string }): AuditLogEntry {
  const base: Omit<AuditLogEntry, 'hash'> = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    prevHash: overrides.prevHash,
    tool: 'test-tool',
    args: { key: 'value' },
    risk: 'low',
    oversight: { required: false, status: 'not-required' },
    result: { status: 'success' },
    durationMs: 42,
    schemaVersion: '0.1.0',
    ...overrides,
  };
  // Compute hash with a placeholder, then replace
  const withPlaceholder = { ...base, hash: '' } as AuditLogEntry;
  const hash = computeEntryHash(withPlaceholder);
  return { ...base, hash } as AuditLogEntry;
}

/** Build a chain of N entries with correct hash linkage. */
function buildChain(count: number, agentId?: string): AuditLogEntry[] {
  const entries: AuditLogEntry[] = [];
  let prevHash = 'genesis';
  for (let i = 0; i < count; i++) {
    const entry = buildEntry({
      prevHash,
      ...(agentId !== undefined ? { agentId } : {}),
    });
    entries.push(entry);
    prevHash = entry.hash;
  }
  return entries;
}

/** Write entries as NDJSON to a file. */
async function writeNdjson(dir: string, filename: string, entries: AuditLogEntry[]): Promise<void> {
  const lines = entries.map((e) => JSON.stringify(e)).join('\n') + '\n';
  await writeFile(join(dir, filename), lines, 'utf-8');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runVerify', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'cli-verify-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('should return valid for a correct hash chain', async () => {
    const entries = buildChain(5);
    await writeNdjson(tmpDir, '2026-03-13.ndjson', entries);

    const result = await runVerify({ dir: tmpDir });

    expect(result.valid).toBe(true);
    expect(result.totalEntries).toBe(5);
    expect(result.firstBrokenAt).toBeUndefined();
    expect(result.brokenEntryId).toBeUndefined();
    expect(result.checkedAt).toBeDefined();
  });

  it('should detect a tampered entry', async () => {
    const entries = buildChain(4);
    // Tamper with the third entry's args (index 2) after hashing
    entries[2]!.args = { tampered: true };
    await writeNdjson(tmpDir, '2026-03-13.ndjson', entries);

    const result = await runVerify({ dir: tmpDir });

    expect(result.valid).toBe(false);
    expect(result.firstBrokenAt).toBe(2);
    expect(result.brokenEntryId).toBe(entries[2]!.id);
  });

  it('should throw for a missing directory', async () => {
    const badDir = join(tmpDir, 'nonexistent');

    await expect(runVerify({ dir: badDir })).rejects.toThrow('Audit log directory not found');
  });

  it('should return valid with zero entries for an empty directory', async () => {
    // tmpDir exists but has no .ndjson files
    const result = await runVerify({ dir: tmpDir });

    expect(result.valid).toBe(true);
    expect(result.totalEntries).toBe(0);
  });

  it('should filter by agent and verify only that agent chain', async () => {
    // Build two independent chains for different agents
    const agentAEntries = buildChain(3, 'agent-a');
    const agentBEntries = buildChain(2, 'agent-b');

    // Interleave entries into a single NDJSON file (agent-a first, then agent-b)
    const allEntries = [...agentAEntries, ...agentBEntries];
    await writeNdjson(tmpDir, '2026-03-13.ndjson', allEntries);

    // Verify agent-a only
    const resultA = await runVerify({ dir: tmpDir, agent: 'agent-a' });
    expect(resultA.valid).toBe(true);
    expect(resultA.totalEntries).toBe(3);
    expect(resultA.agentId).toBe('agent-a');

    // Verify agent-b only
    const resultB = await runVerify({ dir: tmpDir, agent: 'agent-b' });
    expect(resultB.valid).toBe(true);
    expect(resultB.totalEntries).toBe(2);
    expect(resultB.agentId).toBe('agent-b');
  });

  it('should read and sort multiple NDJSON files', async () => {
    const chain = buildChain(4);
    // Split across two date-based files
    await writeNdjson(tmpDir, '2026-03-12.ndjson', chain.slice(0, 2));
    await writeNdjson(tmpDir, '2026-03-13.ndjson', chain.slice(2));

    const result = await runVerify({ dir: tmpDir });

    expect(result.valid).toBe(true);
    expect(result.totalEntries).toBe(4);
  });
});
