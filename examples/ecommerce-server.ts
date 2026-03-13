/**
 * ecommerce-server.ts — E-commerce agent MCP server example.
 *
 * Demonstrates an online retail server where an AI agent can browse products,
 * manage a shopping cart, process checkout, and handle refunds. Risk levels
 * reflect the financial impact of each action:
 *
 * - Payment and refund tools are HIGH risk (money movement)
 * - Order creation (checkout) is MEDIUM risk (creates a commitment)
 * - Product browsing and cart management are LOW risk (no side effects)
 * - PII fields (email, address, credit card) are redacted in audit logs
 * - Human approval required for high-risk actions only
 * - 2-minute timeout with deny-by-default
 *
 * Designed to meet EU AI Act Article 12 (audit trail) and Article 14
 * (human oversight for consequential actions) requirements.
 *
 * Usage:
 *   npx ts-node examples/ecommerce-server.ts
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { wrapWithCompliance } from '../src/index.js';
import type { ComplianceConfig } from '../src/index.js';

// ---------------------------------------------------------------------------
// Compliance configuration
// ---------------------------------------------------------------------------

const config: ComplianceConfig = {
  // Risk classification rules — evaluated in order, first match wins
  riskRules: [
    // High: payment processing and refunds move real money
    { toolPattern: /checkout|refund|charge/, level: 'high' },

    // Medium: adding to cart is a step toward purchase but reversible
    { toolPattern: /add_to_cart|remove_from_cart/, level: 'medium' },

    // Low: browsing and searching have no side effects
    { toolPattern: /search|browse|get|list|view/, level: 'low' },
  ],

  // Audit logging — tamper-evident NDJSON
  logging: {
    outputDir: './audit-logs/ecommerce',
    retention: {
      // EU consumer protection: retain records for 2 years minimum
      days: 730,
    },
    hashAlgorithm: 'sha256',
  },

  // Human oversight — only high-risk actions require approval
  oversight: {
    // Payment and refund tools require human sign-off
    requireApproval: ['high'],

    // Medium-risk cart actions send a notification (no blocking)
    notifyOn: ['medium'],

    // Webhook for the merchant's back-office approval dashboard
    webhook: 'https://backoffice.shop.eu/api/agent-approvals',

    // 2-minute timeout — faster than fintech since refunds are time-sensitive
    timeoutMs: 2 * 60 * 1000,

    // Deny by default if no human responds
    onTimeout: 'deny',
  },

  // PII redaction — GDPR compliance for customer data
  dataResidency: {
    region: 'EU',
    piiFields: [
      'email',
      'address',
      'credit_card',
      'card_number',
      'phone',
      'name',
      'billing_address',
      'shipping_address',
    ],
    redactInLogs: true,
  },
};

// ---------------------------------------------------------------------------
// Server setup
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'ecommerce-agent-server',
  version: '1.0.0',
});

const compliantServer = wrapWithCompliance(server, config);

// ---------------------------------------------------------------------------
// Tool: search_products (low risk — no side effects)
// ---------------------------------------------------------------------------

compliantServer.tool(
  'search_products',
  { description: 'Search the product catalog by keyword, category, or price range' },
  async (args: { query: string; category?: string; max_price?: number }) => {
    // In production: query Elasticsearch / product database
    const products = [
      { id: 'PROD-001', name: 'Organic Cotton T-Shirt', price: 29.99, currency: 'EUR', in_stock: true },
      { id: 'PROD-002', name: 'Recycled Denim Jeans', price: 79.50, currency: 'EUR', in_stock: true },
      { id: 'PROD-003', name: 'Bamboo Fiber Socks (3-pack)', price: 14.99, currency: 'EUR', in_stock: false },
    ];

    const filtered = args.max_price
      ? products.filter((p) => p.price <= args.max_price!)
      : products;

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          query: args.query,
          results: filtered,
          total: filtered.length,
        }),
      }],
    };
  }
);

// ---------------------------------------------------------------------------
// Tool: add_to_cart (medium risk — modifies cart state)
// ---------------------------------------------------------------------------

compliantServer.tool(
  'add_to_cart',
  { description: 'Add a product to the shopping cart' },
  async (args: { product_id: string; quantity: number; session_id: string }) => {
    // In production: update cart in session store or database
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          status: 'added',
          product_id: args.product_id,
          quantity: args.quantity,
          cart_total: 109.49,
          currency: 'EUR',
          item_count: 3,
        }),
      }],
    };
  }
);

// ---------------------------------------------------------------------------
// Tool: checkout (high risk — creates a financial commitment)
// ---------------------------------------------------------------------------

compliantServer.tool(
  'checkout',
  { description: 'Process checkout: validate cart, charge payment, create order' },
  async (args: {
    session_id: string;
    email: string;
    shipping_address: string;
    card_number: string;
    payment_method: string;
  }) => {
    // The compliance layer has already:
    // 1. Classified this as HIGH risk (matches /checkout/)
    // 2. Sent an approval request to the back-office webhook
    // 3. Received human approval before reaching this code
    // 4. Redacted email, shipping_address, card_number in the audit log

    const orderId = `ORD-${Date.now()}`;
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          order_id: orderId,
          status: 'confirmed',
          payment_method: args.payment_method,
          total: 109.49,
          currency: 'EUR',
          estimated_delivery: '2026-03-18',
          confirmation_sent_to: args.email,
        }),
      }],
    };
  }
);

// ---------------------------------------------------------------------------
// Tool: process_refund (high risk — returns money to customer)
// ---------------------------------------------------------------------------

compliantServer.tool(
  'process_refund',
  { description: 'Process a full or partial refund for an order' },
  async (args: {
    order_id: string;
    reason: string;
    amount?: number;
    email: string;
  }) => {
    // In production: initiate refund via payment gateway (Stripe, Adyen, etc.)
    // Human approval was obtained by the compliance layer before reaching here
    const refundId = `RFD-${Date.now()}`;
    const refundAmount = args.amount ?? 109.49; // Full refund if no amount specified
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          refund_id: refundId,
          order_id: args.order_id,
          status: 'processing',
          amount: refundAmount,
          currency: 'EUR',
          reason: args.reason,
          estimated_completion: '5-7 business days',
          notification_sent_to: args.email,
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

console.error('[ecommerce-server] EU-compliant e-commerce MCP server running on stdio');
