# Tasks — mcp-eu-comply

## Execution Rules
- **PARALLELIZE EVERYTHING.** Use subagents for every independent module.
- Before each phase: create `breakdown/breakdown_prompt_X.md` documenting what subagents are launched.
- After each task: check it off here.
- After any error: fix it, create regression test in `tests/regression/`, update `tasks/lessons.md`.
- After each phase: update the breakdown file with results.

---

## Phase 1: Foundation + Core Modules

### 1.0 Project Setup [SEQUENTIAL — do first]
- [ ] Create package.json (name: mcp-eu-comply, MIT, peer dep on @modelcontextprotocol/sdk)
- [ ] Create tsconfig.json (strict, CommonJS, outDir dist, rootDir src)
- [ ] Create .gitignore (node_modules, dist, audit-logs, *.ndjson, chain-state.json, retention.json)
- [ ] Install dev deps: typescript, @types/node, @modelcontextprotocol/sdk, vitest
- [ ] Create LICENSE (MIT)
- [ ] **Git config**: `git config user.name "cyberwael"` — ALL commits under this name, never full legal name, never co-author with AI
- [ ] Verify: `npm run build` compiles empty project

### 1.1 Types [SEQUENTIAL — everything imports this]
- [ ] Create `src/types.ts` with ALL types from vision doc:
  - RiskLevel: `'low' | 'medium' | 'high' | 'critical'`
  - OversightStatus: `'approved' | 'denied' | 'timeout' | 'not-required'`
  - TimeoutAction: `'deny' | 'allow' | 'escalate'`
  - DataRegion: `'EU' | 'FR' | 'DE' | 'custom'`
  - ComplianceConfig, RiskRule (with toolPattern: RegExp|string + optional argsPattern), LoggingConfig (with hashAlgorithm: 'sha256'|'sha384'|'sha512' option), OversightConfig (with requireApproval, notifyOn, timeoutMs, onTimeout), DataResidencyConfig (with region, piiFields, redactInLogs)
  - AuditLogEntry (with id, timestamp, prevHash, hash, tool, args, risk, oversight{required,status,approvedBy,approvedAt,reason}, result{status,error,contentHash}, durationMs, agentId, sessionId, schemaVersion:'0.1.0')
  - OversightHandler (with requestApproval() + notify() methods), OversightRequest, OversightDecision, OversightNotification
- [ ] Verify: `npm run build` zero errors

### 1.2 Hash Chain [PARALLEL GROUP A — launch with 1.3 and 1.4]
- [ ] Create `src/logger/hash-chain.ts`
  - `computeEntryHash(entry)`: SHA-256 of JSON.stringify({...entry, hash: undefined})
  - `getGenesisHash()`: returns "genesis"
  - `loadChainState(logDir)`: reads chain-state.json, returns last hash
  - `saveChainState(logDir, lastHash)`: persists to chain-state.json
  - `verifyChain(logDir)`: reads all NDJSON files, verifies every prevHash/hash pair
    Returns: `{ valid: boolean, entries: number, firstBrokenAt?: number, error?: string }`
- [ ] Create `tests/hash-chain.test.ts`
  - Test: genesis entry has prevHash = "genesis"
  - Test: chain of 10 entries, all valid
  - Test: tamper detection (modify entry 5, verify breaks at 5)
  - Test: chain-state.json persistence across "restarts"
  - Test: empty chain is valid

### 1.3 PII Redactor [PARALLEL GROUP A — launch with 1.2 and 1.4]
- [ ] Create `src/logger/pii-redactor.ts`
  - `redactFields(obj, piiFields)`: deep recursive, returns new object (never mutates)
  - Replaces matched field values with `***REDACTED***`
  - Case-insensitive field matching
  - Handles: nested objects, arrays of objects, null/undefined values
- [ ] Create `tests/pii-redactor.test.ts`
  - Test: flat object redaction
  - Test: nested object redaction
  - Test: array of objects redaction
  - Test: original object NOT mutated (deepStrictEqual before/after)
  - Test: case-insensitive matching (Email, EMAIL, email all redacted)
  - Test: non-matching fields untouched
  - Test: null/undefined values don't crash

### 1.4 Risk Classifier [PARALLEL GROUP A — launch with 1.2 and 1.3]
- [ ] Create `src/classifier/risk-classifier.ts`
  - `classifyRisk(toolName, args, rules)`: returns RiskLevel
  - Matches toolPattern (RegExp or string) against tool name
  - Optional argsPattern matching
  - Returns highest matching risk level
  - Default: `medium` when no rule matches
- [ ] Create `tests/risk-classifier.test.ts`
  - Test: exact string match
  - Test: regex match
  - Test: args pattern match
  - Test: highest risk wins when multiple rules match
  - Test: default medium when no match
  - Test: empty rules → medium

### 1.5 Audit Logger [PARALLEL GROUP B — launch with 1.6 AFTER 1.2+1.3+1.4]
- [ ] Create `src/logger/audit-logger.ts`
  - Constructor: takes LoggingConfig + DataResidencyConfig
  - `log(params)`: creates AuditLogEntry, redacts PII, computes hash chain, appends to NDJSON
  - File naming: `YYYY-MM-DD.ndjson` in outputDir
  - Uses hash-chain for prevHash/hash computation
  - Uses pii-redactor for args redaction
  - Stores contentHash of result (SHA-256), not full result
  - Manages chain-state.json via hash-chain module
  - `flush()`: ensure buffer written
  - `generateReport(from, to)`: reads NDJSON files, produces summary stats
  - `shutdown()`: flush + cleanup
- [ ] Create `tests/audit-logger.test.ts`
  - Test: single log entry written to correct NDJSON file
  - Test: hash chain valid across 10 entries
  - Test: PII redacted in logged args
  - Test: contentHash stored instead of full output
  - Test: chain-state.json updated after each log
  - Test: daily file rotation (mock date change)
  - Test: NDJSON format (each line is valid JSON)
  - Test: report generation with summary stats

### 1.6 Oversight Engine [PARALLEL GROUP B — launch with 1.5 AFTER 1.2+1.3+1.4]
- [ ] Create `src/oversight/oversight-engine.ts`
  - `check(toolName, args, risk, config)`: determines if approval needed
  - If risk in requireApproval → call handler.requestApproval(), wait for response
  - If risk in notifyOn → call handler.notify() (non-blocking)
  - Timeout handling: if no response in timeoutMs → apply onTimeout action (deny/allow/escalate)
  - Returns OversightResult for inclusion in audit entry
- [ ] Create `src/oversight/webhook-handler.ts`
  - Default OversightHandler implementation via HTTP webhook
  - POST request with OversightRequest body
  - Waits for response or timeout
  - Non-blocking notify via fire-and-forget POST
- [ ] Create `tests/oversight-engine.test.ts`
  - Test: low risk → not-required, no handler called
  - Test: critical risk → handler called, approved
  - Test: critical risk → handler called, denied → action blocked
  - Test: timeout → deny (default behavior)
  - Test: timeout → allow (configured)
  - Test: notifyOn → handler.notify called, not blocking
  - Test: no handler configured → auto-approve with warning

---

## Phase 2: Wrapper + Integration

### 2.1 Compliance Wrapper [SEQUENTIAL — core integration, needs everything]
- [ ] Create `src/wrapper/compliance-wrapper.ts`
  - `wrapWithCompliance(server, config)`: returns Proxy of McpServer
  - Proxy intercepts `registerTool` calls
  - For each registered tool callback, wraps with:
    1. Start timer
    2. Classify risk via risk-classifier
    3. Check oversight via oversight-engine
    4. If denied → log denied entry, return error to agent
    5. Execute original callback
    6. Log success/error entry via audit-logger
    7. Return original result unchanged
  - All non-intercepted methods pass via Reflect.get
  - Errors in compliance layer: catch + console.warn, never throw
- [ ] Create `tests/compliance-wrapper.test.ts`
  - Test: tool call is intercepted and logged
  - Test: original return value passed through unchanged
  - Test: high-risk tool triggers oversight check
  - Test: denied action returns error, original callback NOT called
  - Test: compliance error doesn't break tool execution
  - Test: non-registerTool methods pass through (Reflect.get)
  - Test: PII redacted in logged args
  - Test: hash chain valid across wrapped tool calls

### 2.2 Public API [PARALLEL with 2.3 and 2.4 AFTER 2.1]
- [ ] Create `src/index.ts` — clean exports
  - Export: wrapWithCompliance
  - Export: all types (ComplianceConfig, AuditLogEntry, RiskLevel, etc.)
  - Export: verifyChain (for CLI/external use)
  - Do NOT export internal classes (AuditLogger, RiskClassifier, etc.)
- [ ] Verify: consumer can `import { wrapWithCompliance } from "mcp-eu-comply"`

### 2.3 Examples [PARALLEL with 2.2 and 2.4 AFTER 2.1]
- [ ] `examples/basic-server.ts` — minimal 15-line example
- [ ] `examples/fintech-server.ts` — DORA mode, all financial tools critical, strict oversight
- [ ] `examples/ecommerce-server.ts` — agent commerce, payment tools high-risk

### 2.4 README [PARALLEL with 2.2 and 2.3 AFTER 2.1]
- [ ] Hook: "August 2, 2026. €35M fines." in first 2 lines
- [ ] Quick start: npm install + 5 lines of code
- [ ] What it does: Article 12, 14, 19 + GDPR + DORA
- [ ] Example audit entry (JSON)
- [ ] Oversight config example
- [ ] Storage options
- [ ] Config reference table
- [ ] Risk levels table with EU AI Act mapping
- [ ] Regulatory coverage table
- [ ] "Designed to meet" disclaimer
- [ ] Roadmap checklist

---

## Phase 3: QA + Ship

### 3.0 Critical Test Audit [SEQUENTIAL — must be first, this validates the foundation] ✅

These 7 test scenarios are what a DPO, auditor, or senior dev would check FIRST.
4 already existed, 3 added in PROMPT-02. All 7 verified passing (53/53 tests).

- [x] **Hash chain tamper detection**: already covered in `tests/hash-chain.test.ts`
- [x] **chain-state.json persistence**: ADDED in `tests/audit-logger.test.ts`
- [x] **Oversight timeout → deny (default)**: already covered in `tests/oversight-engine.test.ts`
- [x] **Oversight timeout → allow (configured)**: already covered in `tests/oversight-engine.test.ts`
- [x] **PII redacted BEFORE hash**: ADDED in `tests/audit-logger.test.ts`
- [x] **Proxy Reflect.get passthrough**: ENHANCED in `tests/compliance-wrapper.test.ts`
- [x] **Wrapper error resilience**: already covered in `tests/compliance-wrapper.test.ts`

### 3.1 Parallel QA Sweep [4 subagents simultaneously AFTER 3.0] ✅

**Subagent A — Build & Package QA:** ✅ 6/6
- [x] `npm run build` — zero errors, zero warnings
- [x] All files in dist/ present and correct
- [x] package.json `files` field: only `dist`, `README.md`, `LICENSE`
- [x] Verify NO test files, tasks/, breakdown/, .claude/ in published package
- [x] Run `npm pack --dry-run` and check the file list — 27.8 kB

**Subagent B — README QA:** ✅ 9/10 (badges deferred, non-blocking)
- [x] "August 2, 2026" appears in first 2 lines
- [x] NEVER says "compliant" (only "designed to meet")
- [x] Quick start works in ≤ 5 lines of code
- [x] All code examples use correct API name: `wrapWithCompliance`
- [x] Config reference table present and complete
- [x] Risk levels table present with EU AI Act article mapping
- [x] Regulatory coverage table (AI Act + GDPR + DORA + eIDAS roadmap)
- [x] Example audit entry JSON block is valid and shows hash chain + PII redaction + oversight
- [ ] Badges (npm version, build, license) — deferred to post-publish

**Subagent C — Code Quality:** ✅ 7/8 (import fix applied)
- [x] Search all `src/` for `any` type — each has a comment
- [x] All public functions in src/ have JSDoc with @param and @returns
- [x] All error messages are actionable
- [x] No hardcoded values that should be configurable
- [x] Default risk is `medium` everywhere
- [x] Default timeout action is `deny` everywhere
- [x] Import extensions fixed (4 missing `.js` in `src/logger/`)

**Subagent D — Examples & Config:** ✅ 21/24 (import paths fixed)
- [x] All 3 examples compile
- [x] Examples are self-contained and readable
- [x] Created `eu-comply.config.example.ts` at repo root
- [x] .gitignore includes all required entries
- [x] Example import paths fixed from `'../src/index.js'` to `'mcp-eu-comply'`

### 3.2 Final Integration Check [SEQUENTIAL — after 3.1] ✅
- [x] Run full `npm run build && npm test` — 53/53 pass, zero errors
- [x] All tests pass (original 51 + 2 new from 3.0)
- [x] Commits: `test: add critical test invariants` + `fix: import consistency` + `docs: Phase 3 breakdown`
- [x] tasks/todo.md updated
- [x] breakdown/breakdown_prompt_2.md written

### 3.3 Publish [SEQUENTIAL — Claude Code does everything. Push after every commit.]

**npm auth is configured** (user ran `npm login`).
- [x] Run `npm whoami` — returned `cyberwael` ✅
- [x] Add `prepublishOnly` script to package.json
- [x] Commit + push: `chore: add prepublishOnly guard` (cea8cba)
- [x] `npm publish --access public` — **PUBLISHED** `+ mcp-eu-comply@0.1.0` ✅
- [x] `git tag v0.1.0` ✅
- [x] `git push origin main --tags` ✅
- [x] Verify: `npm view mcp-eu-comply` → `0.1.0` ✅
- [x] Verify `docs/changelog.md` exists ✅
- [x] Commit + push: `chore: v0.1.0 published to npm`

---

## Phase 4: Distribution (week 3-4, after ship)

### 4.1 Content & SEO [PARALLEL with 4.2]
Target queries devs will search May-July 2026:
- [ ] Article: "EU AI Act MCP compliance" — foundational article, rank for this query
- [ ] Article: "AI Act Article 12 logging requirements for AI agents" — technical guide
- [ ] Article: "DORA AI agent compliance fintech" — targeted at fintechs
- [ ] Article: "How to make MCP server EU compliant" — practical tutorial
- [ ] Publish on Medium + dev.to (dual SEO). Each article links to the npm package.
- [ ] Show HN: "mcp-eu-comply — EU AI Act compliance for MCP servers in one line"
- [ ] Posts: r/artificial, r/MachineLearning, r/europrivacy, r/fintech

### 4.2 NIST [PARALLEL with 4.1]
- [ ] Read NIST concept paper on AI Agent Identity and Authorization
- [ ] Draft submission referencing mcp-eu-comply as implementation
- [ ] Submit to AI-Identity@nist.gov before April 2

### 4.3 Extras [AFTER 4.1 and 4.2]
- [ ] Create `eu-comply.config.example.ts` at repo root (per vision doc)
- [ ] Tag MCP community members, Anthropic devrel, EU compliance folks on X
