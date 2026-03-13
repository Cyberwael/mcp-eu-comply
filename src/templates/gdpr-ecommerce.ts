/**
 * Pre-built compliance template designed to meet GDPR requirements for
 * e-commerce platforms.
 *
 * Covers typical e-commerce operations: product catalog reads (low risk),
 * order and profile mutations (high risk), and destructive data operations
 * like deletion or dropping tables (critical risk, requiring human approval).
 *
 * Usage:
 * ```ts
 * import { gdprEcommerce } from 'mcp-eu-comply';
 *
 * const config: ComplianceConfig = {
 *   ...gdprEcommerce,
 *   logging: { outputDir: './logs' },
 * };
 * ```
 *
 * @module templates/gdpr-ecommerce
 */

import type { ComplianceConfig } from '../types.js';

/**
 * GDPR e-commerce compliance template.
 *
 * Provides risk rules for e-commerce operations, EU data residency with
 * common consumer PII fields, and oversight requiring approval for
 * critical (destructive) actions.
 */
export const gdprEcommerce: Partial<ComplianceConfig> = {
  riskRules: [
    {
      toolPattern: /delete|drop/i,
      level: 'critical',
    },
    {
      toolPattern: /profile|order|address/i,
      level: 'high',
    },
    {
      toolPattern: /product|catalog|search/i,
      level: 'low',
    },
  ],

  dataResidency: {
    region: 'EU',
    piiFields: [
      'email',
      'name',
      'address',
      'phone',
      'credit_card',
      'date_of_birth',
    ],
    redactInLogs: true,
  },

  oversight: {
    requireApproval: ['critical'],
    timeoutMs: 60_000,
    onTimeout: 'deny',
  },
};
