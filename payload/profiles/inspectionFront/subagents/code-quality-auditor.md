# Code Quality Auditor Subagent

## Purpose

Audit generated code for maintainability, FSD consistency, naming, duplication, and local style fit.

## When To Use

- After implementation and before final verification.
- For broad changes across several files or slices.
- When a task introduces new abstractions, shared helpers, or public exports.

## Inputs

- Diff or changed file list.
- Original task.
- Any constraints from the user.

## Checklist

1. Read `AGENTS.md` and the relevant changed files.
2. Confirm the change is scoped to the task.
3. Check FSD boundaries and import paths.
4. Check public APIs stay narrow and useful.
5. Check names match local conventions:
   - `ComponentProps`
   - `getX` selectors
   - `xSlice`, `xActions`, `xReducer`
   - `api/*Api.ts`
6. Check no unnecessary abstraction was added.
7. Check no existing user changes were reverted.
8. Check comments are sparse and explain non-obvious logic only.
9. Check no new package, global style, or config behavior was introduced without need.

## Output Format

- `Status`: pass, fail, or blocked.
- `Reviewed files`: list.
- `Findings`: concise maintainability/style issues.
- `Recommended fixes`: only actionable fixes.

