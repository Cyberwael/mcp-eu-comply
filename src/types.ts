/**
 * Core types for mcp-eu-comply.
 *
 * Designed to meet EU AI Act Article 12 (record-keeping), Article 14 (human oversight),
 * and Article 19 (quality of auto-generated logs) requirements.
 *
 * @module types
 */

// ---------------------------------------------------------------------------
// Enums / Union Types
// ---------------------------------------------------------------------------

/** Risk classification levels aligned with EU AI Act risk categories. */
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

/** Status of a human oversight decision. */
export type OversightStatus = 'approved' | 'denied' | 'timeout' | 'not-required';

/** Action to take when human oversight times out. Default: 'deny' (precautionary). */
export type TimeoutAction = 'deny' | 'allow' | 'escalate';

/** Data residency regions. */
export type DataRegion = 'EU' | 'FR' | 'DE' | 'custom';

// ---------------------------------------------------------------------------
// Risk Classification
// ---------------------------------------------------------------------------

/** A rule that maps tool names (and optionally args) to a risk level. */
export interface RiskRule {
  /** Pattern to match against the tool name. String for exact match, RegExp for pattern. */
  toolPattern: RegExp | string;

  /** Risk level to assign when the pattern matches. */
  level: RiskLevel;

  /** Optional patterns to match against tool arguments for finer classification. */
  argsPattern?: Record<string, RegExp | string>;
}

// ---------------------------------------------------------------------------
// Logging Configuration
// ---------------------------------------------------------------------------

/** Configuration for the audit log storage. */
export interface LoggingConfig {
  /** Directory where NDJSON log files and chain-state.json are stored. */
  outputDir: string;

  /** Log retention policy. */
  retention?: {
    /** Number of days to retain logs. Article 12 recommends at least system lifetime. */
    days: number;
  };

  /** Hash algorithm for the chain. Default: 'sha256'. */
  hashAlgorithm?: 'sha256' | 'sha384' | 'sha512';
}

// ---------------------------------------------------------------------------
// Human Oversight
// ---------------------------------------------------------------------------

/** Configuration for the human-in-the-loop oversight engine. */
export interface OversightConfig {
  /** Risk levels that require human approval before the action proceeds. */
  requireApproval: RiskLevel[];

  /** Risk levels that trigger a non-blocking notification. */
  notifyOn?: RiskLevel[];

  /** Webhook URL for approval requests and notifications. */
  webhook?: string;

  /** Custom oversight handler (alternative to webhook). */
  handler?: OversightHandler;

  /** Maximum time in ms to wait for a human response. */
  timeoutMs: number;

  /** Action to take if the human does not respond in time. Default: 'deny'. */
  onTimeout: TimeoutAction;
}

/** Handler interface for human oversight decisions. */
export interface OversightHandler {
  /**
   * Request human approval for a tool action. Must resolve within the configured timeout.
   * @param request - Details of the action requiring approval.
   * @returns The human's decision.
   */
  requestApproval(request: OversightRequest): Promise<OversightDecision>;

  /**
   * Send a non-blocking notification about a tool action.
   * @param notification - Details of the action being notified.
   */
  notify?(notification: OversightNotification): Promise<void>;
}

/** Payload sent to the oversight handler when approval is required. */
export interface OversightRequest {
  /** Unique ID for this oversight request. */
  id: string;

  /** Name of the MCP tool being called. */
  tool: string;

  /** Tool arguments (PII redacted). */
  args: Record<string, unknown>;

  /** Classified risk level. */
  risk: RiskLevel;

  /** ISO 8601 UTC timestamp of the request. */
  timestamp: string;

  /** MCP context. */
  context: {
    sessionId?: string;
    agentId?: string;
  };
}

/** Human decision on an oversight request. */
export interface OversightDecision {
  /** Whether the action is approved or denied. */
  status: 'approved' | 'denied';

  /** Identifier of the human who made the decision. */
  approvedBy: string;

  /** Optional reason for the decision. */
  reason?: string;
}

/** Payload sent for non-blocking notifications. */
export interface OversightNotification {
  /** Name of the MCP tool being called. */
  tool: string;

  /** Tool arguments (PII redacted). */
  args: Record<string, unknown>;

  /** Classified risk level. */
  risk: RiskLevel;

  /** ISO 8601 UTC timestamp. */
  timestamp: string;
}

/** Result of an oversight check, included in the audit log entry. */
export interface OversightResult {
  /** Whether human approval was required. */
  required: boolean;

  /** Outcome of the oversight check. */
  status: OversightStatus;

  /** Who approved/denied (if applicable). */
  approvedBy?: string;

  /** When the decision was made (ISO 8601 UTC). */
  approvedAt?: string;

  /** Reason for the decision. */
  reason?: string;
}

// ---------------------------------------------------------------------------
// Data Residency
// ---------------------------------------------------------------------------

/** Configuration for GDPR data residency and PII handling. */
export interface DataResidencyConfig {
  /** Target data residency region. */
  region: DataRegion;

  /** Field names to treat as PII. Case-insensitive matching. */
  piiFields: string[];

  /** Whether to redact PII fields in audit logs. */
  redactInLogs: boolean;
}

// ---------------------------------------------------------------------------
// Top-Level Configuration
// ---------------------------------------------------------------------------

/** Full compliance configuration passed to wrapWithCompliance(). */
export interface ComplianceConfig {
  /** Rules for classifying tool calls by risk level. */
  riskRules: RiskRule[];

  /** Audit log storage configuration. */
  logging: LoggingConfig;

  /** Human oversight configuration (optional). */
  oversight?: OversightConfig;

  /** Data residency and PII redaction configuration (optional). */
  dataResidency?: DataResidencyConfig;
}

// ---------------------------------------------------------------------------
// Audit Log Entry
// ---------------------------------------------------------------------------

/** A single entry in the tamper-evident audit log. */
export interface AuditLogEntry {
  /** UUIDv4 unique identifier. */
  id: string;

  /** ISO 8601 UTC timestamp. */
  timestamp: string;

  /** SHA-256 hash of the previous entry, or "genesis" for the first entry. */
  prevHash: string;

  /** SHA-256 hash of this entry (computed with this field excluded). */
  hash: string;

  /** Name of the MCP tool called. */
  tool: string;

  /** Tool arguments (PII redacted if configured). */
  args: Record<string, unknown>;

  /** Classified risk level. */
  risk: RiskLevel;

  /** Human oversight details. */
  oversight: OversightResult;

  /** Result of the tool call. */
  result: {
    /** Whether the call succeeded, errored, or was denied. */
    status: 'success' | 'error' | 'denied';

    /** Error message if status is 'error'. */
    error?: string;

    /** SHA-256 hash of the tool output content. */
    contentHash?: string;
  };

  /** Execution duration in milliseconds. */
  durationMs: number;

  /** Agent identifier (from MCP auth info if available). */
  agentId?: string;

  /** MCP session identifier. */
  sessionId?: string;

  /** Schema version for forward compatibility. */
  schemaVersion: '0.1.0';
}

// ---------------------------------------------------------------------------
// Chain Verification
// ---------------------------------------------------------------------------

/** Result of verifying a hash chain's integrity. */
export interface ChainVerificationResult {
  /** Whether the entire chain is valid. */
  valid: boolean;

  /** Total number of entries verified. */
  entries: number;

  /** Index (0-based) of the first broken entry, if any. */
  firstBrokenAt?: number;

  /** Description of the error, if any. */
  error?: string;
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

/** Summary report of audit log activity for a given period. */
export interface ComplianceReport {
  /** Start of the report period (ISO 8601 UTC). */
  from: string;

  /** End of the report period (ISO 8601 UTC). */
  to: string;

  /** Total number of logged actions. */
  totalActions: number;

  /** Breakdown by risk level. */
  byRisk: Record<RiskLevel, number>;

  /** Breakdown by oversight status. */
  byOversight: Record<OversightStatus, number>;

  /** Breakdown by result status. */
  byResult: Record<'success' | 'error' | 'denied', number>;

  /** List of unique tools called. */
  toolsCalled: string[];

  /** Hash chain integrity status. */
  chainIntegrity: ChainVerificationResult;
}
