# Architecture Decisions — mcp-eu-comply

## ADR-001: Proxy Pattern Over Monkey-Patch

**Decision**: Use JavaScript `Proxy` on McpServer to intercept `registerTool`, not monkey-patching.

**Reasoning**:
- Proxy preserves original server intact — non-intercepted methods pass through via `Reflect.get`
- Cleaner than monkey-patching — no risk of breaking internal MCP SDK state
- If mcp-eu-comply is removed, the original server works identically
- Proxy is standard ES6, well-supported, well-understood

**Implementation**: `wrapWithCompliance(server, config)` returns `new Proxy(server, handler)` where handler intercepts `registerTool` and wraps each tool callback.

## ADR-002: Dual Hash Fields (prevHash + hash)

**Decision**: Each AuditLogEntry has both `prevHash` (previous entry's hash) and `hash` (current entry's hash computed without the hash field itself).

**Reasoning**:
- `prevHash` enables chain verification (each entry points to the previous)
- `hash` enables individual entry integrity check
- Computation: `SHA-256(JSON.stringify({...entry, hash: undefined}))`
- First entry: `prevHash = "genesis"`
- `chain-state.json` persists last hash for continuity across restarts

## ADR-003: Hash Redacted Content

**Decision**: PII is redacted BEFORE hash computation. The hash covers the redacted version.

**Reasoning**:
- An auditor receives redacted logs (they should never see PII)
- The auditor must be able to verify the hash chain
- If we hashed the original and stored the redacted, the auditor couldn't verify
- Hashing redacted = auditor can verify = trust established

## ADR-004: NDJSON File Storage

**Decision**: One NDJSON file per day (YYYY-MM-DD.ndjson), append-only.

**Reasoning**:
- Greppable, streamable, works with Unix tools
- One file per day = easy retention management
- Each line = self-contained JSON = partial corruption doesn't destroy all data
- No database dependency = zero setup
- Alternatives rejected: SQLite (mutable, harder to prove integrity), database (external dependency)

## ADR-005: Default Risk = Medium

**Decision**: When no risk rule matches a tool call, classify as `medium`.

**Reasoning**:
- Precautionary principle — unknown tools should not be treated as safe
- `medium` triggers notification (if configured) but not blocking
- Better to over-classify than under-classify for compliance

## ADR-006: Deny on Timeout

**Decision**: If human oversight times out, the action is denied by default.

**Reasoning**:
- Article 14: human must be able to oversee
- If human can't respond, the safe default is to deny
- Configurable via `onTimeout: 'deny' | 'allow' | 'escalate'`
- Default is `deny` — must be explicitly overridden to allow

## ADR-007: contentHash Not Full Output

**Decision**: Log SHA-256 of tool output, not the output content.

**Reasoning**:
- Tool outputs may contain sensitive data (user info, financial details)
- Full outputs bloat log files
- contentHash proves what was returned without storing it
- If full output needed, the MCP server itself can log it separately

## ADR-008: Target Fintechs First

**Decision**: Primary target = EU fintechs. Secondary = EU e-commerce.

**Reasoning**:
- DORA already in force (January 2025) = compliance pressure NOW
- Fintechs are tech-savvy: npm install, read READMEs, move fast
- Double compliance pressure (DORA + AI Act) = strongest buying signal
- Compliance budgets exist and are growing
- General MCP servers are mostly dev tools (not subject to AI Act commerce provisions)

## ADR-009: Vitest Over Node Built-in Runner

**Decision**: Use Vitest 4 for testing.

**Reasoning**:
- Better DX than Node built-in test runner (watch mode, filtering, better assertions)
- Widely adopted in TS ecosystem
- Compatible with our CommonJS output
- Fast parallel test execution
