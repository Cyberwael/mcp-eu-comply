/**
 * fintech-server.ts — DORA-compliant fintech MCP server example.
 *
 * Demonstrates a financial services server where:
 * - All payment/transfer/withdrawal tools are classified as critical risk
 * - Human oversight is required for critical AND high risk tool calls
 * - Medium-risk calls trigger non-blocking notifications
 * - Webhook integration sends approval requests to an internal compliance system
 * - PII fields (IBAN, name, email) are redacted in audit logs (GDPR Article 5)
 * - 5-minute timeout with deny-by-default (precautionary principle)
 * - Tamper-evident audit logging with SHA-256 hash chain (EU AI Act Article 12)
 *
 * Designed to meet DORA (Digital Operational Resilience Act) requirements for
 * ICT risk management in the financial sector.
 *
 * Usage:
 *   npx ts-node examples/fintech-server.ts
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { wrapWithCompliance } from 'mcp-eu-comply';
import type { ComplianceConfig } from 'mcp-eu-comply';

// ---------------------------------------------------------------------------
// Compliance configuration — full DORA-aligned setup
// ---------------------------------------------------------------------------

const config: ComplianceConfig = {
  // Risk classification rules — evaluated in order, first match wins
  riskRules: [
    // Critical: any tool that moves money or creates mandates
    { toolPattern: /transfer|withdraw|payment_mandate/, level: 'critical' },

    // High: balance inquiries reveal sensitive financial data
    { toolPattern: /balance/, level: 'high' },

    // Medium: transaction history — sensitive but read-only
    { toolPattern: /transaction/, level: 'medium' },

    // Low: informational tools (exchange rates, branch info, etc.)
    { toolPattern: /list|get|info/, level: 'low' },
  ],

  // Audit logging — NDJSON with SHA-256 hash chain
  logging: {
    outputDir: './audit-logs/fintech',
    retention: {
      // DORA requires 5 years minimum for ICT-related records
      days: 1825,
    },
    hashAlgorithm: 'sha256',
  },

  // Human oversight — critical and high risk require approval
  oversight: {
    // These risk levels MUST be approved by a human before execution
    requireApproval: ['critical', 'high'],

    // Medium risk sends a non-blocking notification to the compliance team
    notifyOn: ['medium'],

    // Webhook URL for the internal approval system (Slack, PagerDuty, custom UI, etc.)
    webhook: 'https://compliance.internal.bank/api/mcp-approval',

    // 5-minute window for human response
    timeoutMs: 5 * 60 * 1000,

    // If no human responds within 5 minutes, DENY the action (precautionary)
    onTimeout: 'deny',
  },

  // Data residency and PII redaction — GDPR compliance
  dataResidency: {
    region: 'EU',
    piiFields: ['iban', 'name', 'email', 'phone', 'address', 'account_number'],
    redactInLogs: true,
  },
};

// ---------------------------------------------------------------------------
// Server setup
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'fintech-compliance-server',
  version: '1.0.0',
});

const compliantServer = wrapWithCompliance(server, config);

// ---------------------------------------------------------------------------
// Tool: check_balance (high risk — requires human approval)
// ---------------------------------------------------------------------------

compliantServer.tool(
  'check_balance',
  { description: 'Check the current balance of a bank account' },
  async (args: { account_id: string }) => {
    // In production: call the core banking API
    const balance = 12_450.75;
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          account_id: args.account_id,
          balance,
          currency: 'EUR',
          as_of: new Date().toISOString(),
        }),
      }],
    };
  }
);

// ---------------------------------------------------------------------------
// Tool: transfer_funds (critical risk — requires human approval)
// ---------------------------------------------------------------------------

compliantServer.tool(
  'transfer_funds',
  { description: 'Transfer funds between accounts via SEPA' },
  async (args: {
    from_iban: string;
    to_iban: string;
    amount: number;
    currency: string;
    reference: string;
  }) => {
    // In production: initiate SEPA transfer via payment processor
    // The compliance layer has already obtained human approval before reaching here
    const transferId = `TRF-${Date.now()}`;
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          transfer_id: transferId,
          status: 'pending',
          from_iban: args.from_iban,
          to_iban: args.to_iban,
          amount: args.amount,
          currency: args.currency,
          reference: args.reference,
          initiated_at: new Date().toISOString(),
        }),
      }],
    };
  }
);

// ---------------------------------------------------------------------------
// Tool: list_transactions (medium risk — notification sent, no approval needed)
// ---------------------------------------------------------------------------

compliantServer.tool(
  'list_transactions',
  { description: 'List recent transactions for an account' },
  async (args: { account_id: string; limit?: number }) => {
    // In production: query transaction database
    const transactions = [
      { id: 'TXN-001', amount: -250.00, description: 'SEPA Transfer', date: '2026-03-12' },
      { id: 'TXN-002', amount: 1500.00, description: 'Salary Credit', date: '2026-03-11' },
      { id: 'TXN-003', amount: -42.99, description: 'Online Purchase', date: '2026-03-10' },
    ];
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          account_id: args.account_id,
          transactions: transactions.slice(0, args.limit ?? 10),
        }),
      }],
    };
  }
);

// ---------------------------------------------------------------------------
// Tool: create_payment_mandate (critical risk — requires human approval)
// ---------------------------------------------------------------------------

compliantServer.tool(
  'create_payment_mandate',
  { description: 'Create a SEPA Direct Debit mandate' },
  async (args: {
    creditor_name: string;
    creditor_iban: string;
    debtor_name: string;
    debtor_iban: string;
    max_amount: number;
  }) => {
    // In production: register mandate with the payment scheme
    const mandateId = `MNDT-${Date.now()}`;
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          mandate_id: mandateId,
          status: 'pending_signature',
          creditor: args.creditor_name,
          debtor: args.debtor_name,
          max_amount: args.max_amount,
          currency: 'EUR',
          created_at: new Date().toISOString(),
        }),
      }],
    };
  }
);

// ---------------------------------------------------------------------------
// Start the server
// ---------------------------------------------------------------------------

const transport = new StdioServerTransport();
await compliantServer.connect(transport);

console.error('[fintech-server] DORA-compliant MCP server running on stdio');
