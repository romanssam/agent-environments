# Global project state

Use this guide when starting implementation that needs persistent state, resuming work, or setting up a project. Reading a skill or answering a small question does not require creating state.

## Resolve and initialize

Run the bundled helper with Node.js, using the absolute path of this skill:

```text
node <engineering-control>/scripts/project-context.mjs --project <working-directory>
```

The read-only result names the project profile and storage directory. Add `--init` to create a missing profile and `--task <short-kebab-case-name>` to resolve a task; combine them to create its checkpoint. Reuse the task name when continuing it. Use distinct task names for concurrent work.

The helper uses a sanitized Git origin identity, shared across HTTPS/SSH clones, and otherwise the canonical local Git directory or project path. It stores no remote credentials. Without a shared remote, profiles are machine/path-specific. `CODEX_HOME` controls the storage root; `--state-root` exists for isolated validation.

## Profile

Read `profile.md`, then only the sources relevant to the task. Populate it from actual project evidence: architecture boundaries, instruction/document pointers, commands or command-source locations, and known exceptions. Check commands against current package/build files before running them. Record task-time Git status separately from stable project facts.

Existing repository tracker/domain configuration can be referenced here. For new workflow state the default is global local Markdown:

- `<task>/spec.md`: scoped outcome, acceptance criteria, contracts, verification, exclusions.
- `<task>/issues/NN-slug.md`: one independently verifiable ticket, status, blockers, acceptance criteria.
- `<task>/context.md`: goal, scope, branch/base, decisions, changed files, verification, blockers, next step.
- `<task>/history.md`: dated completed phases and evidence pointers; append, never load in full by default.
- `<task>/handoff.md`: portable continuation instructions when requested or needed at a phase boundary.
- `<task>/map.md`: wayfinder decision index; child decisions use the issues directory.

Tracker statuses: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`, then `in-progress` and `done` for execution. A resolved wayfinder decision is `resolved`. Read blockers before starting a ticket. Record concrete user questions as blockers without treating elapsed time as an answer.

This profile supplies the tracker, label vocabulary, and domain layout that Matt Pocock skills expect. They do not require new `docs/agents/` or `.scratch/` files in the repository. Interpret their local-tracker paths relative to the resolved global task directory. Read existing domain glossaries/ADRs from project pointers; create new agent-only glossary/decision files in the profile's `domain/` directory unless repository rules or the user require another location. Create them only for real resolved concepts/decisions.

## Wayfinding operations

When using wayfinder or a legacy local tracker reference, replace the entire `.scratch/<feature-or-effort>/` prefix with the resolved global task directory. This is a replacement, not a nested directory to append.

- Map: `<task>/map.md`; decisions: `<task>/issues/NN-slug.md`, numbered from 01.
- Each decision records `Type: research|prototype|grilling|task`, `Status: open|claimed|resolved`, and `Blocked by: NN, NN` (or None).
- Frontier: read open, unclaimed decisions whose blockers are resolved; select the first by number.
- Claim: save `Status: claimed` before beginning; preserve an existing claim owned by another task/agent.
- Resolve: append the decision under `## Answer`, set `Status: resolved`, and add a short link under the map's Decisions so far. For an incomplete investigation record evidence and the blocker; do not mark it resolved.
- Comments: append under `## Comments` in that issue. A completed decision feeds the spec; implementation tickets retain the execution statuses above.
- Triage rejection records: `<profile>/out-of-scope/`, one record per rejected concept; read existing repository records as evidence, but write new agent records globally.

## Resume and checkpoint

Before relying on a checkpoint, compare its branch/base and changed-file claims with the actual checkout. Keep decisions and reasons concise; link specs, diffs, logs, and existing docs instead of copying them. Save only verified facts; distinguish historic checks from checks run now. Update context after meaningful phases and at task completion; append detailed history separately. Never store secrets or full raw conversation dumps.

Global files remain local to this computer until a separate synchronization setup is completed. Checkpoints improve continuation but do not replace Git commits or backups of source files.
