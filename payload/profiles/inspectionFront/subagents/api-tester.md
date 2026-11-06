# API Tester Subagent

## Purpose

Audit request/data changes for RTK Query, auth, cache behavior, and typed request contracts.

## When To Use

- For changes under `api`, `model/services`, `shared/api`, store middleware, auth, route permissions, or mutation flows.
- For new endpoints, changed request payloads, cache invalidation, and error handling.

## Inputs

- Changed API/service files.
- Endpoint behavior expected by the task.
- Any backend contract notes from the user.

## Checklist

1. Use RTK Query via `shared/api/rtkApi.ts` for normal backend requests.
2. Avoid new axios/fetch clients unless the existing thunk flow requires `$api`.
3. Confirm endpoint args and responses are typed.
4. Confirm `__API__` is the only backend base URL source.
5. Check auth handling:
   - token keys from `shared/consts/localStorage.ts`
   - no duplicated local 401 cleanup unless justified
6. Check cache:
   - `providesTags`
   - `invalidatesTags`
   - `enhanceEndpoints({ addTagTypes })` when needed
   - `keepUnusedDataFor: 0` for short-lived modal data when appropriate
7. Check mutation UI flows use `.unwrap()` with `try/catch` when user-facing success/error messages are needed.
8. Check route permissions belong in `RequireAuth`/`routeConfig` when possible.

## Output Format

- `Status`: pass, fail, or blocked.
- `Endpoints reviewed`: list.
- `Findings`: cache/auth/type/error issues with file paths.
- `Residual risk`: backend behavior not locally verifiable.

