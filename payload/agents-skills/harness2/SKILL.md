---
name: harness2
description: Apply Harness2 Propose-Probe-Compose and evidence-based reflection within engineering-control for implementation, debugging, reviews, and implementation planning across projects.
---

# Harness2

This is a local Codex adaptation of [Google Research Harness2](https://github.com/google-research/harness2), not an upstream skill or a replacement for the Codex runtime. It refines the way a task is executed. The requested product behavior and project contracts remain the acceptance criteria.

## Apply within the existing work cycle

Use engineering-control as the entry point and the appropriate implementation or review skill for the actual work. Integrate the following cycle into that work; reuse its checks and checkpoint rather than creating a second workflow.

1. **Establish the baseline.** Identify the requested result, the current execution approach, and the uncertainty or failure to resolve. Read only applicable instructions and relevant task/project lessons. Record enough input and environment information to compare outcomes. In planning or review, the baseline can be an inspected contract or demonstrated failure; label unexecuted hypotheses explicitly.
2. **Propose.** When a concrete uncertainty warrants refinement, propose a small change to the task's execution approach: context selection, tool guidance, verification, a reusable script, or task-local instructions. Separate generally applicable changes from domain-specific ones when that distinction matters. State the expected observable benefit. Keep candidate guidance task-local while it is unproven.
3. **Probe.** Exercise the candidate against the same task inputs and acceptance criteria. Capture actual outputs, failures, and relevant execution evidence. Use focused tests, fixtures, dry runs, or isolated files for repeatable comparisons. Reuse a valid earlier observation when rerunning would add no information. Record an unavailable probe as unverified, not successful.
4. **Compose.** Adopt the useful parts supported by the observed contrast. Check combined changes when their interaction could affect the result. Retain the baseline when a candidate does not help. Continue the user's task with the adopted approach until its acceptance criteria are met or a real blocker is documented.
5. **Reflect.** Save a concise lesson only when evidence supports it: triggering cue, adopted change, observed benefit or failure, evidence pointer, confidence, and applicability limits. Save useful negative results too. A selected candidate or completed command alone does not establish correctness.

## Scale the effort

- For an obvious small edit, use one direct implementation and its normal focused verification. Extra candidates and repeated executions need a concrete unresolved question.
- Prefer sequential refinement. Parallel candidates require authorized delegation and independent state. This skill does not itself authorize agents, nested model sessions, paid benchmark calls, or external actions.
- Stop refining the approach when it answers the question or further probes offer little value. This stops experimentation, not the original authorized task.
- Repeat side-effecting actions only when their existing authorization and repeatability permit it. Prefer an isolated probe for deployment, production mutation, publication, or destructive operations.

## Retain evidence without broadening rules

Resolve task storage through engineering-control's project-state guide. Put the current adopted approach in the task's `context.md`; append material comparisons and lessons to its `history.md`, with links to detailed artifacts. Existing project documentation requirements still apply.

Retrieve lessons by their project/domain, triggering cue, and current evidence. Check for branch, contract, tool, or environment drift before reusing them. Keep a task-specific lesson scoped to that task until wider applicability is demonstrated. Change global instructions or shared skills only when the user authorizes that change. Leave generated Codex memory files untouched.

Report the delivered result, actual checks, and remaining limits. Claim a score, speedup, or quality improvement only when it was measured with a suitable method.

## Upstream runtime

For source provenance, installed commands, or running the Python framework, read [references/runtime.md](references/runtime.md). Ordinary use of this skill needs no model credentials and does not start the upstream benchmark runner.
