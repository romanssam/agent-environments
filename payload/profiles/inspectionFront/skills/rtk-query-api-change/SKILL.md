---
name: rtk-query-api-change
description: Project workflow for adding or modifying backend data flows using RTK Query. Use for new endpoints, mutations, cache tags, auth-sensitive requests, response typing, thunk-to-RTK migration, API error handling, or request contract changes.
---

# RTK Query API Change

## Workflow

1. Read `src/shared/api/rtkApi.ts`, the owning slice `api/*Api.ts`, and nearby `model/types`.
2. Add or update endpoints through `rtkApi.injectEndpoints()`.
3. Type both request args and response payloads.
4. Use `__API__` indirectly through the shared base API only.
5. Add `providesTags` and `invalidatesTags` for cache correctness.
6. Use `responseHandler: response => response.text()` for plain text/link/message responses.
7. Use `.unwrap()` with `try/catch` in UI flows that show success/error messages.
8. Verify with TypeScript and scoped ESLint. Build when store, auth, routing, or global API behavior changes.

## Guardrails

- Do not create new axios or fetch clients for normal backend requests.
- Use `$api` only for existing thunk-style flows that rely on thunk extra args.
- Keep token keys in `shared/consts/localStorage.ts`.
- Do not duplicate 401 cleanup/reload outside `shared/api/rtkApi.ts` without a concrete requirement.
- Keep endpoint hooks exported from the owning API file or slice public API.

## Review Questions

- Does cache invalidation update every affected screen?
- Does the mutation handle backend validation errors?
- Is modal-only data safe to cache, or should `keepUnusedDataFor: 0` be used?
- Is the endpoint in the correct FSD owner?

