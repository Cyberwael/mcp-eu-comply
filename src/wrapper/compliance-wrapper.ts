/**
 * Compliance wrapper for MCP servers.
 *
 * Intercepts tool registrations via JavaScript Proxy and wraps each tool callback
 * with risk classification, human oversight, and audit logging.
 *
 * Designed to meet EU AI Act Article 12 (record-keeping), Article 14 (human oversight),
 * and Article 19 (quality of auto-generated logs) requirements.
 *
 * @module compliance-wrapper
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ComplianceConfig, OversightResult } from '../types.js';
import { AuditLogger } from '../logger/audit-logger.js';
import { classifyRisk } from '../classifier/risk-classifier.js';
import { OversightEngine } from '../oversight/oversight-engine.js';
import { WebhookHandler } from '../oversight/webhook-handler.js';
import * as crypto from 'node:crypto';

/**
 * Wraps an MCP server with EU AI Act compliance: audit logging, risk classification,
 * human oversight, and PII redaction.
 *
 * Uses a JavaScript Proxy to intercept `registerTool` and `tool` calls.
 * All non-intercepted methods pass through transparently via Reflect.get.
 * Errors in the compliance layer are caught and logged — they NEVER break tool execution.
 *
 * @param server - The McpServer instance to wrap.
 * @param config - Compliance configuration.
 * @returns A proxied McpServer with compliance behavior.
 */
export function wrapWithCompliance<T extends McpServer>(
  server: T,
  config: ComplianceConfig
): T {
  const logger = new AuditLogger(config.logging, config.dataResidency, config.agentId);

  // Set up oversight engine if configured
  let oversightEngine: OversightEngine | null = null;
  if (config.oversight) {
    // If webhook is provided but no custom handler, create a WebhookHandler
    const oversightConfig = { ...config.oversight };
    if (oversightConfig.webhook && !oversightConfig.handler) {
      oversightConfig.handler = new WebhookHandler(oversightConfig.webhook);
    }
    oversightEngine = new OversightEngine(oversightConfig);
  }

  /**
   * Wraps a tool callback with compliance pre-hooks (classify + oversight)
   * and post-hooks (audit logging).
   */
  function wrapToolCallback(
    toolName: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- MCP SDK uses complex generic types
    originalCallback: (...args: any[]) => any
  ): (...args: unknown[]) => Promise<unknown> {
    return async (...callArgs: unknown[]): Promise<unknown> => {
      const startTime = Date.now();

      // Extract args from the callback parameters
      // MCP SDK passes (args, extra) or just (extra) for zero-arg tools
      let toolArgs: Record<string, unknown> = {};
      let extra: Record<string, unknown> = {};

      if (callArgs.length >= 2) {
        // (args, extra) pattern
        toolArgs = (callArgs[0] as Record<string, unknown>) ?? {};
        extra = (callArgs[1] as Record<string, unknown>) ?? {};
      } else if (callArgs.length === 1) {
        // (extra) pattern for zero-arg tools
        extra = (callArgs[0] as Record<string, unknown>) ?? {};
      }

      // Extract context from MCP extra
      const context = {
        sessionId: extra.sessionId as string | undefined,
        agentId: extra.authInfo
          ? (extra.authInfo as Record<string, unknown>).clientId as string | undefined
          : undefined,
      };

      try {
        // 1. Classify risk
        const risk = classifyRisk(toolName, toolArgs, config.riskRules);

        // 2. Check oversight
        let oversightResult: OversightResult = {
          required: false,
          status: 'not-required',
        };

        if (oversightEngine) {
          oversightResult = await oversightEngine.check(
            toolName,
            toolArgs,
            risk,
            context
          );

          // If denied or timed out with deny policy, block the action
          if (
            oversightResult.status === 'denied' ||
            (oversightResult.status === 'timeout' &&
              (config.oversight?.onTimeout ?? 'deny') === 'deny')
          ) {
            const durationMs = Date.now() - startTime;

            // Log the denied action — denied actions are audit events too
            await logSafe(logger, {
              tool: toolName,
              args: toolArgs,
              risk,
              oversight: oversightResult,
              result: { status: 'denied' },
              durationMs,
              agentId: context.agentId,
              sessionId: context.sessionId,
            });

            // Return an error result to the agent (MCP CallToolResult format)
            return {
              content: [
                {
                  type: 'text',
                  text: `Action denied by human oversight: ${oversightResult.reason ?? 'no reason provided'}`,
                },
              ],
              isError: true,
            };
          }
        }

        // 3. Execute the original tool callback
        const result = await originalCallback(...callArgs);

        // 4. Log the successful action
        const durationMs = Date.now() - startTime;
        await logSafe(logger, {
          tool: toolName,
          args: toolArgs,
          risk,
          oversight: oversightResult,
          result: { status: 'success', content: result },
          durationMs,
          agentId: context.agentId,
          sessionId: context.sessionId,
        });

        // 5. Return the original result UNCHANGED
        return result;
      } catch (error) {
        // Log the error but DO NOT prevent it from propagating
        // (the original tool threw — that's its business)
        const durationMs = Date.now() - startTime;
        const errorMessage =
          error instanceof Error ? error.message : String(error);

        const risk = classifyRisk(toolName, toolArgs, config.riskRules);

        await logSafe(logger, {
          tool: toolName,
          args: toolArgs,
          risk,
          oversight: { required: false, status: 'not-required' },
          result: { status: 'error', error: errorMessage },
          durationMs,
          agentId: context.agentId,
          sessionId: context.sessionId,
        });

        // Re-throw the original error — compliance layer must not swallow tool errors
        throw error;
      }
    };
  }

  // Create a Proxy that intercepts registerTool and tool methods
  const proxy = new Proxy(server, {
    get(target, prop, receiver) {
      // Intercept registerTool method
      if (prop === 'registerTool') {
        return function wrappedRegisterTool(
          name: string,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          configArg: any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          cb: (...args: any[]) => any
        ) {
          const wrappedCb = wrapToolCallback(name, cb);
          return (target.registerTool as Function).call(
            target,
            name,
            configArg,
            wrappedCb
          );
        };
      }

      // Also intercept deprecated `tool` method for backwards compat
      if (prop === 'tool') {
        return function wrappedTool(
          name: string,
          ...rest: unknown[]
        ) {
          // The `tool` method has multiple overloads: tool(name, cb), tool(name, desc, cb),
          // tool(name, schema, cb), tool(name, desc, schema, cb), etc.
          // The callback is always the last argument.
          const lastArg = rest[rest.length - 1];
          if (typeof lastArg === 'function') {
            const wrappedCb = wrapToolCallback(name, lastArg as (...args: unknown[]) => unknown);
            const newRest = [...rest.slice(0, -1), wrappedCb];
            return (target.tool as Function).call(target, name, ...newRest);
          }
          // If no callback found, pass through unchanged
          return (target.tool as Function).call(target, name, ...rest);
        };
      }

      // All other methods/properties pass through transparently
      return Reflect.get(target, prop, receiver);
    },
  });

  return proxy as T;
}

/**
 * Safe wrapper around logger.log that catches and warns on errors.
 * The compliance layer must NEVER throw or break tool execution.
 */
async function logSafe(
  logger: AuditLogger,
  params: Parameters<AuditLogger['log']>[0]
): Promise<void> {
  try {
    await logger.log(params);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[mcp-eu-comply] Audit logging failed: ${message}`);
  }
}
