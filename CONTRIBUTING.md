# Contributing to mcp-eu-comply

Thanks for your interest in contributing to the first runtime EU AI Act compliance layer for MCP servers.

## Setup

```bash
git clone https://github.com/Cyberwael/mcp-eu-comply.git
cd mcp-eu-comply
npm install
npm test        # 53 tests, all must pass
npm run build   # TypeScript strict, zero errors
```

## Code style

- **TypeScript strict mode** — `strict: true`, `noUncheckedIndexedAccess: true`
- **JSDoc on all public functions** — `@param` and `@returns` required
- **No `any` without comment** — every `any` must have an `// eslint-disable` with explanation
- **Actionable error messages** — WHAT went wrong + HOW to fix
- **Import extensions** — all local imports use `.js` extensions (CommonJS output)

## Commit conventions

We use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` — new feature
- `fix:` — bug fix
- `test:` — test additions or changes
- `docs:` — documentation
- `chore:` — maintenance

## Testing requirements

Every feature or bug fix must include tests.

- Unit tests live next to source: `src/foo.ts` → `tests/foo.test.ts`
- Run with: `npm test` (Vitest)
- **All 7 critical invariants must pass before any release:**
  1. Hash chain tamper detection
  2. chain-state.json persistence across restarts
  3. Oversight timeout → deny (default)
  4. Oversight timeout → allow (configured)
  5. PII redacted before hash computation
  6. Proxy Reflect.get passthrough
  7. Wrapper error resilience

## Pull request process

1. Fork the repo
2. Create a feature branch (`feat/your-feature`)
3. Write tests first (or alongside implementation)
4. Ensure `npm run build && npm test` passes with zero errors
5. Open a PR against `main`
6. Describe what changed and why

## Language guidelines

This project covers EU regulation. Important:

- **Say "designed to meet"** — never "compliant" or "certified"
- CEN/CENELEC harmonised standards are not yet published
- We implement the spirit of the regulation, not a certified standard

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
