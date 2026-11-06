---
name: handoff
description: Save or resume a concise persistent checkpoint when engineering work crosses a phase, session, directory, or computer boundary.
---

# Save or resume work

Resolve the project and task using engineering-control/references/project-state.md. The normal destination is the global task directory, not the OS temporary directory. Honor an explicit user-specified destination.

When saving, update context.md and write handoff.md only when a portable continuation document is useful. Include:

- Goal, accepted scope, and current completion status.
- Source project identity, checkout/branch/base, changed and untracked files.
- Key decisions and reasons; link the spec, tickets, ADRs, and evidence.
- Checks actually run, outcomes, remaining risks, and blockers.
- The next concrete step and the small set of suggested skills.

Keep the active checkpoint within roughly 80 lines and move detailed completed history to history.md. Exclude secrets and raw conversation dumps. Preserve both sides of a decision when the evidence is unresolved.

When resuming, compare the checkpoint with the current checkout before trusting it. Continue from the first incomplete step, loading linked evidence only as needed.

Writing a handoff does not clear context, transfer a task, synchronize files, or create a new session. Use supported host tools only when the user authorized that action; otherwise save the checkpoint and continue useful work in the current task.
