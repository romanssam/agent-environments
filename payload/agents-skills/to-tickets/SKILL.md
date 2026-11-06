---
name: to-tickets
description: Split an agreed large specification into independently verifiable implementation tickets with explicit blockers, suitable for separate work sessions.
---

# Decompose implementation work

Read the agreed specification and the global project tracker configuration from engineering-control/references/project-state.md. Skip decomposition when a change fits one coherent implementation step.

Create one file per ticket at <global-task>/issues/NN-slug.md. Each ticket records the outcome, acceptance criteria, scope/contracts, verification, relevant source pointers, Status, and Blocked by. A ticket should be understandable from its spec and pointers without importing the entire prior conversation.

Use narrow complete behaviors rather than splitting solely by technical layer. For broad mechanical migrations, use expand → migrate → contract where individual steps can be checked. Make blockers explicit and begin only when they are done.

Present the breakdown briefly. If the user already authorized the work and the boundaries follow the agreed scope, save and proceed. Ask when granularity changes delivery scope or an important dependency is unresolved. Keep external tracker publication within explicit authorization; the default tracker is global local Markdown.

Set ready-for-agent initially, in-progress while executing, and done only after acceptance checks. Preserve parent issues and user-authored ticket changes. At ticket boundaries save a checkpoint; a ticket does not automatically create a new Codex task or clear context.
