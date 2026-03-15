/**
 * CLI demo command — interactive demonstration of mcp-eu-comply compliance features.
 *
 * Runs a self-contained simulation showing audit logging, risk classification,
 * PII redaction, human oversight, and hash chain verification.
 * No real MCP server needed — exercises compliance components directly.
 *
 * Designed to meet EU AI Act Article 12, 14, and 19 requirements.
 *
 * @module cli/demo
 */

import { mkdtemp, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { AuditLogger } from '../logger/audit-logger.js';
import { classifyRisk } from '../classifier/risk-classifier.js';
import { redactFields } from '../logger/pii-redactor.js';
import { verifyChain } from '../logger/hash-chain.js';
import type { RiskRule, OversightResult, RiskLevel } from '../types.js';

// ---------------------------------------------------------------------------
// Demo Scenarios
// ---------------------------------------------------------------------------

interface DemoScenario {
  /** Tool name being called. */
  tool: string;
  /** Tool arguments. */
  args: Record<string, unknown>;
  /** Description shown in terminal. */
  description: string;
  /** Simulated oversight result. */
  oversight: OversightResult;
  /** Simulated result status. */
  resultStatus: 'success' | 'error' | 'denied';
  /** Simulated duration in ms. */
  durationMs: number;
}

const DEMO_RISK_RULES: RiskRule[] = [
  { toolPattern: /delete|drop|remove/i, level: 'critical' },
  { toolPattern: /transfer|payment/i, level: 'critical' },
  { toolPattern: /write|update|send/i, level: 'high' },
  { toolPattern: /export|bulk/i, level: 'high' },
  { toolPattern: /read|get|list|search/i, level: 'low' },
  { toolPattern: /.*/, level: 'medium' },
];

const DEMO_PII_FIELDS = ['email', 'name', 'phone', 'iban', 'address'];

const DEMO_SCENARIOS: DemoScenario[] = [
  {
    tool: 'get_account',
    args: { accountId: 'ACC-1234' },
    description: 'Read-only account lookup',
    oversight: { required: false, status: 'not-required' },
    resultStatus: 'success',
    durationMs: 45,
  },
  {
    tool: 'update_profile',
    args: { userId: 'U-5678', name: 'Maria Schmidt', email: 'maria@example.eu', city: 'Berlin' },
    description: 'Profile update with PII fields',
    oversight: { required: false, status: 'not-required' },
    resultStatus: 'success',
    durationMs: 120,
  },
  {
    tool: 'send_notification',
    args: { to: 'ops@example.eu', subject: 'Alert', body: 'Threshold exceeded' },
    description: 'High-risk notification send',
    oversight: { required: true, status: 'approved', approvedBy: 'ops-lead@example.eu', approvedAt: new Date().toISOString() },
    resultStatus: 'success',
    durationMs: 230,
  },
  {
    tool: 'export_bulk_data',
    args: { format: 'csv', records: 15000, email: 'analyst@example.eu' },
    description: 'Bulk data export with PII',
    oversight: { required: true, status: 'approved', approvedBy: 'data-officer@example.eu', approvedAt: new Date().toISOString() },
    resultStatus: 'success',
    durationMs: 3400,
  },
  {
    tool: 'transfer_funds',
    args: { amount: 25000, currency: 'EUR', iban: 'DE89370400440532013000', name: 'Hans Mueller', fromIban: 'FR7630006000011234567890189' },
    description: 'Critical fund transfer — requires human approval',
    oversight: { required: true, status: 'approved', approvedBy: 'cfo@example.eu', approvedAt: new Date().toISOString(), reason: 'Under daily limit' },
    resultStatus: 'success',
    durationMs: 1850,
  },
  {
    tool: 'delete_user',
    args: { userId: 'U-9999', name: 'Test User', email: 'test@example.eu', reason: 'GDPR Art 17 — right to erasure' },
    description: 'Critical deletion — human oversight DENIED',
    oversight: { required: true, status: 'denied', approvedBy: 'compliance@example.eu', reason: 'Pending audit — cannot delete during investigation' },
    resultStatus: 'denied',
    durationMs: 15200,
  },
  {
    tool: 'drop_table',
    args: { table: 'legacy_sessions', database: 'production' },
    description: 'Critical DDL — oversight TIMEOUT (auto-denied)',
    oversight: { required: true, status: 'timeout' },
    resultStatus: 'denied',
    durationMs: 30000,
  },
];

// ---------------------------------------------------------------------------
// Terminal Formatting
// ---------------------------------------------------------------------------

const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const MAGENTA = '\x1b[35m';

function riskColor(level: RiskLevel): string {
  switch (level) {
    case 'low': return GREEN;
    case 'medium': return YELLOW;
    case 'high': return MAGENTA;
    case 'critical': return RED;
  }
}

function oversightBadge(status: string): string {
  switch (status) {
    case 'approved': return `${GREEN}APPROVED${RESET}`;
    case 'denied': return `${RED}DENIED${RESET}`;
    case 'timeout': return `${RED}TIMEOUT → DENIED${RESET}`;
    case 'not-required': return `${DIM}not required${RESET}`;
    default: return status;
  }
}

function resultBadge(status: string): string {
  switch (status) {
    case 'success': return `${GREEN}success${RESET}`;
    case 'denied': return `${RED}denied${RESET}`;
    case 'error': return `${RED}error${RESET}`;
    default: return status;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface DemoOptions {
  /** Keep the temp audit log directory after demo completes. */
  keep: boolean;
  /** Custom output directory (instead of temp). */
  dir?: string;
}

/**
 * Run the interactive compliance demo.
 *
 * Creates audit log entries in a temporary directory, demonstrating risk classification,
 * PII redaction, human oversight, and hash chain integrity — then verifies the chain.
 *
 * @param options - Demo options.
 * @returns Path to the audit log directory (if --keep or --dir was used).
 */
export async function runDemo(options: DemoOptions): Promise<string> {
  const outputDir = options.dir ?? await mkdtemp(join(tmpdir(), 'mcp-eu-comply-demo-'));

  console.log('');
  console.log(`${BOLD}mcp-eu-comply${RESET} — Interactive Compliance Demo`);
  console.log(`${DIM}Designed to meet EU AI Act Article 12, 14, and 19 requirements${RESET}`);
  console.log('');
  console.log(`${DIM}Audit logs → ${outputDir}${RESET}`);
  console.log('');

  // Initialize logger with PII redaction
  const logger = new AuditLogger(
    { outputDir, retention: { days: 365 } },
    { region: 'EU', piiFields: DEMO_PII_FIELDS, redactInLogs: true },
  );
  await logger.init();

  // Run each scenario
  console.log(`${BOLD}Running ${DEMO_SCENARIOS.length} simulated tool calls...${RESET}`);
  console.log('');

  for (let i = 0; i < DEMO_SCENARIOS.length; i++) {
    const scenario = DEMO_SCENARIOS[i]!;
    const stepNum = `[${i + 1}/${DEMO_SCENARIOS.length}]`;

    // Classify risk
    const risk = classifyRisk(scenario.tool, scenario.args, DEMO_RISK_RULES);
    const color = riskColor(risk);

    // Show PII redaction if applicable
    const redacted = redactFields(scenario.args, DEMO_PII_FIELDS);
    const hasRedaction = JSON.stringify(redacted).includes('***REDACTED***');

    // Print scenario
    console.log(`${BOLD}${stepNum}${RESET} ${CYAN}${scenario.tool}${RESET}  ${DIM}— ${scenario.description}${RESET}`);
    console.log(`    Risk: ${color}${risk.toUpperCase()}${RESET}    Oversight: ${oversightBadge(scenario.oversight.status)}    Result: ${resultBadge(scenario.resultStatus)}`);

    if (hasRedaction) {
      console.log(`    ${MAGENTA}PII redacted:${RESET} ${DIM}${JSON.stringify(redacted)}${RESET}`);
    }

    // Log to audit trail
    const entry = await logger.log({
      tool: scenario.tool,
      args: scenario.args,
      risk,
      oversight: scenario.oversight,
      result: { status: scenario.resultStatus, content: `Demo result for ${scenario.tool}` },
      durationMs: scenario.durationMs,
      sessionId: 'demo-session',
    });

    console.log(`    ${DIM}Hash: ${entry.hash.slice(0, 30)}...${RESET}`);
    console.log('');
  }

  // Verify chain
  console.log(`${BOLD}Verifying hash chain integrity...${RESET}`);
  const verification = await verifyChain(outputDir);

  if (verification.valid) {
    console.log(`${GREEN}PASS${RESET} — ${verification.entries} entries, chain intact`);
  } else {
    console.log(`${RED}FAIL${RESET} — chain broken at entry ${verification.firstBrokenAt ?? 'unknown'}`);
  }
  console.log('');

  // Summary
  console.log(`${BOLD}Summary${RESET}`);
  console.log(`  Entries logged:     ${DEMO_SCENARIOS.length}`);
  console.log(`  Risk levels:        ${summarizeRisks()}`);
  console.log(`  Oversight required: ${DEMO_SCENARIOS.filter((s) => s.oversight.required).length}`);
  console.log(`  Approved:           ${DEMO_SCENARIOS.filter((s) => s.oversight.status === 'approved').length}`);
  console.log(`  Denied:             ${DEMO_SCENARIOS.filter((s) => s.oversight.status === 'denied').length}`);
  console.log(`  Timeout:            ${DEMO_SCENARIOS.filter((s) => s.oversight.status === 'timeout').length}`);
  console.log(`  PII redacted:       ${DEMO_SCENARIOS.filter((s) => JSON.stringify(redactFields(s.args, DEMO_PII_FIELDS)).includes('***REDACTED***')).length} entries`);
  console.log(`  Chain integrity:    ${verification.valid ? `${GREEN}VALID${RESET}` : `${RED}BROKEN${RESET}`}`);
  console.log('');

  // Cleanup or keep
  if (!options.keep && options.dir === undefined) {
    await rm(outputDir, { recursive: true });
    console.log(`${DIM}Temp audit logs cleaned up. Use --keep to preserve them.${RESET}`);
  } else {
    console.log(`Audit logs saved to: ${BOLD}${outputDir}${RESET}`);
    console.log(`${DIM}Inspect: cat ${outputDir}/*.ndjson | head -1 | jq .${RESET}`);
    console.log(`${DIM}Verify:  npx mcp-eu-comply verify --dir ${outputDir}${RESET}`);
    console.log(`${DIM}Report:  npx mcp-eu-comply report --dir ${outputDir} --format human${RESET}`);
  }

  console.log('');
  console.log(`${DIM}Learn more: https://github.com/Cyberwael/mcp-eu-comply${RESET}`);

  return outputDir;
}

/**
 * Summarize risk distribution for demo scenarios.
 */
function summarizeRisks(): string {
  const counts: Record<RiskLevel, number> = { low: 0, medium: 0, high: 0, critical: 0 };
  for (const scenario of DEMO_SCENARIOS) {
    const risk = classifyRisk(scenario.tool, scenario.args, DEMO_RISK_RULES);
    counts[risk]++;
  }
  const parts: string[] = [];
  if (counts.low > 0) parts.push(`${GREEN}${counts.low} low${RESET}`);
  if (counts.medium > 0) parts.push(`${YELLOW}${counts.medium} medium${RESET}`);
  if (counts.high > 0) parts.push(`${MAGENTA}${counts.high} high${RESET}`);
  if (counts.critical > 0) parts.push(`${RED}${counts.critical} critical${RESET}`);
  return parts.join(', ');
}
