# Breakdown — PROMPT-03: Publish v0.1.0 + Distribution Content

> **Date:** 2026-03-13
> **Tâche:** Phase 3.3 (Publish) + Phase 4.1 partial (Content)
> **Statut:** 🔵 EN COURS

## Execution Plan

### Step 1 — Pre-publish Final Check (sequential, fast)
- `npm run build` — must be zero errors
- `npm test` — must be 53/53
- `npm pack --dry-run` — verify ~27.8 kB, no unexpected files

### Step 2 — Publish v0.1.0 (sequential, strict error handling)
1. Verify `package.json` version is `0.1.0`
2. `npm whoami` — if fails → STOP, report auth needed
3. `npm publish --access public` — if fails → STOP, report exact error
4. `git tag v0.1.0`
5. `git push origin main --tags` — if fails → STOP, report exact error
6. Verify: `npm view mcp-eu-comply` shows v0.1.0

### Step 3 — Parallel Post-Publish (3 subagents)
| Subagent | Output File | Description |
|----------|-------------|-------------|
| A | `docs/changelog.md` + `CONTRIBUTING.md` | Release docs |
| B | `docs/content/show-hn-draft.md` | Show HN post draft |
| C | `docs/content/article-eu-ai-act-mcp.md` | SEO article draft |

### Step 4 — Final Commit (sequential)
- Stage all new docs
- Commit: `docs: v0.1.0 changelog, contributing guide, and content drafts`
- Push to origin

### Step 5 — Open Reflection
"The first 10 people who find this package on npm..."

## Results
(Updated after completion)
