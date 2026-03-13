# mcp-eu-comply

## What This Project Is

The first runtime EU AI Act compliance layer for MCP servers.
A TypeScript npm package that wraps any MCP server via JavaScript Proxy and automatically adds:
- **Audit logging with hash chain** (EU AI Act Article 12) — tamper-evident NDJSON with SHA-256 chain
- **Human-in-the-loop oversight** (Article 14) — pause/approve/deny via webhook or custom handler
- **Risk classification** (Article 9) — pattern-based on tool name + args, default `medium`
- **PII redaction** (GDPR Article 5) — deep recursive, `***REDACTED***`, hash covers redacted version
- **Data residency tagging** (GDPR) — EU by default
- **Compliance report generation** — JSON/CSV export for auditors

## Why It Exists

- EU AI Act enforcement: **2 August 2026**. Penalties: €35M or 7% global revenue.
- DORA already in force for fintechs since January 2025.
- Nobody makes runtime compliance specifically for MCP. We are first.

## The One-Liner

```typescript
const compliantServer = wrapWithCompliance(server, config);
```

## Key Design Decisions (MUST READ)

1. **Proxy pattern** — We use `new Proxy(server, {...})` to intercept `registerTool`. Not monkey-patching. All non-intercepted methods pass through via `Reflect.get`.
2. **"Designed to meet" never "compliant"** — CEN/CENELEC harmonised standards not published yet.
3. **Dual hash fields** — Each entry has `prevHash` (hash of previous entry) AND `hash` (SHA-256 of current entry with hash field excluded). First entry: `prevHash = "genesis"`.
4. **Hash the REDACTED content** — PII redacted BEFORE hash computation. Auditor verifies chain on redacted logs.
5. **chain-state.json** — Persists last hash between restarts and file rotations.
6. **Risk levels: `low | medium | high | critical`** — Default `medium` when no rule matches (precautionary).
7. **Timeout → deny** — No human response within timeout = action denied (Article 14 precaution).
8. **contentHash not full output** — Log SHA-256 of tool output, not the output itself.
9. **Redaction marker: `***REDACTED***`** — Visually distinct, greppable.
10. **Zero external runtime deps** — Only Node.js built-ins + MCP SDK as peer dependency.

## Architecture

```
[Agent] → [MCP call] → [Proxy wrapping McpServer]
                              │
                     ┌────────┼────────┐
                     │        │        │
                Risk      Oversight  PII
              Classify    Engine    Redactor
                     │        │        │
                     └────────┼────────┘
                              │
                        Audit Logger
                     (hash chain + NDJSON)
                              │
                    ┌─────────┼──────────┐
                    │         │          │
               File Store  chain-    Webhook
               (NDJSON)   state.json (optional)
```

## File Structure

```
mcp-eu-comply/
├── CLAUDE.md
├── README.md
├── package.json
├── tsconfig.json
├── LICENSE                            # MIT
├── eu-comply.config.example.ts        # Example config (from vision doc)
├── src/
│   ├── index.ts                       # Public exports
│   ├── types.ts                       # All types, enums, interfaces
│   ├── wrapper/
│   │   └── compliance-wrapper.ts      # wrapWithCompliance() via Proxy
│   ├── logger/
│   │   ├── audit-logger.ts            # Logging engine + report + retention
│   │   ├── hash-chain.ts              # SHA-256 chain logic + verify + chain-state.json
│   │   └── pii-redactor.ts            # Deep recursive redaction
│   ├── classifier/
│   │   └── risk-classifier.ts         # Pattern-matching classifier
│   └── oversight/
│       ├── oversight-engine.ts        # Approval flow + timeout
│       └── webhook-handler.ts         # Default webhook impl
├── tests/
│   ├── hash-chain.test.ts
│   ├── pii-redactor.test.ts
│   ├── risk-classifier.test.ts
│   ├── audit-logger.test.ts
│   ├── oversight-engine.test.ts
│   ├── compliance-wrapper.test.ts
│   └── regression/                    # Auto-generated from encountered errors
│       └── .gitkeep
├── examples/
│   ├── basic-server.ts
│   ├── fintech-server.ts
│   └── ecommerce-server.ts
├── tasks/
│   ├── todo.md
│   └── lessons.md
├── breakdown/                         # Prompt-by-prompt execution logs
│   └── (breakdown_prompt_X.md created at runtime)
└── docs/
    ├── architecture.md
    ├── eu-ai-act-mapping.md
    └── changelog.md
```

## Tech Stack

- TypeScript 5.9+ strict mode
- Node.js >= 18
- Vitest 4 for testing
- @modelcontextprotocol/sdk >= 1.0.0 (peer dependency)
- crypto (Node built-in) for SHA-256
- fs/promises (Node built-in) for NDJSON
- CommonJS output (max compatibility)

## Coding Standards

- TypeScript strict. No `any` without comment.
- All public functions: JSDoc with @param and @returns.
- Actionable error messages: WHAT went wrong + HOW to fix.
- Every feature has tests. No shipping without tests.
- NDJSON: append-only. Never modify existing entries.
- Timestamps: ISO 8601 UTC always.
- IDs: UUIDv4 via crypto.randomUUID().
- Redaction: `***REDACTED***`, deep clone before mutating, hash the redacted version.

## Critical Rules

1. **Never say "compliant"** → "designed to meet requirements"
2. **Never store PII unredacted** → redact BEFORE hash, BEFORE storage
3. **Never skip hash chain** → every entry, every test
4. **Never throw from compliance layer** → catch + console.warn, pass through
5. **Proxy must be transparent** → Reflect.get for non-intercepted methods
6. **Hash the redacted content** → auditor verifies on redacted logs
7. **Deny on timeout** → precautionary principle
8. **contentHash for outputs** → never log full tool responses
9. **Default risk = medium** → when no rule matches, be cautious

## Parallelization Strategy

**ALWAYS use subagents. If tasks are independent, run them in parallel.**

### Dependency Graph

```
types.ts (FIRST — everything imports this)
    │
    ├── hash-chain.ts ──────┐
    ├── pii-redactor.ts ────┼── GROUP A (parallel, only need types)
    └── risk-classifier.ts ─┘
                │
    ├── audit-logger.ts ────┐
    └── oversight-engine.ts ┼── GROUP B (parallel, need Group A)
        + webhook-handler.ts┘
                │
        compliance-wrapper.ts ── GROUP C (sequential, needs A+B)
                │
    ├── all tests ──────────┐
    ├── all examples ───────┼── GROUP D (parallel, need C)
    └── README.md ──────────┘
```

### Subagent Rules
- Each subagent gets ONE module + its test file
- Each subagent reads CLAUDE.md + tasks/lessons.md before starting
- One task per subagent for focused execution
- After subagents complete: `npm run build && npm test`

## Error-to-Test Auto-Learning

**MANDATORY when ANY error is encountered:**
1. Fix the error in the source
2. Create a regression test in `tests/regression/regression_YYYYMMDD_description.test.ts`
3. The test MUST reproduce the exact error condition and assert correct behavior
4. Add the error pattern to `tasks/lessons.md`
5. This ensures the same error never ships twice

## Breakdown Tracking

**At the START of each Claude Code prompt/phase:**
1. Create `breakdown/breakdown_prompt_X.md` (X = prompt number, incrementing)
2. Document: subagents launched, what each does, dependencies, expected outputs
3. After completion: update with actual results, errors found, regression tests created
4. This is the project's execution diary — it tracks what happened and why

## Git Rules

**ALL commits MUST follow these rules:**

```bash
# Set this at project init — MANDATORY
git config user.name "cyberwael"
git config user.email "[configure your email]"
```

- **Author**: Always `cyberwael`. Never full legal name. Never co-author with "Claude" or any AI.
- **Commit messages**: Conventional commits format: `feat:`, `fix:`, `test:`, `docs:`, `chore:`
- **Examples**:
  - `feat: add hash chain with SHA-256 and tamper detection`
  - `fix: handle null values in PII redactor`
  - `test: add regression test for chain-state persistence`
  - `docs: update README with quick start`
- **No AI attribution in commits**: No `Co-authored-by: Claude` or similar. You are the author.
- **Commit frequently**: One commit per completed module or significant change. Not one mega-commit.

## Important MCP SDK Context

The MCP SDK (`@modelcontextprotocol/sdk`) does NOT have a middleware pattern on the server side.
There is no `server.use()` or `server.middleware()`. The only interception point is wrapping
the methods that register tools. The vision doc confirms we use a JavaScript `Proxy` on the
`McpServer` instance to intercept calls to `registerTool` (or `tool` depending on SDK version).
Check the actual SDK API at runtime — the method name may be `registerTool` or `tool`.
Wrap whichever method the SDK exposes for tool registration.

## License

MIT. Not Apache 2.0. MIT is simpler, more permissive, and standard for npm packages.
The vision doc mentions Apache 2.0 in the monetization section — ignore that, use MIT consistently.

## Audit Log Directory Structure

```
audit-logs/
├── 2026-03-14.ndjson       # Daily NDJSON log files
├── 2026-03-15.ndjson
├── chain-state.json         # Last hash for chain continuity across restarts
└── retention.json           # Retention metadata (days configured, last cleanup)
```

## Commands

```bash
npm install          # Install deps
npm run build        # Compile TS
npm test             # Vitest
npm run dev          # Watch mode
```
