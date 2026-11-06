# Codex Project Rules

This file is the operating contract for Codex work in this repository.
Read it before every task, then update `CODEX_PROJECT_CONTEXT.md` after any code or config change.

## Project Snapshot

- App: React 18 + TypeScript 5 frontend.
- Architecture: Feature-Sliced Design with `app`, `pages`, `widgets`, `features`, `entities`, `shared`.
- State/data: Redux Toolkit, dynamic reducers, RTK Query, legacy axios thunk support.
- Styling: SCSS modules by default, global SCSS and CSS variables under `src/app/styles`.
- Build/dev: webpack is the production build path; Vite is present as an alternate dev server.
- Package manager: npm. Do not introduce yarn or pnpm lockfiles.

## Mandatory Work Loop

1. Read this file and `CODEX_PROJECT_CONTEXT.md`.
2. Inspect the nearest existing files before editing. Match local names, folders, props, API patterns, and styling.
3. Keep changes scoped to the requested behavior. Do not refactor unrelated code.
4. Prefer existing shared UI, hooks, selectors, API clients, constants, and helpers.
5. After edits, run the smallest meaningful verification set from the Verification section.
6. Review the diff yourself for style, FSD boundaries, API safety, UI states, and regressions.
7. Update `CODEX_PROJECT_CONTEXT.md` in the same turn with changed files, reason, checks run, and remaining risks.

## FSD Boundaries

- Use the existing layers: `app`, `pages`, `widgets`, `features`, `entities`, `shared`.
- New slices should follow local segment names such as `api`, `model`, `ui`, `lib`, `services`, `consts`.
- Cross-slice imports should go through public APIs (`index.ts`) where available.
- Use configured aliases for layer imports: `app`, `pages`, `widgets`, `features`, `entities`, `shared`.
- Use relative imports inside the same slice/folder when that is the local convention.
- Respect `eslint-plugin-romanssam-fsd-plugin/path-checker`; do not bypass FSD rules with deep imports unless existing local code already requires it.

## Components And Props

- Component folders and files are usually `PascalCase`; feature slice folders are often `camelCase`.
- Props are usually declared as `interface ComponentProps`.
- Export props only when they are part of a reusable public surface or generic component contract.
- Destructure `props` at the top of the component and assign defaults there.
- Many components use `memo`; follow nearby examples when adding display-only or frequently rerendered components.
- Use `FC<Props>` only when nearby code already does. Otherwise match the local component style.
- Keep event handlers as named `onX` callbacks and wrap with `useCallback` when passed down or used in hook dependencies.
- Use `useMemo` for derived collections or values when existing code in the area does so.

## Styling

- Prefer `Component.module.scss` next to `Component.tsx`, imported as `styles`.
- Keep component layout/state styling in modules; keep global tokens and resets in `src/app/styles`.
- Use `classnames` for conditional classes.
- Shared class helper types are in `src/shared/types/common.ts` (`Mods`, `Additional`) when a component already follows that style.
- Root classes often use the component name; nested classes often use BEM-like names such as `Block__element`.
- Use existing CSS variables before adding new colors, spacing, or typography constants.
- For MUI and Material React Table, use library props or `sx` for library-specific overrides, and SCSS modules for surrounding layout.

## State And Store

- Use `useAppDispatch` from `shared/lib/hooks/useAppDispatch`.
- Selectors are named like `getSomething` and live under `model/selectors`.
- Slices are named like `somethingSlice`; export `{ actions: somethingActions }` and `{ reducer: somethingReducer }`.
- Add dynamic reducers through existing `DynamicModuleLoader` when local feature state is only needed while a feature is mounted.
- Register global reducers only when state must exist for the whole app lifetime.

## API And Requests

- Main backend access should use RTK Query through `shared/api/rtkApi.ts`.
- Add domain endpoints via `rtkApi.injectEndpoints()` inside the owning slice `api/*Api.ts`.
- Type both endpoint args and responses. Put domain types in `model/types`.
- Do not create new axios or fetch clients for normal backend requests.
- Use `$api` from `shared/api/api.ts` only for existing thunk-style flows that need axios through thunk extra args.
- Base URL must come from global `__API__`; do not hardcode backend hosts inside features, widgets, or entities.
- Auth keys must come from `shared/consts/localStorage.ts`.
- Bearer token handling is centralized in `rtkApi.prepareHeaders` and `$api` interceptors.
- 401 handling is centralized in `shared/api/rtkApi.ts`; do not add local 401 reload/cleanup unless the task explicitly requires a different behavior.
- For mutations returning plain text/link/message, use RTK Query `responseHandler: response => response.text()`.
- Use `providesTags` and `invalidatesTags` for cache correctness. Add tag types with `enhanceEndpoints({ addTagTypes })` where needed.
- For short-lived modal data, follow existing `keepUnusedDataFor: 0` usage when cached reuse would be wrong.
- Use `.unwrap()` with `try/catch` for mutation flows that need user-facing success/error messages.
- React Query/TanStack Query is not used for server data in this project. Do not introduce it.

## Routing And Permissions

- Route-level access belongs in `RequireAuth` and `routeConfig` roles where possible.
- Avoid duplicating role checks in component bodies when the route config can express the permission.
- Use existing route constants and helpers from `shared/config/routeConfig`.

## Public APIs

- Each FSD slice should expose external exports through `index.ts`.
- Keep public APIs narrow: export components, types, selectors, actions, reducers, and API hooks that other slices actually use.
- Do not import from another slice's internal `ui`, `model`, or `api` path if its `index.ts` already exports the needed symbol.

## Commits And Merge Requests

- Commit messages should follow this format: `FA-2194: Fix/Add/Feature - краткое описание`.
- Use the ticket key from the current branch or task.
- Choose `Fix`, `Add`, or `Feature` based on the actual change context.
- At the end of delivery work, provide a separate merge request summary in this format:

```text
[Краткое описание задачи в 1-2 предложениях. Связь с ticket.]

- [Действие]: [Описание изменения в компоненте/хоке/стили/и т.д.]. [Почему: влияние на app, e.g., улучшение perf].
- [Действие]: [Детали по FSD-слою, e.g., добавление в shared/ui].
- [Действие]: [Упоминание типов/errors, e.g., custom error type].
- [Действие]: [Фиксы/рефакторинг, e.g., замена inline styles на modular SCSS].
- [Действие]: [Тесты/проверки, e.g., добавлены unit-тесты для hook].

[Опционально: Влияние на другие части, e.g., обновить docs или dependencies.]
```

## Verification

Known baseline:

- `npm run lint` is not a green repository-wide gate at this snapshot; it fails on existing errors.
- `npx tsc --noEmit` fails in dependency declarations unless `--skipLibCheck` is used.
- No active unit, UI, Storybook, Playwright, or Cypress test files/configs were found.
- `npm run build` writes ignored `build/`.
- `build:*` and `start:dev` scripts may fetch remote branding and rewrite ignored `config/branding/branding.json`.

Fast loop after code changes:

1. Run `npx tsc --noEmit --skipLibCheck`.
2. Run `npx eslint <changed TS/TSX/JS files>` for touched source/config files.
3. Run `npx jest --passWithNoTests --runInBand` only as a smoke check until real tests exist.
4. Run `npm run build` when changes affect startup, routing, Redux/RTK Query, webpack config, assets, global styles, or broad shared UI.
5. For visual UI changes, start the app and inspect the changed screen in the browser. Prefer the Browser Use plugin when available.

## Subagent Roles

Use these roles when the user explicitly allows or asks for delegated/parallel work:

- Frontend tester: `.codex/subagents/frontend-tester.md`
- UI tester: `.codex/subagents/ui-tester.md`
- API tester: `.codex/subagents/api-tester.md`
- Code quality auditor: `.codex/subagents/code-quality-auditor.md`
- Code reviewer: `.codex/subagents/code-reviewer.md`
- Architecture governor: `.codex/subagents/architecture-governor.md`
- Security/privacy reviewer: `.codex/subagents/security-privacy-reviewer.md`
- Performance auditor: `.codex/subagents/performance-auditor.md`
- Accessibility reviewer: `.codex/subagents/accessibility-reviewer.md`
- Observability diagnostics reviewer: `.codex/subagents/observability-diagnostics-reviewer.md`
- DX tooling maintainer: `.codex/subagents/dx-tooling-maintainer.md`
- Release manager: `.codex/subagents/release-manager.md`

Subagents do not replace local responsibility. The main agent must integrate results and make the final decision.

## Recommended Skills

- Use `browser-use:browser` for local browser navigation, UI inspection, and screenshots of localhost/file targets.
- Use `imagegen` only when a task needs generated bitmap assets.
- Use `spreadsheets`, `documents`, or `presentations` only for those file types.
- Project skill playbooks live in `.codex/skills`:
  - `fsd-feature-delivery`: default workflow for React/TypeScript FSD changes.
  - `rtk-query-api-change`: API, RTK Query, cache, auth, and mutation changes.
  - `ui-regression-pass`: visual and interaction QA for changed UI.
  - `performance-budget-pass`: render, data, asset, dependency, and bundle risk review.
  - `release-readiness-pass`: final delivery, risk, and verification checklist.
- These project skills are local playbooks for this repository. If they need to become globally auto-discoverable Codex skills, copy or install them into the configured Codex skills directory.

## Important Files

- `package.json`: scripts and dependencies.
- `eslint.config.mjs`: lint rules and FSD path checker.
- `tsconfig.json`: strict TypeScript config and path mapping.
- `webpack.config.ts`, `config/build/*`: production build setup.
- `vite.config.ts`: alternate dev setup and aliases.
- `src/shared/api/rtkApi.ts`: RTK Query base API.
- `src/shared/api/api.ts`: axios instance for thunk extra args.
- `src/app/providers/StoreProvider/config/store.ts`: store, middleware, dynamic reducer manager.
- `src/shared/config/routeConfig.tsx`: routes and route permissions.
- `src/shared/ui`: reusable UI components.
- `json-server/db.json`: local mock data source.
