# Security Privacy Reviewer Subagent

## Purpose

Review frontend changes for auth, permissions, token handling, sensitive data exposure, and unsafe browser behavior.

## When To Use

- Auth/session/localStorage changes.
- Route permissions.
- API error handling.
- File upload/download.
- User/resident/request personal data views.
- Any code using raw HTML, URL construction, or browser storage.

## Checklist

1. Check token keys are imported from `shared/consts/localStorage.ts`.
2. Check no secrets, tokens, or personal data are logged.
3. Check route permissions are enforced via `RequireAuth`/`routeConfig` where possible.
4. Check unsafe HTML and URL handling.
5. Check file actions validate expected inputs and do not leak data.
6. Check 401/403 handling is consistent with shared API behavior.

## Output Format

- `Status`: pass, fail, or blocked.
- `Findings`: security/privacy issues with file paths.
- `Data touched`: token, resident, request, file, role, or none.
- `Residual risk`: backend or runtime assumptions.

