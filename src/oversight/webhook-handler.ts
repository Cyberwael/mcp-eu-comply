/**
 * Default webhook-based oversight handler.
 *
 * Sends HTTP POST requests to a configured webhook URL for approval requests
 * and notifications. Designed to meet EU AI Act Article 14 requirements.
 *
 * @module webhook-handler
 */

import {
  OversightHandler,
  OversightRequest,
  OversightDecision,
  OversightNotification,
} from '../types.js';

/**
 * OversightHandler implementation that sends HTTP POST requests to a webhook URL.
 *
 * For approval requests, expects the webhook to respond with:
 * `{ status: 'approved' | 'denied', approvedBy: string, reason?: string }`
 */
export class WebhookHandler implements OversightHandler {
  private webhookUrl: string;

  constructor(webhookUrl: string) {
    this.webhookUrl = webhookUrl;
  }

  /**
   * Request human approval by POSTing to the webhook.
   *
   * @param request - The oversight request details.
   * @returns The human's decision from the webhook response.
   * @throws If the webhook responds with a non-OK status.
   */
  async requestApproval(request: OversightRequest): Promise<OversightDecision> {
    const response = await fetch(this.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'approval_request', ...request }),
    });

    if (!response.ok) {
      throw new Error(`Webhook responded with status ${response.status}`);
    }

    const decision = (await response.json()) as OversightDecision;
    return decision;
  }

  /**
   * Send a non-blocking notification to the webhook.
   * Errors are swallowed — notifications must never block tool execution.
   *
   * @param notification - The notification details.
   */
  async notify(notification: OversightNotification): Promise<void> {
    try {
      await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'notification', ...notification }),
      });
    } catch {
      // Swallow errors for non-blocking notifications
    }
  }
}
