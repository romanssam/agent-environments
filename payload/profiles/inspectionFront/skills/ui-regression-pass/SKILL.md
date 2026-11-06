---
name: ui-regression-pass
description: Project workflow for validating changed React UI screens and components. Use for layout, responsive behavior, SCSS modules, MUI/Material React Table changes, modals, drawers, forms, loading/empty/error states, and visual browser inspection.
---

# UI Regression Pass

## Workflow

1. Read changed component and adjacent `*.module.scss`.
2. Identify affected route, widget, or reusable component.
3. Check desktop and mobile behavior conceptually, then in browser when a local URL is available.
4. Verify required states:
   - loading
   - empty data
   - validation error
   - disabled/submitting
   - permission/no-access if relevant
5. Confirm styling follows local SCSS module and MUI patterns.
6. Run scoped ESLint for changed TS/TSX/JS files and build for broad shared UI/layout changes.

## Guardrails

- Do not add global styles for local component behavior.
- Do not introduce a new UI kit for one component.
- Avoid hardcoded dimensions unless the component needs stable layout.
- Watch for overflow, overlapping controls, inaccessible buttons, and missing mobile affordances.

## Output Expectations

- Screens/components checked.
- States covered.
- Browser/device coverage or reason it was skipped.
- Concrete UI risks.

