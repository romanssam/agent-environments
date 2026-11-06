---
name: release-readiness-pass
description: Project workflow for final release readiness of frontend changes. Use before final delivery, staging handoff, PR creation, or deployment-sensitive work to verify checks, risks, rollback notes, changed files, context log updates, and reviewer/auditor coverage.
---

# Release Readiness Pass

## Workflow

1. Read the final diff and task requirements.
2. Confirm `CODEX_PROJECT_CONTEXT.md` has a current entry.
3. Confirm verification matches risk:
   - TypeScript for source changes.
   - scoped ESLint for changed TS/TSX/JS.
   - Jest smoke only when useful.
   - build for startup/routing/store/API/config/global-style/shared-UI changes.
   - browser pass for visible UI changes.
4. Check whether a code reviewer, UI tester, API tester, or performance auditor should be used.
5. Prepare final notes:
   - changed files
   - checks run
   - skipped checks and why
   - residual risks
   - rollback or follow-up notes when relevant

## Guardrails

- Do not claim tests passed unless they were run.
- Do not hide known baseline failures.
- Do not stage, commit, push, or create PRs unless explicitly asked.
- Keep release notes factual and concise.

