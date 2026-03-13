# Skill: Code Review for mcp-eu-comply

## When to Use
Before merging any code change.

## Checklist

### Legal
- [ ] No "compliant" or "certified" anywhere — only "designed to meet requirements"
- [ ] No PII in test fixtures or example code (use fake data)

### Hash Chain
- [ ] Every AuditLogEntry has `prevHash` AND `hash`
- [ ] First entry: `prevHash = "genesis"`
- [ ] `hash = SHA-256(JSON.stringify({...entry, hash: undefined}))`
- [ ] Hash computed on REDACTED content
- [ ] chain-state.json updated after writes

### Proxy Wrapper
- [ ] Non-intercepted methods use `Reflect.get(target, prop, receiver)`
- [ ] Compliance errors: caught + console.warn, never thrown
- [ ] Original tool return value passed through unchanged
- [ ] Tool output logged as contentHash, not full content

### PII / GDPR
- [ ] Redaction happens BEFORE hash computation
- [ ] Redaction marker is `***REDACTED***`
- [ ] Objects deep-cloned before redaction (no mutation)
- [ ] Case-insensitive field matching

### Risk & Oversight
- [ ] Default risk = `medium` when no rule matches
- [ ] Timeout default = `deny`
- [ ] Denied actions are logged (they're audit events)

### TypeScript
- [ ] Strict mode passes
- [ ] No `any` without explicit comment
- [ ] All public functions have JSDoc
- [ ] All new code has tests

### Error Handling
- [ ] If a new bug was found: regression test exists in `tests/regression/`
- [ ] If a new pattern was learned: entry in `tasks/lessons.md`

### Git
- [ ] Commit author is `cyberwael` (check `git config user.name`)
- [ ] No `Co-authored-by` with AI in commit message
- [ ] Commit message follows conventional format (`feat:`, `fix:`, `test:`, `docs:`, `chore:`)
