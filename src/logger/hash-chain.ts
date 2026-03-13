/**
 * Hash chain module for tamper-evident audit logging.
 *
 * Implements SHA-256 hash chain per EU AI Act Article 12 (record-keeping).
 * Each entry's hash covers the redacted content (PII removed before hashing).
 * Chain continuity is maintained across restarts via chain-state.json.
 *
 * @module hash-chain
 */

import { createHash } from 'crypto';
import { readdir, readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import type { AuditLogEntry, ChainVerificationResult } from '../types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GENESIS_HASH = 'genesis';
const CHAIN_STATE_FILE = 'chain-state.json';

// ---------------------------------------------------------------------------
// Hash Computation
// ---------------------------------------------------------------------------

/**
 * Compute the SHA-256 hash of an audit log entry.
 * The entry's own `hash` field is excluded from the computation.
 *
 * @param entry - The audit log entry to hash (redacted content).
 * @param algorithm - Hash algorithm to use. Default: 'sha256'.
 * @returns Hash string in "algorithm:hexdigest" format (e.g. "sha256:abc123...").
 */
export function computeEntryHash(entry: AuditLogEntry, algorithm: string = 'sha256'): string {
  const { hash: _excluded, ...rest } = entry;
  const serialized = JSON.stringify(rest);
  const digest = createHash(algorithm).update(serialized).digest('hex');
  return `${algorithm}:${digest}`;
}

// ---------------------------------------------------------------------------
// Genesis
// ---------------------------------------------------------------------------

/**
 * Returns the genesis hash — the prevHash value for the very first entry in a chain.
 *
 * @returns The string "genesis".
 */
export function getGenesisHash(): string {
  return GENESIS_HASH;
}

// ---------------------------------------------------------------------------
// Chain State Persistence
// ---------------------------------------------------------------------------

/**
 * Load the last hash from chain-state.json in the given log directory.
 * Returns "genesis" if the file does not exist (fresh start).
 *
 * @param logDir - Absolute path to the audit log directory.
 * @returns The last persisted hash, or "genesis" if no state file exists.
 */
export async function loadChainState(logDir: string): Promise<string> {
  try {
    const raw = await readFile(join(logDir, CHAIN_STATE_FILE), 'utf-8');
    const state = JSON.parse(raw) as { lastHash: string; updatedAt: string };
    return state.lastHash;
  } catch (err: unknown) {
    if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      return GENESIS_HASH;
    }
    throw err;
  }
}

/**
 * Persist the last hash to chain-state.json for continuity across restarts.
 *
 * @param logDir - Absolute path to the audit log directory.
 * @param lastHash - The hash of the most recent audit log entry.
 */
export async function saveChainState(logDir: string, lastHash: string): Promise<void> {
  await mkdir(logDir, { recursive: true });
  const state = {
    lastHash,
    updatedAt: new Date().toISOString(),
  };
  await writeFile(join(logDir, CHAIN_STATE_FILE), JSON.stringify(state, null, 2), 'utf-8');
}

// ---------------------------------------------------------------------------
// Chain Verification
// ---------------------------------------------------------------------------

/**
 * Verify the integrity of the entire hash chain stored in NDJSON files.
 *
 * Reads all .ndjson files in logDir sorted by filename (date-based),
 * parses every line, and checks:
 * 1. Each entry's hash matches the recomputed hash.
 * 2. Each entry's prevHash matches the previous entry's hash.
 * 3. The first entry's prevHash is "genesis".
 *
 * @param logDir - Absolute path to the audit log directory.
 * @returns Verification result with validity status and error details.
 */
export async function verifyChain(logDir: string): Promise<ChainVerificationResult> {
  let files: string[];
  try {
    const dirEntries = await readdir(logDir);
    files = dirEntries.filter((f) => f.endsWith('.ndjson')).sort();
  } catch (err: unknown) {
    if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { valid: true, entries: 0 };
    }
    throw err;
  }

  if (files.length === 0) {
    return { valid: true, entries: 0 };
  }

  let entryIndex = 0;
  let expectedPrevHash = GENESIS_HASH;

  for (const file of files) {
    const content = await readFile(join(logDir, file), 'utf-8');
    const lines = content.split('\n').filter((line) => line.trim().length > 0);

    for (const line of lines) {
      const entry = JSON.parse(line) as AuditLogEntry;

      // Check prevHash chain linkage
      if (entry.prevHash !== expectedPrevHash) {
        return {
          valid: false,
          entries: entryIndex,
          firstBrokenAt: entryIndex,
          error: `Entry ${entryIndex}: prevHash mismatch. Expected "${expectedPrevHash}", got "${entry.prevHash}".`,
        };
      }

      // Check self-hash integrity
      const recomputed = computeEntryHash(entry);
      if (entry.hash !== recomputed) {
        return {
          valid: false,
          entries: entryIndex,
          firstBrokenAt: entryIndex,
          error: `Entry ${entryIndex}: hash mismatch. Expected "${recomputed}", got "${entry.hash}".`,
        };
      }

      expectedPrevHash = entry.hash;
      entryIndex++;
    }
  }

  return { valid: true, entries: entryIndex };
}
