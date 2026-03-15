# Changelog

All notable changes to this project will be documented in this file.

## [0.3.0] — 2026-03-15

### Features
- **Interactive demo command** — `npx mcp-eu-comply demo` runs a self-contained compliance simulation: 7 tool calls across 4 risk levels, PII redaction, human oversight (approve/deny/timeout), and hash chain verification. Zero config, ~5 seconds.
- New CLI flags: `--keep` (preserve demo audit logs), `--dir` (custom output for demo)
- Demo scenarios cover: read-only lookups (low risk), profile updates with PII (high), bulk exports (high), fund transfers with approval (critical), deletions denied by oversight (critical), DDL operations timed out (critical)

### Why demo instead of PDF?
We have 0 known users. PDF reports serve auditors — but nobody is auditing yet. The demo command lets anyone try the full compliance flow in 10 seconds, which drives adoption. PDF moves to v0.4.

### Stats
- 87 tests passing (11 test files)
- Zero external runtime dependencies preserved
- Zero-dep promise intact (no pdfkit or similar added)

[0.3.0]: https://github.com/Cyberwael/mcp-eu-comply/releases/tag/v0.3.0

## [0.2.0] — 2026-03-13

### Features
- **CLI verify command** — validate hash chain integrity from the command line (`npx mcp-eu-comply verify --dir ./audit-logs`). Exit codes: 0 = valid, 1 = broken, 2 = error.
- **CLI report command** — generate compliance summaries in JSON or human-readable format (`npx mcp-eu-comply report --dir ./audit-logs --format human`). Covers risk distribution, oversight decisions, PII redaction counts, and chain integrity.
- **DORA fintech template** — pre-built `ComplianceConfig` for financial services: payment/transfer tools as critical, 10 PII fields, 5-year retention, oversight for critical + high risk.
- **GDPR e-commerce template** — pre-built `ComplianceConfig` for e-commerce: delete/drop as critical, 6 PII fields including credit_card, oversight for critical risk.
- **Multi-agent chain isolation** — `agentId` field in `ComplianceConfig` namespaces hash chains (`chain-state-{agentId}.json`). Multiple MCP servers can share the same log directory without corrupting each other's chains.
- **New types** — `VerifyResult` (CLI verify output), updated `ComplianceReport` (CLI report output with risk distribution, oversight summary, PII count)

### Breaking changes
None. v0.1 API unchanged. `agentId` is optional — omitting it preserves v0.1 behavior.

### Stats
- 80 tests passing (10 test files)
- 8 new test files: multi-agent, templates, cli-verify, cli-report
- Zero external runtime dependencies (CLI uses Node.js built-in `util.parseArgs`)

[0.2.0]: https://github.com/Cyberwael/mcp-eu-comply/releases/tag/v0.2.0

## [0.1.0] — 2026-03-13

First public release. The first runtime EU AI Act compliance layer for MCP servers.

### Features
- **Audit logging with SHA-256 hash chain** — tamper-evident NDJSON daily logs with chain-state persistence across restarts (EU AI Act Article 12)
- **Human-in-the-loop oversight engine** — approve/deny/timeout flows via webhook or custom handler, with configurable timeout action (Article 14)
- **Pattern-based risk classification** — RegExp/string matching on tool name and args, four levels: low/medium/high/critical (Article 9)
- **Deep recursive PII redaction** — case-insensitive field matching, `***REDACTED***` marker, redaction before hash computation (GDPR Article 5)
- **Data residency tagging** — EU region support with configurable PII fields
- **Compliance report generation** — JSON summaries by date range with risk/result/oversight breakdowns
- **Proxy-based interception** — wraps McpServer via JavaScript Proxy, intercepts `registerTool` and `tool` methods, all other methods pass through via `Reflect.get`
- **Zero external runtime dependencies** — only Node.js built-ins + MCP SDK as peer dependency

### Regulatory mapping
- EU AI Act: Articles 12, 14, 9, 19
- GDPR: Articles 5, 17, 25
- DORA: Articles 11, 12

### Stats
- 53 tests passing (6 test files, 7 critical invariants verified)
- 27.8 kB packed size
- CommonJS output for maximum compatibility
- TypeScript strict mode with full type exports

### Known limitations
- Multi-agent chain isolation: shared `outputDir` = corrupted chains (fix in v0.2)
- No log rotation or retention enforcement (daily files only)
- No integration test with real MCP client (all tests use mocks)
- Examples need their own tsconfig for type-checking
- CEN/CENELEC harmonised standards not yet published — schema may change

[0.1.0]: https://github.com/Cyberwael/mcp-eu-comply/releases/tag/v0.1.0
