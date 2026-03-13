---
title: "EU AI Act and MCP Servers: What Article 12 Means for Your Agent Infrastructure"
published: false
description: "The EU AI Act requires audit logging, human oversight, and risk management for AI systems. Here's how to add compliance to MCP servers with one line of code."
tags: eu-ai-act, mcp, compliance, typescript
canonical_url:
---

# EU AI Act and MCP Servers: What Article 12 Means for Your Agent Infrastructure

The EU AI Act becomes enforceable on August 2, 2026, with penalties up to 35 million euros or 7% of global annual revenue. If you run MCP servers — Anthropic's Model Context Protocol for agent-to-tool communication — in the EU or serve EU customers, those servers qualify as AI system components under the Act, and they need to meet its requirements.

## The Problem: MCP Has No Built-In Compliance

MCP is a clean, minimal protocol. That's its strength. But it ships with zero compliance infrastructure. Every tool call is unaudited. There is no oversight mechanism. No risk classification. No tamper-evident logging.

Article 12 of the EU AI Act requires structured, tamper-evident logging for AI systems. Article 14 requires human oversight for high-risk decisions. Article 9 requires documented risk management. None of this exists in the MCP SDK today. If your agents are calling tools that write to databases, send emails, move money, or touch personal data, you have a gap to close before August 2026.

## What the AI Act Actually Requires

### Article 12 — Audit Trail

The Act mandates that every AI system action be logged in a structured, tamper-evident format. Logs must be retained, must be verifiable, and must capture enough context for a post-incident audit.

Concretely, that means each log entry needs: an event identifier, a timestamp, a reference to the input, a reference to the output, the outcome, execution duration, and the identity of the agent or system that performed the action.

`mcp-eu-comply` implements this as a SHA-256 hash chain written to NDJSON files. Each entry contains a `prevHash` field (the hash of the previous entry) and a `hash` field (SHA-256 of the current entry including all its fields). The first entry in any chain uses `prevHash = "genesis"`. The chain state persists across server restarts via a `chain-state.json` file, so restarting your server does not break the audit trail.

### Article 14 — Human Oversight

For high-risk actions, a human must be able to intervene. The Act requires human-in-the-loop capability: the ability for a person to approve or deny an action before it executes.

`mcp-eu-comply` provides an `OversightEngine` that supports `requireApproval` per risk level, with configurable timeout and webhook or custom handler support. The default behavior on timeout is `deny` — the precautionary principle. If no human responds within the configured window, the action does not execute.

### Article 9 — Risk Management

AI systems must classify and manage the risk level of their operations. Not every tool call carries the same risk. Deleting a database table is not the same as reading a timestamp.

`mcp-eu-comply` ships a pattern-based risk classifier that matches against tool names and arguments. It supports four levels: `low`, `medium`, `high`, and `critical`. When no rule matches a given tool call, the default classification is `medium` — again, the precautionary principle. You define the rules; the library enforces them consistently.

## Adding Compliance to Your MCP Server

Install the package:

```bash
npm install mcp-eu-comply
```

Then wrap your server:

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { wrapWithCompliance } from "mcp-eu-comply";

const server = new McpServer({ name: "my-server", version: "1.0.0" });

const compliantServer = wrapWithCompliance(server, {
  riskRules: [
    { toolPattern: /delete|drop/, level: "critical" },
    { toolPattern: /write|send/, level: "high" },
  ],
  logging: { outputDir: "./audit-logs" },
  oversight: {
    requireApproval: ["critical"],
    timeoutMs: 30_000,
    onTimeout: "deny",
  },
  dataResidency: {
    region: "EU",
    piiFields: ["email", "name", "iban"],
    redactInLogs: true,
  },
});
```

What happens when a tool is called on the wrapped server:

1. **Classify** — The risk engine evaluates the tool name and arguments against your rules, assigns a risk level.
2. **Oversight** — If the risk level requires approval, the oversight engine pauses execution and waits for a human decision (or times out and denies).
3. **Execute** — If approved (or if no approval was required), the original tool handler runs.
4. **Log** — The full event is written to the audit log: tool name, arguments (with PII redacted), risk level, oversight decision, result hash, and duration. The entry is chained to the previous one via SHA-256.

This is one function call. Your existing tool definitions, handlers, and transport layer do not change.

## Audit Log Deep Dive

Each line in the NDJSON audit log is a self-contained event. Here is an example entry:

```json
{
  "id": "a1b2c3d4-5678-4ef0-abcd-1234567890ab",
  "timestamp": "2026-07-15T14:32:01.442Z",
  "prevHash": "sha256:e3b0c442...",
  "hash": "sha256:9f86d081...",
  "tool": "transfer_funds",
  "args": { "amount": 500, "to": "***REDACTED***" },
  "risk": "critical",
  "oversight": {
    "required": true,
    "status": "approved",
    "approvedBy": "ops@example.eu"
  },
  "result": { "status": "success", "contentHash": "sha256:b94d27b9..." },
  "durationMs": 1843,
  "schemaVersion": "0.1.0"
}
```

Field by field:

- **`id`** — UUIDv4 event identifier. Unique per tool invocation.
- **`timestamp`** — ISO 8601 UTC. No local time zones in audit logs.
- **`prevHash` / `hash`** — The tamper-evident chain. `prevHash` is the SHA-256 hash of the previous entry. `hash` is the SHA-256 of the current entry (computed over all other fields). If any entry is modified or deleted, the chain breaks and verification fails.
- **`tool`** — The MCP tool name that was called.
- **`args`** — The tool arguments. Fields matching your `piiFields` configuration are replaced with `***REDACTED***`. The raw values never hit disk.
- **`risk`** — The classified risk level for this invocation.
- **`oversight`** — The full approval record. Includes whether approval was required, the decision status, who approved, and when. If oversight was not required, this field still exists with `required: false`.
- **`result.contentHash`** — SHA-256 hash of the tool's output. The library never logs raw tool output — only the hash. This proves what was returned without storing potentially sensitive content.
- **`result.status`** — One of `success`, `error`, or `denied`.
- **`durationMs`** — Wall-clock execution time in milliseconds.
- **`schemaVersion`** — Currently `"0.1.0"`. This field exists so future tooling can handle schema migrations.

You can verify chain integrity programmatically or write a simple script that reads the NDJSON file, recomputes each hash, and confirms the chain is unbroken.

## What This Does Not Cover

Transparency matters more than marketing. Here is what `mcp-eu-comply` does not do today:

- **CEN/CENELEC harmonised standards** have not been published yet. When they are, the log schema and risk classification taxonomy may need to change. The `schemaVersion` field exists specifically for this reason.
- **This is v0.1.0.** It is designed to meet the requirements of the EU AI Act as currently written, but it is not a substitute for legal counsel. Have your legal team review your specific use case.
- **Multi-agent chain isolation** is not yet implemented. If you have agents calling agents, each hop is logged independently, but there is no unified trace ID across the chain. This is planned for v0.2.
- **Log rotation and retention enforcement** are not built in. You are responsible for configuring retention policies that meet your regulatory requirements. The library writes; your infrastructure manages.

## Get Started

The library is open source, MIT licensed, and available now:

- **GitHub:** [github.com/Cyberwael/mcp-eu-comply](https://github.com/Cyberwael/mcp-eu-comply)
- **npm:** [npmjs.com/package/mcp-eu-comply](https://www.npmjs.com/package/mcp-eu-comply)

53 tests. Zero runtime dependencies. 27.8 kB total size.

Star it if it's useful. Issues and PRs are welcome. August 2026 is closer than it looks.
