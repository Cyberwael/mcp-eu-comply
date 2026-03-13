/**
 * Pre-built compliance template designed to meet DORA (Digital Operational
 * Resilience Act) requirements for fintech and financial services.
 *
 * DORA requires a minimum 5-year (1 825 days) retention period for ICT-related
 * incident records and audit trails (Article 28). This template sets that default.
 *
 * Usage:
 * ```ts
 * import { doraFintech } from 'mcp-eu-comply';
 *
 * const config: ComplianceConfig = {
 *   ...doraFintech,
 *   logging: { ...doraFintech.logging!, outputDir: './logs' },
 * };
 * ```
 *
 * @module templates/dora-fintech
 */

import type { ComplianceConfig } from '../types.js';

/**
 * DORA fintech compliance template.
 *
 * Provides risk rules for payment operations, data residency with common
 * financial PII fields, oversight requiring approval for critical and high
 * risk actions, and a 5-year log retention policy.
 *
 * The consumer **must** override `logging.outputDir` with a real path.
 */
export const doraFintech: Partial<ComplianceConfig> = {
  riskRules: [
    {
      toolPattern: /payment|transfer|withdraw/i,
      level: 'critical',
    },
    {
      toolPattern: /write|send|update/i,
      level: 'high',
    },
    {
      toolPattern: /read|query|list/i,
      level: 'low',
    },
  ],

  dataResidency: {
    region: 'EU',
    piiFields: [
      'iban',
      'account_number',
      'bic',
      'ssn',
      'tax_id',
      'date_of_birth',
      'email',
      'phone',
      'name',
      'address',
    ],
    redactInLogs: true,
  },

  oversight: {
    requireApproval: ['critical', 'high'],
    timeoutMs: 300_000,
    onTimeout: 'deny',
  },

  /**
   * DORA Article 28 requires a minimum 5-year retention (1 825 days).
   * The consumer MUST override `outputDir` with a real path before use.
   */
  logging: {
    outputDir: '',
    retention: { days: 1825 },
  },
};
