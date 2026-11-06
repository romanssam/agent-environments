---
name: engineering-control
description: Default workflow for code/config changes, debugging, reviews, and implementation planning. Scope the feature, route to relevant skills, verify behavior, and maintain global project/task context.
---

# Engineering Control

## Start and scope

1. Inspect Git status where applicable, applicable instructions, and nearby files. Preserve pre-existing changes. For global configuration, record a file backup instead of assuming a Git baseline.
2. State the requested outcome, the smallest implementation path, and relevant risks briefly. Proceed within existing authorization; ask only for unresolved consequential choices or an explicit analysis-first gate.
3. Locate the behavior owner, callers, input/output contracts, state effects, and verification seam. Stop broad exploration once these are known. Trace additional consumers when a shared contract changes.
4. For multi-step implementation or continuation, read [project-state.md](references/project-state.md), resolve the global profile/task, and read only its current checkpoint and relevant source pointers. Create missing state lazily. The profile provides the tracker, labels, and domain layout expected by other skills.

## Select the next skill

Read only the selected skill's SKILL.md; locating a skill on disk is sufficient when a Skill tool is unavailable. Use the available catalog and the installed global skill directory. If a required skill is unavailable, explain the missing capability and continue useful independent work.

| Situation | Route |
| --- | --- |
| Unclear which workflow fits | ask-matt |
| Missing project workflow profile | setup-matt-pocock-skills |
| Important unresolved product decisions | grill-with-docs; ask only questions the code cannot answer |
| Large feature spanning independent stages | to-spec, then to-tickets |
| Concrete authorized implementation | implement |
| Reproducible bug or regression | diagnosing-bugs |
| Huge effort with unresolved architecture | wayfinder, then spec/tickets when decisions are resolved |
| Incoming unsorted reports | triage |
| Changed behavior needing automated regression coverage | tdd when an appropriate test seam exists |
| Nontrivial completed implementation or requested review | code-review |
| Continuing elsewhere or saving a phase boundary | handoff |

Use domain-modeling for domain terms, codebase-design for module interfaces, and focused project review skills for the surface actually affected. Other installed skills remain available for their matching tasks. A small fix can go directly through implement with a short plan; specifications, tickets, interviews, and independent reviews are not mandatory paperwork for every edit.

## Implement and verify

Match existing architecture, public APIs, typing, and local style. Keep changes coherent and local; introduce dependencies or abstractions only for a demonstrated need. Keep TypeScript sound rather than bypassing checks.

Use the repository's real validation commands and inspect their outcomes. Start narrowly, then broaden for shared APIs, state, routing, build changes, or an unresolved risk. Use browser checks for UI behavior when practical. A test runner is not a prerequisite for documentation/configuration work: use executable validation of the changed behavior. Distinguish baseline failures from new regressions. Repeat checks after relevant changes, not merely to repeat evidence.

Review the actual change including new files against the request and local standards. For work outside Git, use the saved before/after file set. Record actual outcomes and unverified areas. Commits, pushes, external issue publication, messages, and deployments require the user's corresponding authorization; a skill does not add it.

## Finish or continue

Keep the task checkpoint concise: goal, scope, decisions, branch/base, touched paths, validation, blockers, next action. Store detailed completed history separately and link it. Follow existing repository memory requirements when editing its code, but keep new agent scaffolding global by default. Never claim a checkpoint also synchronized source code or chat history.

Use actual telemetry if available; no fixed token count guarantees reasoning quality. At a meaningful phase boundary save state before a supported context transition. Continue authorized work without inventing clear/compact commands or creating a new user-visible task unless requested.
