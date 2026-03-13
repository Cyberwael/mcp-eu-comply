/**
 * mcp-eu-comply — EU AI Act compliance layer for MCP servers.
 *
 * This is the public API entry point. It exposes the main `wrapWithCompliance`
 * function, the `verifyChain` audit-log verifier, and all configuration /
 * result types needed by consumers.
 *
 * Internal implementation classes (AuditLogger, RiskClassifier, OversightEngine,
 * WebhookHandler) are intentionally kept private.
 *
 * @module mcp-eu-comply
 */

// ---------------------------------------------------------------------------
// Runtime exports
// ---------------------------------------------------------------------------

export { wrapWithCompliance } from './wrapper/compliance-wrapper.js';
export { verifyChain } from './logger/hash-chain.js';

// ---------------------------------------------------------------------------
// Type-only exports
// ---------------------------------------------------------------------------

export type {
  ComplianceConfig,
  RiskRule,
  LoggingConfig,
  OversightConfig,
  DataResidencyConfig,
  AuditLogEntry,
  RiskLevel,
  OversightStatus,
  TimeoutAction,
  DataRegion,
  OversightHandler,
  OversightRequest,
  OversightDecision,
  OversightNotification,
  OversightResult,
  ChainVerificationResult,
  VerifyResult,
  ComplianceReport,
} from './types.js';
