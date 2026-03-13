# Lessons Learned — mcp-eu-comply

## Immutable Rules

### Git
- ALL commits: author = `cyberwael`. Run `git config user.name "cyberwael"` at project init.
- NEVER use full legal name in commits.
- NEVER add `Co-authored-by: Claude` or any AI co-author.
- Commit format: conventional commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:`).
- Commit frequently: one commit per completed module, not one mega-commit.

### Legal
- NEVER write "compliant" or "certified" → always "designed to meet EU AI Act Article X requirements"
- Reason: CEN/CENELEC harmonised standards not published. Claiming compliance = legally misleading.

### Hash Chain
- EVERY AuditLogEntry has `prevHash` AND `hash` fields
- `prevHash` = hash of previous entry. First entry: `prevHash = "genesis"`
- `hash` = SHA-256(JSON.stringify({...entry, hash: undefined})) — hash field excluded from computation
- Hash the REDACTED content, not the original — auditor verifies chain on redacted logs
- Persist last hash in `chain-state.json` for continuity across restarts and file rotations
- NEVER skip chain in tests — invalid chain = useless logs

### PII / GDPR
- Redact BEFORE hash computation, BEFORE storage
- Redaction marker: `***REDACTED***` (not [REDACTED])
- Deep clone objects before redacting — NEVER mutate originals
- Case-insensitive field matching
- Default sensitive fields: email, name, address, iban, phone, ssn, credit_card, password, date_of_birth

### Wrapper
- Use Proxy pattern on McpServer, intercept `registerTool`
- All non-intercepted methods: `Reflect.get(target, prop, receiver)`
- NEVER throw from compliance layer — catch + console.warn + pass through
- Original tool callback return value must pass through UNCHANGED
- Log contentHash of tool output (SHA-256), not full output content

### Risk & Oversight
- Risk levels: low, medium, high, critical (NOT minimal/limited — aligned with vision doc)
- Default risk when no rule matches: `medium` (precautionary principle)
- Timeout on human oversight → `deny` by default (Article 14 precaution)
- Log denied actions — they're audit events too

### Architecture
- Zero external runtime deps beyond Node built-ins + MCP SDK
- CommonJS output for compatibility
- Vitest for tests (NOT Node built-in runner)
- TypeScript strict mode always
- File structure: src/logger/, src/classifier/, src/oversight/, src/wrapper/
- License: MIT (NOT Apache 2.0 — vision doc section 10 says Apache but we use MIT consistently)

### MCP SDK
- The MCP SDK has NO middleware pattern server-side. No server.use() or server.middleware().
- Interception is via JavaScript Proxy on the McpServer instance
- The method to intercept may be `registerTool` or `tool` depending on SDK version — CHECK AT RUNTIME
- Always use `Reflect.get(target, prop, receiver)` for non-intercepted methods

### Parallelization
- ALWAYS use subagents for independent modules
- Follow dependency graph in CLAUDE.md strictly
- One module + its tests per subagent
- After subagents complete: `npm run build && npm test` before proceeding

### Product (from vision doc section 9)
- Do NOT over-engineer v0.1 — no dashboard, no SaaS, no database. NDJSON files. npm package IS the product.
- Do NOT target "all MCP servers" — target EU fintechs (DORA + AI Act) and EU e-commerce first
- Do NOT build dashboard before 50 npm users — dashboard is a future product, not the MVP
- Do NOT neglect DX — a dev must have working compliance in < 5 minutes. If it's hard, they uninstall.
- Do NOT ignore GitHub issues — each issue is a signal. Respond in < 24h.

### Marketing (from vision doc section 9)
- Do NOT market before May 2026 — build March-April, market when panic starts
- Do NOT make a landing page SaaS — the README is the landing page for v0.1
- Do NOT create Discord/community before 200+ stars — empty community kills credibility
- Do NOT use the word "startup" — this is a side project open source. Technical credibility first.
- Do NOT create a Twitter/X account for the project — publish under personal name until traction

### Naming
- Package name: `mcp-eu-comply` — short, googlable, no scope org for v0.1
- NEVER use "sovereign", "shield", or political terms in naming
- README tone: technical, factual, urgent. Not hype.

## Error-to-Test Pattern

**MANDATORY whenever any error is encountered:**
1. Fix the error in source code
2. Create `tests/regression/regression_YYYYMMDD_description.test.ts`
3. The test MUST reproduce the exact error condition
4. Add the error pattern to this file under "Encountered Errors" below
5. Run all tests including regression/ to confirm fix

## Encountered Errors
(This section is populated at runtime — add entries here as errors are discovered)

```
Template:
### [DATE] — Short description
- **What happened:** ...
- **Root cause:** ...
- **Fix:** ...
- **Regression test:** tests/regression/regression_YYYYMMDD_description.test.ts
```
