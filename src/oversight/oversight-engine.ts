/**
 * Human-in-the-loop oversight engine.
 *
 * Designed to meet EU AI Act Article 14 (human oversight) requirements.
 * Implements approval workflows with configurable timeout behavior.
 *
 * @module oversight-engine
 */

import {
  OversightConfig,
  OversightHandler,
  OversightRequest,
  OversightResult,
  OversightNotification,
  OversightDecision,
  RiskLevel,
} from '../types.js';
import * as crypto from 'node:crypto';

/** Sentinel value used to distinguish timeout from handler response in Promise.race. */
const TIMEOUT_SENTINEL = Symbol('oversight-timeout');

export class OversightEngine {
  private config: OversightConfig;
  private handler: OversightHandler | null;

  constructor(config: OversightConfig) {
    this.config = config;
    this.handler = config.handler ?? null;
  }

  /**
   * Check if a tool action needs oversight and handle it.
   * Returns the oversight result to include in the audit log entry.
   *
   * @param toolName - Name of the MCP tool being called.
   * @param args - Tool arguments (should already be PII-redacted).
   * @param risk - Classified risk level of this action.
   * @param context - Optional MCP context (sessionId, agentId).
   * @returns The oversight result describing what happened.
   */
  async check(
    toolName: string,
    args: Record<string, unknown>,
    risk: RiskLevel,
    context?: { sessionId?: string; agentId?: string }
  ): Promise<OversightResult> {
    try {
      // 1. Check if this risk level requires approval
      if (this.config.requireApproval.includes(risk)) {
        return await this.handleApproval(toolName, args, risk, context);
      }

      // 2. Check if this risk level triggers a notification (non-blocking)
      if (this.config.notifyOn?.includes(risk)) {
        this.fireNotification(toolName, args, risk);
        return { required: false, status: 'not-required' };
      }

      // 3. No oversight needed
      return { required: false, status: 'not-required' };
    } catch (error) {
      // Never throw from compliance layer — catch + console.warn + return safe default
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[mcp-eu-comply] Oversight engine error: ${message}`);
      return {
        required: true,
        status: 'denied',
        reason: `Oversight engine error: ${message} — action denied (precautionary)`,
      };
    }
  }

  /**
   * Handle the approval flow: request human decision with timeout.
   */
  private async handleApproval(
    toolName: string,
    args: Record<string, unknown>,
    risk: RiskLevel,
    context?: { sessionId?: string; agentId?: string }
  ): Promise<OversightResult> {
    // No handler configured — auto-approve with warning
    if (!this.handler) {
      console.warn(
        '[mcp-eu-comply] No oversight handler configured, auto-approving'
      );
      return {
        required: true,
        status: 'approved',
        reason: 'no-handler-configured',
      };
    }

    const request: OversightRequest = {
      id: crypto.randomUUID(),
      tool: toolName,
      args,
      risk,
      timestamp: new Date().toISOString(),
      context: {
        sessionId: context?.sessionId,
        agentId: context?.agentId,
      },
    };

    // Race handler response against timeout
    const timeoutPromise = new Promise<typeof TIMEOUT_SENTINEL>((resolve) => {
      setTimeout(() => resolve(TIMEOUT_SENTINEL), this.config.timeoutMs);
    });

    const result = await Promise.race([
      this.handler.requestApproval(request),
      timeoutPromise,
    ]);

    // Timeout path
    if (result === TIMEOUT_SENTINEL) {
      return this.handleTimeout();
    }

    // Handler responded with a decision
    const decision = result as OversightDecision;
    return {
      required: true,
      status: decision.status,
      approvedBy: decision.approvedBy,
      approvedAt: new Date().toISOString(),
      reason: decision.reason,
    };
  }

  /**
   * Apply the configured timeout action.
   */
  private handleTimeout(): OversightResult {
    const action = this.config.onTimeout ?? 'deny';

    switch (action) {
      case 'allow':
        return {
          required: true,
          status: 'timeout',
          reason:
            'Human oversight timed out — action allowed (configured)',
        };
      case 'escalate':
        return {
          required: true,
          status: 'timeout',
          reason: 'Human oversight timed out — escalated',
        };
      case 'deny':
      default:
        return {
          required: true,
          status: 'timeout',
          reason:
            'Human oversight timed out — action denied (precautionary)',
        };
    }
  }

  /**
   * Fire a non-blocking notification. Errors are swallowed.
   */
  private fireNotification(
    toolName: string,
    args: Record<string, unknown>,
    risk: RiskLevel
  ): void {
    if (!this.handler?.notify) {
      return;
    }

    const notification: OversightNotification = {
      tool: toolName,
      args,
      risk,
      timestamp: new Date().toISOString(),
    };

    // Fire-and-forget — do not await, catch errors silently
    this.handler.notify(notification).catch(() => {
      // Swallow errors for non-blocking notifications
    });
  }
}
