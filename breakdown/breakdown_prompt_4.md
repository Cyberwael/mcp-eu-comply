# Breakdown — PROMPT-04: Publish v0.1.0 (auth resolved) + Push Unpushed Commits

> **Date:** 2026-03-13
> **Tâche:** Phase 3.3 completion — push + prepublishOnly + publish + verify
> **Statut:** ✅ Terminé

## Results

### Step 1 — Push unpushed PROMPT-03 commits ✅
- **5 unpushed commits** found (`git log origin/main..HEAD`):
  1. `test: add critical test invariants for audit readiness`
  2. `fix: import consistency and example paths from QA audit`
  3. `docs: Phase 3 QA breakdown + todo updates`
  4. `docs: v0.1.0 changelog, contributing guide, and content drafts`
  5. `docs: update breakdown with results + open reflection`
- Pushed: `2ab5e64..5e89d78 main -> main`

### Step 2 — prepublishOnly guard ✅
- Added `"prepublishOnly": "npm run build && npm test && npm whoami"` to package.json
- Commit: `chore: add prepublishOnly guard for auth and build verification` (cea8cba)
- Pushed immediately after commit

### Step 3 — Publish v0.1.0 ✅
- `npm whoami` → `cyberwael` ✅
- First attempt: **E403** — npm required 2FA or granular access token with bypass
- Fix: User created granular access token with "Bypass 2FA" enabled, Read and Write permissions
- Token set via `npm config set //registry.npmjs.org/:_authToken=...`
- `npm publish --access public` → **`+ mcp-eu-comply@0.1.0`** ✅
- prepublishOnly ran automatically: build clean, 53/53 tests, auth verified
- `git tag v0.1.0` + `git push origin main --tags` ✅
- `npm view mcp-eu-comply version` → `0.1.0` ✅

### Step 4 — Post-publish verification ✅
- All docs exist: changelog.md, CONTRIBUTING.md, show-hn-draft.md, article-eu-ai-act-mcp.md
- Package live at: https://www.npmjs.com/package/mcp-eu-comply
- GitHub tag: https://github.com/Cyberwael/mcp-eu-comply/releases/tag/v0.1.0

## Metrics

- **Unpushed commits recovered:** 5
- **npm publish:** SUCCESS — 27.8 kB, 39 files, 53/53 tests
- **Errors encountered:** 2 (E403 2FA, resolved with granular token)
- **Commits this prompt:** 3 (prepublishOnly, v0.1.0 release, breakdown)
- **All pushed:** ✅

## Errors Encountered

### E403 Two-Factor Authentication Required
- **What happened:** `npm publish --access public` returned 403: "Two-factor authentication or granular access token with bypass 2fa enabled is required"
- **Root cause:** npm account has 2FA enabled. Standard auth token doesn't bypass 2FA for publish operations.
- **Fix:** User created granular access token on npmjs.com with "Bypass two-factor authentication" checked, Read and Write permissions on packages.
- **Prevention:** Document in lessons.md that npm publish requires either OTP or granular token with 2FA bypass.

## Open Reflection

**"Looking at the full project from PROMPT-01 through PROMPT-04 — what would you do differently if you started over?"**

### What I'd keep exactly the same

**The parallelization strategy paid off massively.** PROMPT-01 built 5 independent modules in parallel (Group A: hash-chain, pii-redactor, risk-classifier; Group B: audit-logger, oversight-engine). Zero merge conflicts. The dependency graph in CLAUDE.md was the single most valuable planning artifact — it prevented wasted time on ordering decisions.

**The "compliance layer never throws" design rule.** This was established in PROMPT-01 and validated by Critical Test Invariant #7. It's the right decision for a wrapper that sits in the hot path of every MCP tool call. If we threw on logging failure, no one would use this in production.

**The 7 Critical Test Invariants.** Defining these upfront (even before writing all the tests) forced the right test coverage. When PROMPT-02 audited them, 4/7 already existed — the 3 missing ones were all cross-module tests that subagents wouldn't naturally write. Knowing *what* to test is more valuable than testing more.

### What I'd do differently

**Push after every commit from PROMPT-01.** The "push policy" wasn't established until PROMPT-04, after 5 commits piled up unpushed. For a solo dev, there's zero reason to batch. The cost of losing unpushed work to a machine crash is real. This should have been in CLAUDE.md from day one.

**Run `npm pack --dry-run` in PROMPT-01, not PROMPT-02.** The missing `.js` import extensions were invisible to Vitest but would have broken for ESM consumers. `npm pack --dry-run` + a quick `node -e "require('./dist')"` smoke test would have caught this immediately. Lesson: your test suite validates your code, but `npm pack` validates your package.

**Add prepublishOnly in PROMPT-01, not PROMPT-04.** The ENEEDAUTH error in PROMPT-03 was embarrassing but entirely preventable. A `prepublishOnly` script should be a day-one package.json entry for any npm package. It's the equivalent of a pre-commit hook — trivial to add, expensive to forget.

**Write the README before the code.** The README was written as a parallel task in PROMPT-01 Step 5. It could have been written in Step 0 as the *spec*. README-driven development forces you to think about the API surface from the consumer's perspective before you write a single line of implementation. The one-liner (`wrapWithCompliance(server, config)`) was always the right API — but the config shape, the risk levels, the oversight flow — these would have been clearer if the README existed before `types.ts`.

### What was wasted effort

**The `tool` method interception.** We intercept both `registerTool` and the deprecated `tool` method in the Proxy. In practice, the MCP SDK v1.27+ only uses `registerTool`. The `tool` interception is ~20 lines of dead code. It doesn't hurt, but it was time spent on backwards compatibility for a protocol that's only 6 months old. Should have shipped with just `registerTool` and added `tool` only if someone filed an issue.

**The webhook handler.** `WebhookHandler` is a complete HTTP implementation for oversight approvals. But every real user will write a custom handler (Slack bot, internal dashboard, queue). The webhook is an example, not a feature. It should have been in `examples/`, not `src/`. It inflates the package and the test surface for something no production user will use as-is.

### What paid off more than expected

**The `schemaVersion: "0.1.0"` field in every audit entry.** When CEN/CENELEC publishes harmonised standards (probably H2 2026), the log format will almost certainly need to change. Having a version field means we can migrate existing logs without breaking chain integrity. This tiny decision — 1 line of code — is probably worth more than the entire oversight engine for long-term adoption.

**The content drafts (Show HN + article).** Writing these forced clarity about positioning. The Show HN constraint (300 words, no hype) is a brutal filter for what actually matters. If you can't explain your project in 300 words, your README is probably too long too. The article draft (~1100 words) became a reference document for how to talk about the project — not just marketing, but a thinking tool.
