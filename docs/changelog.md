# Changelog

All notable changes to this project will be documented in this file.

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
