/**
 * CLI report command — generates compliance summary reports from audit logs.
 *
 * Designed to meet EU AI Act Article 12 record-keeping and reporting requirements.
 *
 * @module cli/report
 */

import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import type { AuditLogEntry, ComplianceReport, RiskLevel } from '../types.js';
import { runVerify } from './verify.js';

/**
 * Generate a compliance report from audit log NDJSON files.
 *
 * @param options - Report generation options.
 * @param options.dir - Directory containing NDJSON audit log files.
 * @param options.format - Output format: 'json' for machine-readable, 'human' for console display.
 * @param options.agent - Optional agent ID filter.
 * @returns The generated compliance report.
 */
export async function runReport(options: {
  dir: string;
  format: 'json' | 'human';
  agent?: string;
}): Promise<ComplianceReport> {
  const { dir, format, agent } = options;

  // Validate directory exists
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

  // Run chain integrity verification
  const chainIntegrity = await runVerify({ dir, agent });

  // Parse all entries
  const entries: AuditLogEntry[] = [];
  for (const file of fileNames) {
    const content = await readFile(join(dir, file), 'utf-8');
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

  // Compute risk distribution
  const riskDistribution: Record<RiskLevel, number> = {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
  };
  for (const entry of entries) {
    riskDistribution[entry.risk]++;
  }

  // Compute oversight summary
  const oversightSummary = {
    totalRequired: 0,
    approved: 0,
    denied: 0,
    timeout: 0,
    notRequired: 0,
  };
  for (const entry of entries) {
    if (entry.oversight.required) {
      oversightSummary.totalRequired++;
    }
    switch (entry.oversight.status) {
      case 'approved':
        oversightSummary.approved++;
        break;
      case 'denied':
        oversightSummary.denied++;
        break;
      case 'timeout':
        oversightSummary.timeout++;
        break;
      case 'not-required':
        oversightSummary.notRequired++;
        break;
    }
  }

  // Compute time range
  const timeRange = {
    first: entries.length > 0 ? entries[0]!.timestamp : '',
    last: entries.length > 0 ? entries[entries.length - 1]!.timestamp : '',
  };

  // Compute PII redaction count
  let piiRedactionCount = 0;
  for (const entry of entries) {
    if (JSON.stringify(entry.args).includes('***REDACTED***')) {
      piiRedactionCount++;
    }
  }

  const report: ComplianceReport = {
    chainIntegrity,
    totalEntries: entries.length,
    timeRange,
    riskDistribution,
    oversightSummary,
    piiRedactionCount,
    agentId: agent,
    generatedAt: new Date().toISOString(),
  };

  // Output based on format
  if (format === 'json') {
    console.log(JSON.stringify(report, null, 2));
  } else {
    const integrityStr = chainIntegrity.valid
      ? 'VALID'
      : `BROKEN at entry ${chainIntegrity.firstBrokenAt ?? 'unknown'}`;

    console.log(`=== Compliance Report ===`);
    console.log(`Generated: ${report.generatedAt}`);
    console.log(``);
    console.log(`Chain Integrity: ${integrityStr}`);
    console.log(`Total Entries: ${report.totalEntries}`);
    console.log(`Time Range: ${timeRange.first} → ${timeRange.last}`);
    console.log(``);
    console.log(`Risk Distribution:`);
    console.log(`  critical: ${riskDistribution.critical}`);
    console.log(`  high:     ${riskDistribution.high}`);
    console.log(`  medium:   ${riskDistribution.medium}`);
    console.log(`  low:      ${riskDistribution.low}`);
    console.log(``);
    console.log(`Oversight Summary:`);
    console.log(`  Total required: ${oversightSummary.totalRequired}`);
    console.log(`  Approved: ${oversightSummary.approved}`);
    console.log(`  Denied:   ${oversightSummary.denied}`);
    console.log(`  Timeout:  ${oversightSummary.timeout}`);
    console.log(``);
    console.log(`PII Redactions: ${piiRedactionCount} entries`);
  }

  return report;
}
