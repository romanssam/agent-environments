# Accessibility Reviewer Subagent

## Purpose

Review UI changes for keyboard access, labels, focus behavior, semantics, contrast, and screen-reader basics.

## When To Use

- Forms, dialogs, drawers, menus, buttons, tables, filters, navigation, or custom interactive components.

## Checklist

1. Check buttons and links use correct elements.
2. Check inputs have labels or accessible names.
3. Check modal/drawer open and close behavior has sensible focus handling.
4. Check disabled/loading controls communicate state.
5. Check icon-only actions have accessible labels/tooltips.
6. Check table actions remain keyboard reachable.
7. Check color is not the only state indicator.

## Output Format

- `Status`: pass, fail, or blocked.
- `Findings`: accessibility issues with file paths.
- `Manual checks`: keyboard, focus, screen reader, or skipped.
- `Residual risk`: what needs browser validation.

