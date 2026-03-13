/**
 * CLI verify command — validates hash chain integrity.
 *
 * Reads NDJSON audit log files and verifies the tamper-evident hash chain,
 * designed to meet EU AI Act Article 12 record-keeping requirements.
 *
 * @module cli/verify
 */

import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import type { AuditLogEntry, VerifyResult } from '../types.js';
import { computeEntryHash } from '../logger/hash-chain.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GENESIS_HASH = 'genesis';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Verify the integrity of the hash chain stored in NDJSON audit log files.
 *
 * Reads all `*.ndjson` files in `options.dir` sorted by filename (date-based),
 * parses every line as an `AuditLogEntry`, optionally filters by agent, and
 * checks hash chain integrity.
 *
 * @param options - Verification options.
 * @param options.dir - Absolute path to the audit log directory.
 * @param options.agent - Optional agent ID to filter entries.
 * @returns Full verification result including broken entry ID if applicable.
 * @throws If the directory does not exist.
 */
export async function runVerify(options: { dir: string; agent?: string }): Promise<VerifyResult> {
  const { dir, agent } = options;

  // Read directory — throw with clear message if not found
  let fileNames: string[];
  try {
    const dirEntries = await readdir(dir);
    fileNames = dirEntries.filter((f) => f.endsWith('.ndjson')).sort();
  } catch (err: unknown) {
    if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Audit log directory not found: ${dir}`);
    }
    throw err;
  }

  // No NDJSON files → valid empty chain
  if (fileNames.length === 0) {
    return {
      valid: true,
      totalEntries: 0,
      checkedAt: new Date().toISOString(),
      ...(agent !== undefined ? { agentId: agent } : {}),
    };
  }

  // Collect all entries across files, optionally filtering by agent
  const entries: AuditLogEntry[] = [];
  for (const fileName of fileNames) {
    const content = await readFile(join(dir, fileName), 'utf-8');
    const lines = content.split('\n').filter((line) => line.trim().length > 0);
    for (const line of lines) {
      const entry = JSON.parse(line) as AuditLogEntry;
      if (agent !== undefined) {
        if (entry.agentId === agent) {
          entries.push(entry);
        }
      } else {
        entries.push(entry);
      }
    }
  }

  // No entries after filtering → valid empty chain
  if (entries.length === 0) {
    return {
      valid: true,
      totalEntries: 0,
      checkedAt: new Date().toISOString(),
      ...(agent !== undefined ? { agentId: agent } : {}),
    };
  }

  // Verify hash chain integrity
  let expectedPrevHash = GENESIS_HASH;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;

    // Check prevHash linkage
    if (entry.prevHash !== expectedPrevHash) {
      return {
        valid: false,
        totalEntries: entries.length,
        firstBrokenAt: i,
        brokenEntryId: entry.id,
        checkedAt: new Date().toISOString(),
        ...(agent !== undefined ? { agentId: agent } : {}),
      };
    }

    // Check self-hash integrity
    const recomputed = computeEntryHash(entry);
    if (entry.hash !== recomputed) {
      return {
        valid: false,
        totalEntries: entries.length,
        firstBrokenAt: i,
        brokenEntryId: entry.id,
        checkedAt: new Date().toISOString(),
        ...(agent !== undefined ? { agentId: agent } : {}),
      };
    }

    expectedPrevHash = entry.hash;
  }

  return {
    valid: true,
    totalEntries: entries.length,
    checkedAt: new Date().toISOString(),
    ...(agent !== undefined ? { agentId: agent } : {}),
  };
}
