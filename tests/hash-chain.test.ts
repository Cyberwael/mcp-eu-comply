import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import type { AuditLogEntry } from '../src/types';
import {
  computeEntryHash,
  getGenesisHash,
  loadChainState,
  saveChainState,
  verifyChain,
} from '../src/logger/hash-chain';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a minimal valid AuditLogEntry for testing. */
function createEntry(overrides: Partial<AuditLogEntry> = {}): AuditLogEntry {
  return {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    prevHash: 'genesis',
    hash: '', // will be computed
    tool: 'test-tool',
    args: { key: 'value' },
    risk: 'medium',
    oversight: { required: false, status: 'not-required' },
    result: { status: 'success', contentHash: 'sha256:abc' },
    durationMs: 42,
    schemaVersion: '0.1.0',
    ...overrides,
  };
}

/** Build a valid chain of N entries and return them with hashes computed. */
function buildChain(count: number): AuditLogEntry[] {
  const entries: AuditLogEntry[] = [];
  let prevHash = getGenesisHash();

  for (let i = 0; i < count; i++) {
    const entry = createEntry({
      id: randomUUID(),
      timestamp: new Date(Date.now() + i * 1000).toISOString(),
      prevHash,
      tool: `tool-${i}`,
      args: { index: i },
    });
    entry.hash = computeEntryHash(entry);
    prevHash = entry.hash;
    entries.push(entry);
  }

  return entries;
}

/** Write entries to an NDJSON file in the given directory. */
async function writeNdjson(dir: string, filename: string, entries: AuditLogEntry[]): Promise<void> {
  const lines = entries.map((e) => JSON.stringify(e)).join('\n') + '\n';
  await writeFile(join(dir, filename), lines, 'utf-8');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('hash-chain', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'hash-chain-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // Test 1: Genesis entry
  // -------------------------------------------------------------------------
  it('genesis entry has prevHash = genesis and hash starts with sha256:', () => {
    const entry = createEntry({ prevHash: getGenesisHash() });
    const hash = computeEntryHash(entry);

    expect(entry.prevHash).toBe('genesis');
    expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  // -------------------------------------------------------------------------
  // Test 2: Chain of 10 entries all valid
  // -------------------------------------------------------------------------
  it('chain of 10 entries all valid', async () => {
    const entries = buildChain(10);
    await writeNdjson(tempDir, '2026-03-13.ndjson', entries);

    const result = await verifyChain(tempDir);

    expect(result.valid).toBe(true);
    expect(result.entries).toBe(10);
    expect(result.firstBrokenAt).toBeUndefined();
    expect(result.error).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // Test 3: Tamper detection — modified entry breaks chain
  // -------------------------------------------------------------------------
  it('tamper detection — modified entry breaks chain', async () => {
    const entries = buildChain(5);

    // Tamper with entry at index 2: modify args after hash was computed
    entries[2]!.args = { index: 2, tampered: true };

    await writeNdjson(tempDir, '2026-03-13.ndjson', entries);

    const result = await verifyChain(tempDir);

    expect(result.valid).toBe(false);
    expect(result.firstBrokenAt).toBe(2);
  });

  // -------------------------------------------------------------------------
  // Test 4: chain-state.json persistence
  // -------------------------------------------------------------------------
  it('chain-state.json persistence — save then load returns same hash', async () => {
    const hash = 'sha256:abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';

    await saveChainState(tempDir, hash);
    const loaded = await loadChainState(tempDir);

    expect(loaded).toBe(hash);
  });

  // -------------------------------------------------------------------------
  // Test 5: Empty directory is valid chain
  // -------------------------------------------------------------------------
  it('empty directory is valid chain', async () => {
    const result = await verifyChain(tempDir);

    expect(result.valid).toBe(true);
    expect(result.entries).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Test 6: loadChainState returns genesis when no file exists
  // -------------------------------------------------------------------------
  it('loadChainState returns genesis when no file exists', async () => {
    const result = await loadChainState(tempDir);

    expect(result).toBe('genesis');
  });
});
