/**
 * CLI verify command — validates hash chain integrity of audit logs.
 *
 * Designed to meet EU AI Act Article 12 record-keeping verification requirements.
 *
 * @module cli/verify
 */

import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import type { AuditLogEntry, VerifyResult } from '../types.js';
import { computeEntryHash } from '../logger/hash-chain.js';

/**
 * Verify the integrity of the audit log hash chain.
 *
 * @param options - Verification options.
 * @param options.dir - Directory containing NDJSON audit log files.
 * @param options.agent - Optional agent ID filter.
 * @returns Verification result.
 */
export async function runVerify(options: { dir: string; agent?: string }): Promise<VerifyResult> {
  const { dir, agent } = options;

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

  if (fileNames.length === 0) {
    return {
      valid: true,
      totalEntries: 0,
      agentId: agent,
      checkedAt: new Date().toISOString(),
    };
  }

  const allEntries: AuditLogEntry[] = [];
  for (const file of fileNames) {
    const content = await readFile(join(dir, file), 'utf-8');
    const lines = content.split('\n').filter((line) => line.trim().length > 0);
    for (const line of lines) {
      const entry = JSON.parse(line) as AuditLogEntry;
      if (agent !== undefined) {
        if (entry.agentId === agent) {
          allEntries.push(entry);
        }
      } else {
        allEntries.push(entry);
      }
    }
  }

  if (allEntries.length === 0) {
    return {
      valid: true,
      totalEntries: 0,
      agentId: agent,
      checkedAt: new Date().toISOString(),
    };
  }

  let expectedPrevHash = 'genesis';

  for (let i = 0; i < allEntries.length; i++) {
    const entry = allEntries[i]!;

    if (entry.prevHash !== expectedPrevHash) {
      return {
        valid: false,
        totalEntries: allEntries.length,
        firstBrokenAt: i,
        brokenEntryId: entry.id,
        agentId: agent,
        checkedAt: new Date().toISOString(),
      };
    }

    const recomputed = computeEntryHash(entry);
    if (entry.hash !== recomputed) {
      return {
        valid: false,
        totalEntries: allEntries.length,
        firstBrokenAt: i,
        brokenEntryId: entry.id,
        agentId: agent,
        checkedAt: new Date().toISOString(),
      };
    }

    expectedPrevHash = entry.hash;
  }

  return {
    valid: true,
    totalEntries: allEntries.length,
    agentId: agent,
    checkedAt: new Date().toISOString(),
  };
}
