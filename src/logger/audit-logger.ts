/**
 * Audit Logger — Tamper-evident audit logging for EU AI Act Article 12 compliance.
 *
 * Produces daily NDJSON files with SHA-256 hash chain, PII redaction,
 * and content hashing (never stores raw tool output).
 *
 * @module audit-logger
 */

import type {
  AuditLogEntry,
  LoggingConfig,
  DataResidencyConfig,
  OversightResult,
  RiskLevel,
  ComplianceReport,
  OversightStatus,
  ChainVerificationResult,
} from '../types';
import { computeEntryHash, loadChainState, saveChainState, verifyChain } from './hash-chain';
import { redactFields } from './pii-redactor';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

/**
 * Tamper-evident audit logger with hash chain, PII redaction, and compliance reporting.
 *
 * Designed to meet EU AI Act Article 12 (record-keeping) requirements.
 * Logs are stored as daily NDJSON files with SHA-256 hash chain integrity.
 */
export class AuditLogger {
  private config: LoggingConfig;
  private dataResidency?: DataResidencyConfig;
  private lastHash: string | null = null;
  private initialized = false;

  /**
   * @param config - Logging configuration (output directory, retention, hash algorithm).
   * @param dataResidency - Optional GDPR data residency and PII redaction config.
   */
  constructor(config: LoggingConfig, dataResidency?: DataResidencyConfig) {
    this.config = config;
    this.dataResidency = dataResidency;
  }

  /**
   * Initialize the logger: create output directory if needed, load chain state.
   * Called automatically on first log() if not called explicitly.
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    await fs.mkdir(this.config.outputDir, { recursive: true });
    const lastHash = await loadChainState(this.config.outputDir);
    this.lastHash = lastHash;
    this.initialized = true;
  }

  /**
   * Log a tool call to the audit trail.
   *
   * Creates an AuditLogEntry with hash chain linkage, PII redaction, and contentHash.
   * Appends to daily NDJSON file and updates chain state.
   *
   * @param params - Tool call details to log.
   * @returns The complete audit log entry (with hash and redacted args).
   */
  async log(params: {
    tool: string;
    args: Record<string, unknown>;
    risk: RiskLevel;
    oversight: OversightResult;
    result: { status: 'success' | 'error' | 'denied'; error?: string; content?: unknown };
    durationMs: number;
    agentId?: string;
    sessionId?: string;
  }): Promise<AuditLogEntry> {
    // Auto-init if not yet initialized
    if (!this.initialized) {
      await this.init();
    }

    // 1. Redact PII from args if configured
    let redactedArgs = params.args;
    if (this.dataResidency?.redactInLogs && this.dataResidency.piiFields.length > 0) {
      redactedArgs = redactFields(params.args, this.dataResidency.piiFields);
    }

    // 2. Compute contentHash of result.content (SHA-256 of JSON.stringify), do NOT store raw content
    let contentHash: string | undefined;
    if (params.result.content !== undefined) {
      const contentStr = JSON.stringify(params.result.content);
      contentHash = crypto.createHash('sha256').update(contentStr).digest('hex');
    }

    // 3. Build the entry with hash field temporarily empty
    const entry: AuditLogEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      prevHash: this.lastHash ?? 'genesis',
      hash: '', // Placeholder — computed next
      tool: params.tool,
      args: redactedArgs,
      risk: params.risk,
      oversight: params.oversight,
      result: {
        status: params.result.status,
        ...(params.result.error !== undefined ? { error: params.result.error } : {}),
        ...(contentHash !== undefined ? { contentHash } : {}),
      },
      durationMs: params.durationMs,
      ...(params.agentId !== undefined ? { agentId: params.agentId } : {}),
      ...(params.sessionId !== undefined ? { sessionId: params.sessionId } : {}),
      schemaVersion: '0.1.0',
    };

    // 4. Compute hash (with hash field excluded by computeEntryHash)
    entry.hash = computeEntryHash(entry, this.config.hashAlgorithm ?? 'sha256');

    // 5. Update chain state
    this.lastHash = entry.hash;

    // 6. Append to daily NDJSON file (UTC date)
    const dateStr = this.getUTCDateString();
    const filePath = path.join(this.config.outputDir, `${dateStr}.ndjson`);
    await fs.appendFile(filePath, JSON.stringify(entry) + '\n', 'utf-8');

    // 7. Save chain state after each entry
    await saveChainState(this.config.outputDir, this.lastHash);

    return entry;
  }

  /**
   * Generate a compliance report for a date range.
   *
   * Reads all NDJSON files between `from` and `to` dates, parses entries,
   * computes summary statistics, and verifies chain integrity.
   *
   * @param from - Start date (ISO 8601 date string, e.g. "2026-03-01").
   * @param to - End date (ISO 8601 date string, e.g. "2026-03-31").
   * @returns Compliance report with summary statistics.
   */
  async generateReport(from: string, to: string): Promise<ComplianceReport> {
    if (!this.initialized) {
      await this.init();
    }

    // Read all NDJSON files in range
    const entries = await this.readEntriesInRange(from, to);

    // Compute summary stats
    const byRisk: Record<RiskLevel, number> = { low: 0, medium: 0, high: 0, critical: 0 };
    const byOversight: Record<OversightStatus, number> = {
      approved: 0,
      denied: 0,
      timeout: 0,
      'not-required': 0,
    };
    const byResult: Record<'success' | 'error' | 'denied', number> = {
      success: 0,
      error: 0,
      denied: 0,
    };
    const toolsSet = new Set<string>();

    for (const entry of entries) {
      byRisk[entry.risk]++;
      byOversight[entry.oversight.status]++;
      byResult[entry.result.status]++;
      toolsSet.add(entry.tool);
    }

    // Verify chain integrity
    const chainIntegrity: ChainVerificationResult = await verifyChain(this.config.outputDir);

    return {
      from,
      to,
      totalActions: entries.length,
      byRisk,
      byOversight,
      byResult,
      toolsCalled: Array.from(toolsSet),
      chainIntegrity,
    };
  }

  /**
   * Flush and clean up. Saves chain state for continuity across restarts.
   */
  async shutdown(): Promise<void> {
    if (this.lastHash !== null) {
      await saveChainState(this.config.outputDir, this.lastHash);
    }
  }

  /**
   * Get the current UTC date as YYYY-MM-DD string.
   *
   * @returns Date string for daily NDJSON file naming.
   */
  private getUTCDateString(): string {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const day = String(now.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Read all audit log entries from NDJSON files within a date range.
   *
   * @param from - Start date (YYYY-MM-DD or ISO 8601).
   * @param to - End date (YYYY-MM-DD or ISO 8601).
   * @returns Array of parsed AuditLogEntry objects.
   */
  private async readEntriesInRange(from: string, to: string): Promise<AuditLogEntry[]> {
    const fromDate = from.slice(0, 10); // Extract YYYY-MM-DD
    const toDate = to.slice(0, 10);

    let dirEntries: string[];
    try {
      dirEntries = await fs.readdir(this.config.outputDir);
    } catch {
      return [];
    }

    const ndjsonFiles = dirEntries
      .filter((f) => f.endsWith('.ndjson'))
      .sort()
      .filter((f) => {
        const fileDate = f.replace('.ndjson', '');
        return fileDate >= fromDate && fileDate <= toDate;
      });

    const entries: AuditLogEntry[] = [];
    for (const file of ndjsonFiles) {
      const content = await fs.readFile(
        path.join(this.config.outputDir, file),
        'utf-8',
      );
      const lines = content.split('\n').filter((line) => line.trim().length > 0);
      for (const line of lines) {
        entries.push(JSON.parse(line) as AuditLogEntry);
      }
    }

    return entries;
  }
}
