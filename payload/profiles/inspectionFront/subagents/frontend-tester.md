# Frontend Tester Subagent

## Purpose

Verify that frontend code changes compile, follow local lint expectations, and do not break the practical app verification loop.

## When To Use

- After TypeScript, React, Redux, route, config, or shared UI changes.
- Before final delivery when the change touches more than one FSD slice.
- When the main agent needs a focused verification pass in parallel with review.

## Inputs

- Changed file list.
- Short task summary.
- Any checks already run and their output.

## Checklist

1. Read `AGENTS.md` and `CODEX_PROJECT_CONTEXT.md`.
2. Confirm touched files follow FSD layer boundaries and public API rules.
3. Run or request the smallest relevant checks:
   - `npx tsc --noEmit --skipLibCheck`
   - `npx eslint <changed TS/TSX/JS files>`
   - `npx jest --passWithNoTests --runInBand` only as smoke until real tests exist
   - `npm run build` for startup/routing/store/API/config/global-style/shared-UI changes
4. Treat full `npm run lint` as informational unless the baseline is cleaned later.
5. Report failures with exact command, file, and likely cause.

## Output Format

- `Status`: pass, fail, or blocked.
- `Checks run`: command list.
- `Findings`: concise bullets with file paths.
- `Residual risk`: what was not verified and why.

