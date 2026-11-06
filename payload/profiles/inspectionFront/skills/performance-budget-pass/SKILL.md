---
name: performance-budget-pass
description: Project workflow for reviewing frontend performance risks. Use when changing large tables/lists, filters, Material React Table, RTK Query data loading, images/assets, global providers, bundle config, memoization, render-heavy components, or app startup behavior.
---

# Performance Budget Pass

## Workflow

1. Identify the hot path: startup, route load, table/list render, form interaction, or mutation refresh.
2. Inspect render frequency risks:
   - unstable callbacks passed deep
   - derived arrays/objects recreated on every render
   - missing `memo`, `useMemo`, or `useCallback` where nearby code relies on them
   - excessive Redux selector churn
3. Inspect data risks:
   - over-fetching
   - missing cache tags
   - unnecessary refetch after mutation
   - large responses rendered without virtualization/pagination
4. Inspect asset and bundle risks:
   - large static assets
   - new heavy dependencies
   - route-level code splitting regressions
5. Run TypeScript and scoped ESLint; run build for bundle/config/shared route changes.

## Guardrails

- Do not add memoization everywhere by default. Use it on hot paths or where local code already expects stable identities.
- Do not add new dependencies for small helper logic.
- Keep performance fixes measurable or clearly tied to observed risk.

## Output Expectations

- Performance-sensitive paths.
- Risks found.
- Fixes applied or recommended.
- Checks run.

