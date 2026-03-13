# FIRST PROMPT — Copy-paste this into Claude Code

---

Read these files in order: CLAUDE.md, tasks/todo.md, tasks/lessons.md, docs/architecture.md. This is mcp-eu-comply — the first runtime EU AI Act compliance wrapper for MCP servers.

**Before you write any code**, create `breakdown/breakdown_prompt_1.md` with your execution plan: which subagents you'll launch, what each builds, dependencies between them, and expected outputs.

Then execute:

## Step 1 — Foundation (you, no subagent)

- **Git config FIRST**: Run `git config user.name "cyberwael"`. ALL commits under this name. Never full legal name. Never `Co-authored-by` with AI.
- Init: package.json, tsconfig.json (strict, CommonJS, outDir: dist, rootDir: src), .gitignore (include: node_modules, dist, audit-logs, *.ndjson, chain-state.json, retention.json), LICENSE (MIT)
- Install devDeps: typescript, @types/node, @modelcontextprotocol/sdk, vitest
- Add scripts: `"build": "tsc"`, `"test": "vitest run"`, `"dev": "tsc --watch"`
- Create `src/types.ts` with ALL types from CLAUDE.md and the vision doc:
  - Types: `RiskLevel = 'low' | 'medium' | 'high' | 'critical'`
  - Types: `OversightStatus = 'approved' | 'denied' | 'timeout' | 'not-required'`
  - Types: `TimeoutAction = 'deny' | 'allow' | 'escalate'`
  - Types: `DataRegion = 'EU' | 'FR' | 'DE' | 'custom'`
  - Interface: `RiskRule` with toolPattern (RegExp|string) + optional argsPattern (Record<string, RegExp|string>)
  - Interface: `LoggingConfig` with outputDir, retention?.days, hashAlgorithm? ('sha256'|'sha384'|'sha512', default sha256)
  - Interface: `OversightConfig` with requireApproval (RiskLevel[]), notifyOn? (RiskLevel[]), webhook?, handler? (OversightHandler), timeoutMs, onTimeout (TimeoutAction)
  - Interface: `DataResidencyConfig` with region (DataRegion), piiFields (string[]), redactInLogs (boolean)
  - Interface: `ComplianceConfig` bundling riskRules, logging, oversight?, dataResidency?
  - Interface: `AuditLogEntry` with: id, timestamp, prevHash, hash, tool, args, risk, oversight{required, status, approvedBy?, approvedAt?, reason?}, result{status, error?, contentHash?}, durationMs, agentId?, sessionId?, schemaVersion:'0.1.0'
  - Interface: `OversightHandler` with requestApproval(request) and notify?(notification) methods
  - Interfaces: `OversightRequest`, `OversightDecision`, `OversightNotification`
- Verify: `npm run build` compiles with zero errors
- `git commit -m "chore: initial project setup with types"`
- Check off tasks 1.0 and 1.1 in tasks/todo.md

## Step 2 — Parallel Group A (3 subagents simultaneously)

Launch ALL THREE at the same time:

**Subagent 1**: "Read CLAUDE.md and tasks/lessons.md. Build `src/logger/hash-chain.ts` and `tests/hash-chain.test.ts`. SHA-256 hash chain with: computeEntryHash(), getGenesisHash() returning 'genesis', loadChainState(), saveChainState(), verifyChain() returning {valid, entries, firstBrokenAt?, error?}. Hash = SHA-256(JSON.stringify({...entry, hash: undefined})). Tests: genesis, 10-entry chain, tamper detection, state persistence, empty chain. Use Vitest."

**Subagent 2**: "Read CLAUDE.md and tasks/lessons.md. Build `src/logger/pii-redactor.ts` and `tests/pii-redactor.test.ts`. Deep recursive field redaction: redactFields(obj, piiFields) returns new object, never mutates. Marker: '***REDACTED***'. Case-insensitive matching. Handle nested objects, arrays, null/undefined. Tests: flat, nested, arrays, no-mutation proof, case-insensitive, null safety. Use Vitest."

**Subagent 3**: "Read CLAUDE.md and tasks/lessons.md. Build `src/classifier/risk-classifier.ts` and `tests/risk-classifier.test.ts`. classifyRisk(toolName, args, rules) returns RiskLevel. Pattern match (RegExp or string) on tool name, optional args pattern. Highest matching risk wins. Default: 'medium'. Tests: string match, regex, args, highest wins, default medium, empty rules. Use Vitest."

Wait for all 3. Run `npm run build && npm test`. If errors: fix them AND create regression tests in `tests/regression/`. Update `tasks/lessons.md` with any learned patterns.
Check off 1.2, 1.3, 1.4 in tasks/todo.md.

## Step 3 — Parallel Group B (2 subagents simultaneously)

**Subagent 4**: "Read CLAUDE.md and tasks/lessons.md. Build `src/logger/audit-logger.ts` and `tests/audit-logger.test.ts`. Logging engine that: creates AuditLogEntry, calls pii-redactor on args, computes hash chain via hash-chain module, stores contentHash of output (not full output), appends NDJSON to YYYY-MM-DD.ndjson files, manages chain-state.json. Includes generateReport(from, to) for summary stats. Tests: write entry, hash chain valid, PII redacted, contentHash stored, file rotation, NDJSON format, report generation. Use Vitest."

**Subagent 5**: "Read CLAUDE.md and tasks/lessons.md. Build `src/oversight/oversight-engine.ts`, `src/oversight/webhook-handler.ts`, and `tests/oversight-engine.test.ts`. OversightEngine.check() determines if approval needed based on risk level and config. Calls handler.requestApproval() for blocking approval, handler.notify() for non-blocking. Timeout handling: default deny. WebhookHandler: POST to webhook URL, wait for response or timeout. Tests: low→not-required, critical→approved, critical→denied, timeout→deny, timeout→allow, notify non-blocking, no handler→auto-approve+warning. Use Vitest."

Wait for both. Run `npm run build && npm test`. Fix + regression tests if needed.
Check off 1.5, 1.6 in tasks/todo.md.

## Step 4 — Core Integration (you, not subagent — this is critical)

Build `src/wrapper/compliance-wrapper.ts` and `tests/compliance-wrapper.test.ts`.

`wrapWithCompliance(server, config)` returns `new Proxy(server, handler)`:
- Intercept `registerTool` → wrap each tool callback
- Wrapped callback: classify risk → check oversight → if denied: log + return error → else: execute original → log result → return original result unchanged
- Non-intercepted methods: `Reflect.get(target, prop, receiver)`
- ALL errors in compliance layer: try/catch + console.warn, NEVER throw

Tests: interception works, return value unchanged, oversight triggers, denied blocks, errors don't break, Reflect.get passthrough, PII redacted, hash chain valid.

Run full `npm run build && npm test`. Everything passes.
Check off 2.1 in tasks/todo.md.

## Step 5 — Parallel Group D (3 subagents)

**Subagent 6**: "Build `src/index.ts` with clean public exports: wrapWithCompliance, all types, verifyChain. No internal classes. Verify import works."

**Subagent 7**: "Build `examples/basic-server.ts`, `examples/fintech-server.ts`, `examples/ecommerce-server.ts` per CLAUDE.md specs. Each must be self-contained and compilable."

**Subagent 8**: "Build README.md per tasks/todo.md section 2.4 spec. Hook with 'August 2, 2026. €35M fines.' Quick start. Audit entry example. Config reference. Risk levels table. Regulatory mapping. 'Designed to meet' disclaimer. Roadmap."

Wait for all 3. Final `npm run build && npm test`.
Check off 2.2, 2.3, 2.4 in tasks/todo.md.

## After Phase 2

Update `breakdown/breakdown_prompt_1.md` with actual results: which tests pass, which fail, total module count, errors encountered, regression tests created.

Commit all work: `git add -A && git commit -m "feat: complete core compliance engine v0.1"`

Report back with: total test count, pass/fail, module count, any open issues.

## CRITICAL REMINDERS
- **Git**: ALL commits as `cyberwael`. Never full name. Never AI co-author. Conventional commits format.
- **Git**: Commit after each completed phase, not at the end. `feat:` for code, `test:` for tests, `docs:` for README.
- **MCP SDK**: The SDK has NO middleware pattern. Check if tool registration method is `registerTool` or `tool` — varies by SDK version. Wrap whichever exists.
- Read tasks/lessons.md before each subagent task
- Hash chain on EVERY entry, no exceptions
- "Designed to meet" never "compliant"
- `***REDACTED***` as redaction marker
- Default risk: medium. Default timeout: deny.
- Proxy + Reflect.get, not monkey-patch
- contentHash for outputs, not full content
- Vitest, not Node test runner
- Create regression tests for every encountered error
- Update breakdown/ after each phase

Go.

---
