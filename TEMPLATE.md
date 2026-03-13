# Breakdown Template

Create one of these at the START of each Claude Code prompt/phase.
Name: `breakdown_prompt_X.md` where X is the prompt number.

---

## Breakdown Prompt [X] — [Phase Name]

### Date: [YYYY-MM-DD]

### Objective
[What this prompt aims to accomplish]

### Subagents Launched

| # | Module | Files | Dependencies | Status |
|---|--------|-------|-------------|--------|
| 1 | [name] | [files] | [what it needs] | ⏳ pending / ✅ done / ❌ failed |
| 2 | ... | ... | ... | ... |

### Execution Order
```
Step 1: [sequential task]
Step 2: Launch subagents [1, 2, 3] in parallel
Step 3: Wait → Launch subagents [4, 5] in parallel
Step 4: [sequential integration]
...
```

### Results (filled after completion)

**Build status**: `npm run build` → [pass/fail]
**Test status**: `npm test` → [X/Y tests pass]

### Errors Encountered

| Error | Root Cause | Fix | Regression Test |
|-------|-----------|-----|-----------------|
| [description] | [cause] | [what was changed] | [test file path] |

### Lessons Added to tasks/lessons.md
- [lesson 1]
- [lesson 2]

### Tasks Checked Off
- [x] task 1
- [x] task 2
