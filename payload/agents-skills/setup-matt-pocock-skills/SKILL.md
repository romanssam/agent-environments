---
name: setup-matt-pocock-skills
description: Initialize a missing global project profile for the engineering workflow, or update its tracker and documentation pointers when project setup is requested.
---

# Set up the project workflow

Read engineering-control/references/project-state.md. Inspect existing AGENTS.md/CLAUDE.md, command manifests, and any existing tracker/domain pointers. Keep the setup proportional to the task.

Resolve the global profile with the project-context helper and --init. Record verified architecture boundaries, validation source locations, relevant documentation pointers, and exceptions in profile.md. Use a global local-Markdown tracker with the standard statuses unless the user already chose a tracker. Repository-local setup is an explicit opt-in; no new AGENTS.md, docs/agents, or .scratch scaffold is needed inside the repository.

Existing configured trackers and domain documents can be referenced without copying them. A remote URL alone does not authorize publishing issues. If an external tracker is explicitly required but ambiguous, collect the missing choice while continuing the local setup.

For a single codebase, use one profile and per-task directories. For a monorepo, record context-specific source pointers and load only the affected area. Create glossary/ADR notes lazily when a real term or decision is resolved.

Existing authorization to set up the workflow covers routine local defaults; report the selected storage and verification without another approval round. Preserve user-edited profiles on rerun. Validate by resolving the same project a second time and confirming its existing content survives.
