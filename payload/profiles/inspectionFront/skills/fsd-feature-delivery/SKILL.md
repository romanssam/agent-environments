---
name: fsd-feature-delivery
description: Project workflow for delivering React/TypeScript changes in this Feature-Sliced Design codebase. Use for implementing features, fixing bugs, changing components, moving logic between FSD layers, or updating shared UI/state while preserving local architecture and verification discipline.
---

# FSD Feature Delivery

## Workflow

1. Read `AGENTS.md` and `CODEX_PROJECT_CONTEXT.md`.
2. Inspect the nearest existing slice and its public `index.ts`.
3. Identify the owning FSD layer before editing:
   - `shared`: reusable UI, hooks, API base, generic utilities.
   - `entities`: domain models, domain UI, entity API.
   - `features`: user actions and business capabilities.
   - `widgets`: composed blocks used by pages.
   - `pages`: route-level assembly.
   - `app`: providers, global styles, bootstrapping.
4. Match local patterns for props, imports, selectors, slices, styles, and API hooks.
5. Edit narrowly.
6. Run the verification loop from `AGENTS.md`.
7. Update `CODEX_PROJECT_CONTEXT.md`.

## Guardrails

- Do not bypass public APIs across slices when `index.ts` exports the needed symbol.
- Do not introduce new state libraries, styling systems, or API clients.
- Prefer existing shared UI and hooks.
- Keep reusable abstractions out of feature slices unless they are feature-specific.
- Add comments only for non-obvious logic.

## Output Expectations

- Changed files list.
- Checks run.
- FSD or public API risks.
- Context log update.

