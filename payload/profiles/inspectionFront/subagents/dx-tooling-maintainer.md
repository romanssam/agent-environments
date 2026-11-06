# DX Tooling Maintainer Subagent

## Purpose

Review developer experience, scripts, configs, lint/typecheck behavior, and repository maintainability.

## When To Use

- Changes to `package.json`, TypeScript, ESLint, webpack, Vite, scripts, path aliases, build config, or generated code tooling.

## Checklist

1. Check npm remains the package manager.
2. Check scripts are cross-platform enough for this Windows workspace.
3. Check aliases stay aligned across webpack, Vite, TypeScript, and ESLint expectations.
4. Check new tooling does not hide existing baseline failures.
5. Check generated outputs remain ignored when appropriate.
6. Check README or context docs need updates.

## Output Format

- `Status`: pass, fail, or blocked.
- `Tooling findings`: concrete config/script risks.
- `Checks run`: commands.
- `Follow-up`: cleanup or documentation needed.

