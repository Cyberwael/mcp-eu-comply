# mcp-eu-comply

**August 2, 2026. €35M fines. Is your MCP server ready?**

`mcp-eu-comply` is the first runtime EU AI Act compliance wrapper for MCP servers.

One function call adds tamper-evident audit logging, human-in-the-loop oversight, risk classification, and PII redaction to any MCP server — designed to meet EU AI Act Article 12, 14, and 19 requirements.

## What it does

- **Audit logging with SHA-256 hash chain** — tamper-evident NDJSON logs (Article 12)
- **Human-in-the-loop oversight** — pause, approve, or deny tool calls via webhook or custom handler (Article 14)
- **Risk classification** — pattern-based, per-tool risk levels aligned with EU AI Act categories (Article 9)
- **PII redaction** — deep recursive field redaction before storage (GDPR Article 5)
- **Compliance report generation** — JSON summaries for auditors, covering any time period

## Try it in 10 seconds

```bash
npx mcp-eu-comply demo
```

This runs a self-contained simulation: 7 tool calls across 4 risk levels, PII redaction, human oversight (approve/deny/timeout), and hash chain verification. No config needed.

Use `--keep` to save the generated audit logs for inspection:

```bash
npx mcp-eu-comply demo --keep
```

## Quick Start

```bash
npm install mcp-eu-comply
```

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { wrapWithCompliance } from "mcp-eu-comply";

const server = new McpServer({ name: "my-server", version: "1.0.0" });

const compliantServer = wrapWithCompliance(server, {
  riskRules: [
    { toolPattern: /delete|drop|remove/i, level: "critical" },
    { toolPattern: /write|update|send/i, level: "high" },
    { toolPattern: /.*/,                  level: "medium" },
  ],
  logging: {
    outputDir: "./audit-logs",
    retention: { days: 365 },
  },
  oversight: {
    requireApproval: ["critical"],
    notifyOn: ["high"],
    webhook: "https://your-company.eu/oversight",
    timeoutMs: 30_000,
    onTimeout: "deny",
  },
  dataResidency: {
    region: "EU",
    piiFields: ["email", "name", "address", "phone", "iban"],
    redactInLogs: true,
  },
});

// Register tools on compliantServer — they are automatically wrapped
compliantServer.tool("transfer_funds", { amount: {}, to: {} }, async (args) => {
  // Your logic here. mcp-eu-comply handles the rest.
  return { content: [{ type: "text", text: "Done" }] };
});
```

## How it works

```
[Agent] → [MCP Tool Call] → [mcp-eu-comply Proxy]
                                      │
                             Risk Classification
                             (pattern-match tool name + args)
                                      │
                             Human Oversight Check
                             (webhook or custom handler)
                                      │
                             Original Tool Executes
                             (untouched — proxy is transparent)
                                      │
                             Audit Log (SHA-256 hash chain)
                             (PII redacted, NDJSON, append-only)
```

The wrapper uses a JavaScript `Proxy` on the `McpServer` instance. It intercepts `tool` and `registerTool` calls to wrap each callback. All non-intercepted methods pass through via `Reflect.get`. Errors in the compliance layer are caught and logged — they never break tool execution.

## Example audit entry

Each line in the NDJSON log file is a self-contained JSON object:

```json
{"id":"a1b2c3d4-5678-4ef0-abcd-1234567890ab","timestamp":"2026-07-15T14:32:01.442Z","prevHash":"e3b0c44298fc1c149afbf4c8996fb924","hash":"9f86d081884c7d659a2feaa0c55ad015","tool":"transfer_funds","args":{"amount":500,"to":"***REDACTED***","from":"***REDACTED***"},"risk":"critical","oversight":{"required":true,"status":"approved","approvedBy":"ops@example.eu","approvedAt":"2026-07-15T14:32:00.112Z"},"result":{"status":"success","contentHash":"b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"},"durationMs":1843,"agentId":"agent-47","sessionId":"sess-001","schemaVersion":"0.1.0"}
```

Key fields: `prevHash` and `hash` form a tamper-evident chain. `args` are PII-redacted. `result.contentHash` stores a SHA-256 digest — never the raw output.

## Configuration reference

| Option | Type | Default | Description |
|---|---|---|---|
| `riskRules` | `RiskRule[]` | `[]` | Pattern-based rules mapping tools to risk levels |
| `riskRules[].toolPattern` | `RegExp \| string` | — | Pattern to match against tool name |
| `riskRules[].level` | `RiskLevel` | — | Risk level when matched |
| `riskRules[].argsPattern` | `Record<string, RegExp \| string>` | — | Optional args matching |
| `logging.outputDir` | `string` | — | Directory for NDJSON logs and chain state |
| `logging.retention.days` | `number` | — | Log retention in days |
| `logging.hashAlgorithm` | `'sha256' \| 'sha384' \| 'sha512'` | `'sha256'` | Hash algorithm for the chain |
| `oversight.requireApproval` | `RiskLevel[]` | `[]` | Risk levels requiring human approval |
| `oversight.notifyOn` | `RiskLevel[]` | `[]` | Risk levels that trigger notifications |
| `oversight.webhook` | `string` | — | Webhook URL for approval requests |
| `oversight.handler` | `OversightHandler` | — | Custom handler (alternative to webhook) |
| `oversight.timeoutMs` | `number` | — | Max wait time for human response (ms) |
| `oversight.onTimeout` | `TimeoutAction` | `'deny'` | Action on timeout: `deny`, `allow`, or `escalate` |
| `dataResidency.region` | `DataRegion` | — | Data residency region (`EU`, `FR`, `DE`, `custom`) |
| `dataResidency.piiFields` | `string[]` | `[]` | Field names to redact (case-insensitive) |
| `dataResidency.redactInLogs` | `boolean` | `false` | Enable PII redaction in audit logs |

## Risk levels

| Level | EU AI Act Category | When to use | Default behavior |
|---|---|---|---|
| `low` | Minimal risk | Read-only lookups, status checks | Log only |
| `medium` | Limited risk | Data writes, standard operations | Log only (default when no rule matches) |
| `high` | High risk | Financial ops, PII access, bulk changes | Log + notify |
| `critical` | Unacceptable risk threshold | Deletions, privilege changes, fund transfers | Log + require human approval |

## Oversight configuration

### Webhook mode

POST requests are sent to your webhook URL with an `OversightRequest` body. Respond with an `OversightDecision`:

```typescript
// Your webhook receives:
{
  id: "req-uuid",
  tool: "transfer_funds",
  args: { amount: 500, to: "***REDACTED***" },
  risk: "critical",
  timestamp: "2026-07-15T14:32:00.000Z",
  context: { sessionId: "sess-001", agentId: "agent-47" }
}

// Your webhook responds:
{
  status: "approved",       // or "denied"
  approvedBy: "ops@example.eu",
  reason: "Transfer under €1000 threshold"
}
```

### Custom handler mode

For Slack bots, internal dashboards, or queue-based flows:

```typescript
import type { OversightHandler } from "mcp-eu-comply";

const slackHandler: OversightHandler = {
  async requestApproval(request) {
    // Post to Slack, wait for button click
    const decision = await postToSlackAndWait(request);
    return {
      status: decision.approved ? "approved" : "denied",
      approvedBy: decision.user,
      reason: decision.comment,
    };
  },
  async notify(notification) {
    await postToSlackChannel(`Tool ${notification.tool} called (risk: ${notification.risk})`);
  },
};

const server = wrapWithCompliance(mcpServer, {
  // ...
  oversight: {
    requireApproval: ["critical", "high"],
    handler: slackHandler,
    timeoutMs: 60_000,
    onTimeout: "deny",
  },
});
```

## Regulatory coverage

| Regulation | Articles | What `mcp-eu-comply` covers |
|---|---|---|
| **EU AI Act** | 12, 14, 19 | Tamper-evident logging, human oversight engine, structured log quality |
| **GDPR** | 5, 17, 25 | PII redaction, data minimisation, retention policy, EU residency tagging |
| **DORA** | 11, 12 | Complete audit trails for ICT incident analysis, backup-ready NDJSON |

## Verify chain integrity

The hash chain can be verified at any time to detect tampering:

```typescript
import { verifyChain } from "mcp-eu-comply";

const result = await verifyChain("./audit-logs");

console.log(result);
// { valid: true, entries: 14208 }

// If tampered:
// { valid: false, entries: 14208, firstBrokenAt: 9451, error: "Hash mismatch at entry 9451" }
```

## CLI Tools

Run an interactive demo:

```bash
npx mcp-eu-comply demo
npx mcp-eu-comply demo --keep              # Save generated audit logs
```

Verify your audit chain:

```bash
npx mcp-eu-comply verify --dir ./audit-logs
```

Generate a compliance report:

```bash
npx mcp-eu-comply report --dir ./audit-logs --format human
```

Filter by agent in multi-agent setups:

```bash
npx mcp-eu-comply verify --dir ./audit-logs --agent payment-service
```

Exit codes: `0` = valid chain, `1` = broken chain, `2` = file error.

## Templates

Pre-built compliance configurations for regulated industries:

```typescript
import { wrapWithCompliance, doraFintech } from "mcp-eu-comply";

const server = wrapWithCompliance(mcpServer, {
  ...doraFintech,
  logging: { outputDir: "./audit-logs" },
});
```

Available templates:

| Template | Industry | Risk rules | Oversight | PII fields | Retention |
|---|---|---|---|---|---|
| `doraFintech` | Financial services (DORA) | payment/transfer → critical | critical + high require approval | 10 fields incl. IBAN, BIC | 1825 days (5 years) |
| `gdprEcommerce` | E-commerce (GDPR) | delete/drop → critical | critical requires approval | 6 fields incl. credit_card | — |

## Multi-Agent Support

For setups with multiple MCP servers sharing the same log directory:

```typescript
const server = wrapWithCompliance(mcpServer, {
  ...config,
  agentId: "payment-service",  // Each agent gets its own hash chain
});
```

Each agent maintains an independent hash chain (`chain-state-{agentId}.json`). Entries are stored in shared NDJSON files with the `agentId` field. Verify or report on a single agent's chain:

```bash
npx mcp-eu-comply verify --dir ./audit-logs --agent payment-service
```

## Important disclaimer

> This package is **designed to meet** EU AI Act Article 12, 14, and 19 requirements. It is NOT certified or officially approved — the CEN/CENELEC harmonised standards are still being drafted. Use as part of a broader compliance strategy.

Zero external runtime dependencies. 87 tests. Peer dependency on `@modelcontextprotocol/sdk >= 1.0.0`. Node.js >= 18.

## Roadmap

- [x] SHA-256 hash chain audit logging
- [x] Human oversight engine (webhook + custom handler)
- [x] Pattern-based risk classification
- [x] Deep recursive PII redaction
- [x] Compliance report generation
- [x] CLI validator (`npx mcp-eu-comply verify` + `report`)
- [x] Interactive demo (`npx mcp-eu-comply demo`)
- [ ] PDF audit reports
- [ ] Dashboard SaaS
- [x] DORA fintech + GDPR e-commerce templates
- [x] Multi-agent chain isolation
- [ ] eIDAS 2.0 identity bridge

## License

MIT
