---
name: to-spec
description: Turn an agreed large feature or multi-stage change into a concise implementation specification with acceptance criteria and verification boundaries.
---

# Write a specification

Use the current request, explored code, and resolved decisions. Read the configured tracker/domain pointers from the global profile described in engineering-control/references/project-state.md. A small local fix needs no standalone specification unless requested.

Write spec.md in the global task directory by default. Include the user problem and outcome, scope, observable acceptance criteria, affected contracts/invariants, key decisions, verification seams, exclusions, and unresolved blockers. Scale detail to the actual change; use user stories only where they clarify distinct behavior.

Prefer existing test seams and current project commands. Resolve consequential unknowns with the user; routine decisions inside an already authorized plan do not need another confirmation. Use verified source pointers where needed and mark time-sensitive file/branch references as observations.

Local publication means saving the artifact. An external tracker requires explicit authorization to publish. A spec with unresolved blocking decisions is needs-info; an agreed buildable spec is ready-for-agent. Continue authorized implementation or ticket decomposition after saving it.
