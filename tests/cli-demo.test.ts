import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runDemo } from '../src/cli/demo.js';
import { verifyChain } from '../src/logger/hash-chain.js';
import { mkdtemp, readdir, readFile, rm, stat } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('CLI demo command', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'demo-test-'));
    // Suppress console output during tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    try {
      await rm(tempDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('generates valid audit log entries in specified directory', async () => {
    const result = await runDemo({ keep: true, dir: tempDir });

    expect(result).toBe(tempDir);

    // Check NDJSON file was created
    const files = await readdir(tempDir);
    const ndjsonFiles = files.filter((f) => f.endsWith('.ndjson'));
    expect(ndjsonFiles.length).toBeGreaterThan(0);

    // Parse entries
    const content = await readFile(join(tempDir, ndjsonFiles[0]!), 'utf-8');
    const lines = content.trim().split('\n');
    expect(lines.length).toBe(7); // 7 demo scenarios

    // Each line is valid JSON with required fields
    for (const line of lines) {
      const entry = JSON.parse(line);
      expect(entry).toHaveProperty('id');
      expect(entry).toHaveProperty('timestamp');
      expect(entry).toHaveProperty('prevHash');
      expect(entry).toHaveProperty('hash');
      expect(entry).toHaveProperty('tool');
      expect(entry).toHaveProperty('risk');
      expect(entry).toHaveProperty('oversight');
      expect(entry).toHaveProperty('schemaVersion', '0.1.0');
    }
  });

  it('produces a valid hash chain that passes verification', async () => {
    await runDemo({ keep: true, dir: tempDir });

    const verification = await verifyChain(tempDir);
    expect(verification.valid).toBe(true);
    expect(verification.entries).toBe(7);
  });

  it('redacts PII fields in logged entries', async () => {
    await runDemo({ keep: true, dir: tempDir });

    const files = await readdir(tempDir);
    const ndjsonFiles = files.filter((f) => f.endsWith('.ndjson'));
    const content = await readFile(join(tempDir, ndjsonFiles[0]!), 'utf-8');
    const lines = content.trim().split('\n');

    // The update_profile scenario has name and email PII
    const updateEntry = lines.map((l) => JSON.parse(l)).find((e: Record<string, unknown>) => e.tool === 'update_profile');
    expect(updateEntry).toBeDefined();
    expect(updateEntry.args.name).toBe('***REDACTED***');
    expect(updateEntry.args.email).toBe('***REDACTED***');
    // Non-PII field should NOT be redacted
    expect(updateEntry.args.city).toBe('Berlin');

    // The transfer_funds scenario has name and iban PII
    const transferEntry = lines.map((l) => JSON.parse(l)).find((e: Record<string, unknown>) => e.tool === 'transfer_funds');
    expect(transferEntry).toBeDefined();
    expect(transferEntry.args.name).toBe('***REDACTED***');
    expect(transferEntry.args.iban).toBe('***REDACTED***');
    // amount is not PII
    expect(transferEntry.args.amount).toBe(25000);
  });

  it('classifies risk levels correctly for all scenarios', async () => {
    await runDemo({ keep: true, dir: tempDir });

    const files = await readdir(tempDir);
    const ndjsonFiles = files.filter((f) => f.endsWith('.ndjson'));
    const content = await readFile(join(tempDir, ndjsonFiles[0]!), 'utf-8');
    const entries = content.trim().split('\n').map((l) => JSON.parse(l));

    // get_account → medium (matches /read|get|list|search/ as low AND /.*/ as medium, highest wins)
    const getEntry = entries.find((e: Record<string, unknown>) => e.tool === 'get_account');
    expect(getEntry.risk).toBe('medium');

    // transfer_funds → critical (matches /transfer|payment/)
    const transferEntry = entries.find((e: Record<string, unknown>) => e.tool === 'transfer_funds');
    expect(transferEntry.risk).toBe('critical');

    // delete_user → critical (matches /delete|drop|remove/)
    const deleteEntry = entries.find((e: Record<string, unknown>) => e.tool === 'delete_user');
    expect(deleteEntry.risk).toBe('critical');

    // send_notification → high (matches /write|update|send/)
    const sendEntry = entries.find((e: Record<string, unknown>) => e.tool === 'send_notification');
    expect(sendEntry.risk).toBe('high');
  });

  it('cleans up temp directory when keep is false', async () => {
    const demoDir = await runDemo({ keep: false });

    // The temp directory should have been cleaned up
    try {
      await stat(demoDir);
      // If we get here, the dir still exists — fail
      expect.fail('Temp directory should have been cleaned up');
    } catch (err: unknown) {
      expect((err as NodeJS.ErrnoException).code).toBe('ENOENT');
    }
  });

  it('creates chain-state.json for chain continuity', async () => {
    await runDemo({ keep: true, dir: tempDir });

    const files = await readdir(tempDir);
    expect(files).toContain('chain-state.json');

    const chainState = JSON.parse(await readFile(join(tempDir, 'chain-state.json'), 'utf-8'));
    expect(chainState).toHaveProperty('lastHash');
    expect(chainState).toHaveProperty('updatedAt');
    expect(chainState.lastHash).toMatch(/^sha256:/);
  });

  it('includes oversight details in logged entries', async () => {
    await runDemo({ keep: true, dir: tempDir });

    const files = await readdir(tempDir);
    const ndjsonFiles = files.filter((f) => f.endsWith('.ndjson'));
    const content = await readFile(join(tempDir, ndjsonFiles[0]!), 'utf-8');
    const entries = content.trim().split('\n').map((l) => JSON.parse(l));

    // transfer_funds → approved with approvedBy
    const transferEntry = entries.find((e: Record<string, unknown>) => e.tool === 'transfer_funds');
    expect(transferEntry.oversight.required).toBe(true);
    expect(transferEntry.oversight.status).toBe('approved');
    expect(transferEntry.oversight.approvedBy).toBe('cfo@example.eu');

    // delete_user → denied
    const deleteEntry = entries.find((e: Record<string, unknown>) => e.tool === 'delete_user');
    expect(deleteEntry.oversight.status).toBe('denied');

    // drop_table → timeout
    const dropEntry = entries.find((e: Record<string, unknown>) => e.tool === 'drop_table');
    expect(dropEntry.oversight.status).toBe('timeout');
  });
});
