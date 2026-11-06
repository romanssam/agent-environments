---
name: sdd-quality-gate
description: Gate code work on a reviewed approach and explicit user approval, route grilling/design alternatives/prototypes as needed, then finish with independent spec, architecture, code and security reviews, Harness2, a learning table and a PR draft.
---

# SDD quality gate

Use this throughout engineering-control, starting before product code/config edits. Keep the agreed spec and approved approach authoritative. Reviewers advise; the user approves the approach, and the main agent owns implementation and fixes.

## Prepare once, before editing

Resolve the task checkpoint through engineering-control. Record the goal, acceptance criteria, spec path, baseline SHA, existing dirty files, and relevant contracts. Reuse an existing spec. The runner requires stable criterion IDs such as AC1, AC2; if the source has no IDs, use a task-local criteria document that references the original spec and accounts for every criterion. For a small request, clear acceptance criteria in the checkpoint are sufficient. Do not invent a formal SDD phase for a trivial edit.

For a Git checkout run:

```bash
node "${CODEX_HOME:-$HOME/.codex}/scripts/code-session-review/review.cjs" begin --spec "<absolute-spec-or-checkpoint-path>" --goal "<short factual goal>"
```

Omit `--spec` only when the work has no spec or acceptance-criteria document. Respect `CODEX_HOME` if set. The runner uses `CODEX_THREAD_ID`; outside Codex pass `--session <stable-task-id>` to every command. Run begin ONCE per task, before edits, and retain that baseline throughout fixes. Repeated begin retains an unfinished baseline. Use a distinct task session ID for separate concurrent tasks. It includes index, working files and untracked files, and archives dirty working files plus initial index/working patches. It separates unchanged pre-existing work from files changed by this task. Review the archived copies when attributing old edits inside a touched file.

If a task began without a baseline, reconstruct scope from saved task-start evidence and use native fresh-context reviewers. State that limitation. Never create a late baseline and call its empty comparison a successful review. For files outside Git, give native reviewers saved backups and an explicit changed-file manifest instead.

## Prepare and agree on the approach

Research source code, owners, callers and contracts first. Product source/config remains unchanged. Task-local plans, decision notes and review evidence may be written. Prepare a concise plan with the goal, scope, proposed design, affected modules, risks, verification and conditions that require replanning.

Select existing skills for the uncertainty actually present:

| Trigger | Skill and required result |
| --- | --- |
| Material assumptions or product decisions remain | `grilling`, or `grill-with-docs` when capturing decisions: ask the whole independent frontier in one numbered round, give a recommendation for each question, wait for answers, update the plan immediately. Obtain facts from code/agents; ask the user for decisions the sources cannot settle |
| Several viable module interfaces differ materially | `codebase-design` / `DESIGN-IT-TWICE.md`: independent proposals on the same constraints and usage/error scenarios, compare interface burden, responsibility, depth and locality, then recommend the simplest justified choice |
| A question needs observation rather than more discussion | `prototype`: separately agree on the question, small experiment and expected observation. Keep the throwaway prototype in the task directory, outside product source/config; carry the observed conclusion into the plan |
| Terms or consequential design trade-offs need recording | `domain-modeling`: define the resolved terms; use an ADR only when its real trade-off, reversal cost and future need justify it. Include material decisions in the plan/spec |
| The agreed feature needs a formal contract or independent stages | `to-spec`, then `to-tickets` where useful. Keep small changes small |

This gate overrides child-skill transitions that would automatically start implementation, alter product routes/scripts, commit or publish. Interview answers, a glossary/ADR, generated spec/tickets and a successful prototype do not authorize product implementation. Unresolved material questions keep the plan unready. A small clear fix needs a short plan and one independent reviewer; it does not require all conditional skills, three alternative designs or a prototype.

Run one independent fresh-context review of the concrete plan:

```bash
node "${CODEX_HOME:-$HOME/.codex}/scripts/code-session-review/review.cjs" plan --plan "<absolute-plan.md>"
```

Fix confirmed plan findings before asking the user. Show the reviewed version with its recommendation, risks and verification. **Wait for the user's explicit agreement to this approach before editing product code/config.** Research and task-local planning can continue while waiting. Silence, an interview answer, general understanding or a reviewer pass is not approval of the final plan. A later material decision changes that version and requires another review and approval.

After the real reply arrives, the main agent records the user's exact agreement and checks the gate:

```bash
node "${CODEX_HOME:-$HOME/.codex}/scripts/code-session-review/review.cjs" approve --approval-note "<actual explicit reply from the user>"
node "${CODEX_HOME:-$HOME/.codex}/scripts/code-session-review/review.cjs" check
```

Pass the same `--session` on every command when using an explicit task ID. The runner binds the record to the reviewed plan/spec and checks that code did not change between plan review and approval. It records a workflow authorization; it cannot independently authenticate a chat author. Only the main agent with the actual reply may record approval. A reviewer must never call approve, invent a reply or infer consent. The current user request to make a change does not substitute for the requested explicit approach checkpoint.

After approval, normal implementation and corrective edits within that approach can continue. A material change in behavior, contract, architecture or task scope returns to planning/review/approval. Editing plan/spec invalidates the old approval. Ordinary verification evidence updates do not invalidate approach approval, but still invalidate the final review. Replanning after partial implementation uses a new current planning snapshot and retains the original task baseline.

For global files outside Git, use the same sequence with a native independent plan reviewer, saved backups, an explicit changed-file manifest, and the user's actual response recorded in the checkpoint. Do not build a second tracking system just for those files. For already-started tasks, agree on the remaining approach before the next implementation edit; preserve existing work.

## Review the completed implementation

1. Finish the agreed tasks. Run checks appropriate to the actual changes. Save concise evidence in the task directory: exact commands, result, relevant output and skipped checks with reasons. Read commands from current manifests.
2. Freeze edits to this checkout during review. Give each reviewer the same goal, exact spec/criteria, baseline, changed-file manifest, existing dirty-work warning, relevant contracts and evidence. Each reviewer starts with a fresh context, without implementation conversation history or another reviewer's conclusions.
3. Launch four independent roles for SDD: spec, architect, reviewer and security. The script starts at most two processes concurrently, with four distinct contexts in total. For changes without a spec it runs architect, reviewer and security. Small edits can use one native fresh-context agent covering these lenses; still check all applicable concerns.

```bash
node "${CODEX_HOME:-$HOME/.codex}/scripts/code-session-review/review.cjs" review --spec "<absolute-spec-path>" --evidence "<absolute-validation-evidence-path>" --goal "<agreed goal>"
```

The script requires current approach approval before final review. It runs new `codex exec` processes in read-only mode and includes the approved plan in every review packet, also without a formal spec. It disables recursive hooks, delegation, apps, plugins and every server in the actual MCP inventory. An unsupported server key or inventory failure makes the review incomplete. Executables use absolute installed paths. Reports stay under `$CODEX_HOME/project-context/global-code-review/runs/`. Exit codes: 0 = success of the named command (plan still awaits user approval); 2 = changes requested; 3 = incomplete/error/stale/unapproved. Only a final review's pass records completed review. No-change output means no reviewers ran; it is not review evidence. The spec report has a validated matrix of expected criterion IDs, statuses and evidence; pass requires all criteria fulfilled.

The roles have disjoint primary responsibilities:

| Role | Required result |
| --- | --- |
| Spec | Account for every criterion with implementation and check evidence; find missing behavior and scope drift |
| Architect | Find concrete complexity, misplaced ownership, boundary errors and meaningful duplication; propose the smallest simplification |
| Reviewer | Find behavioral bugs, races, error-path regressions and missing meaningful verification |
| Security | Trace reachable risks at trust boundaries, permissions, secrets, HTML, URLs, files and external actions |

The spec reviewer may read unchanged modules and reference the spec itself for absent functionality. Missing required evidence is incomplete. Review findings require a reachable scenario or concrete maintenance cost, consequence and minimal fix. Optional style preferences are not blockers. A simple local solution is preferred when it meets the spec.

Add `--roles api,ui,performance` only for the corresponding risks. API changes need contract review. Visible behavior needs real UI/accessibility evidence where practical. Heavy rendering, data flow, loading and resource handling need performance review when relevant. Use native specialist agents for migrations/dependencies or real browser QA when the runner's source-only review cannot provide that evidence.

For native delegation use `fork_turns="none"` and send the bounded packet explicitly. Do not give reviewers the main conversation or tell them the desired verdict. Keep them read-only. Use available concurrency limits. No duplicate two-axis review is needed when these four roles already cover the same change.

## Resolve and recheck

Read every role's report. Keep verdicts by role. Combine duplicate findings for fixing, preserving their sources. Verify disputed claims against code, requirements or a focused probe; majority voting does not establish correctness. Record accepted findings and evidence-based dismissals concisely in the checkpoint.

Fix confirmed issues within authorized scope. Re-run affected checks and reviews. Any code/spec/evidence change invalidates the previous combined pass; the runner conservatively reruns all mandatory roles. Native targeted re-review is allowed when unchanged roles' evidence remains valid and that scope is recorded. Changes to a shared contract or acceptance behavior always revisit spec coverage.

After two unsuccessful correction rounds, diagnose the shared premise before another attempt. Stop automatic repetition, identify the remaining uncertainty and continue useful authorized work. A loop limit never turns an unresolved issue into pass. Ask the user only for a material decision that the sources cannot answer.

The Stop hook is a short backstop for tasks with a recorded baseline. It checks for an actual current pass including the approved approach. While awaiting user approval it yields with a reminder; it must not continue automatically into implementation. It does not launch four models after every question or intermediate checkpoint. Outside approval waiting, it requests one continuation at most and reports unverified review after that. For a user-requested pause, save pending work and say which gate remains incomplete. The instruction-driven review also works before hooks are trusted; do not bypass Codex's hook trust mechanism.

## Harness2 refinement

Apply the installed harness2 skill's Propose-Probe-Compose cycle within this same task checkpoint/history. Trigger a refinement when evidence shows a repeated error, failed premise, missing context or ineffective check. Propose one small change to the working approach, probe it against the same acceptance criteria, adopt only the supported benefit, and record the evidence plus applicability limit. Useful negative results count as lessons. A routine successful command is not proof of improvement.

Keep task lessons local. Changes to global instructions or shared skills need the user's corresponding authorization. Preserve behavior and keep the harness smaller when extra machinery provides no observed benefit. Never claim automatic recursive self-improvement, measured scores or benchmark gains without the corresponding evidence.

## Learning handoff and PR draft

Before final response, save concise task history and the project living context when required. Report the outcome and actual role/check verdicts. Include a learning table in Russian:

| Изменение | Что сделано и зачем | Трудность и решение | Средство и зачем оно нужно | Проверка и вывод |
| --- | --- | --- | --- | --- |

Use rows for material changes or decisions. Explain unfamiliar terms once. Distinguish implemented work, measured evidence, recommendations and unverified behavior. State the Harness2 lesson, or say no refinement was warranted. Link detailed artifacts instead of pasting logs.

Include a ready-to-copy PR title and description, or link the saved `pr.md` if long. Lead with the concrete problem and resulting behavior. Describe only the final change, meaningful checks and material limitations. Keep the learning discussion out of the PR body. If changes are only local configuration outside Git, label the text as a PR template for transferring that configuration; do not imply a PR exists. Writing a draft does not authorize creating a PR, committing, pushing or deploying.
