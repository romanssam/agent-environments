---
name: implement
description: Implement an authorized, scoped code or configuration change from the user request, a spec, or ready tickets; verify behavior and review the result.
---

# Implement

Use engineering-control for scope, global project state, and authorization. The user request is sufficient for a small task; for a large task read its spec and the current unblocked ticket. Record the initial Git/file baseline and completion criteria before editing.

Implement the smallest complete behavior following existing project patterns. Use tdd for behavior with a meaningful existing test seam, especially regression fixes. For documentation, skills, and configuration use structural and realistic behavioral checks instead of adding an unrelated test framework.

Run the relevant narrow checks after changes; broaden once where risk warrants it. Inspect the actual results. Fix new failures; report pre-existing failures with evidence.

Self-review small changes. Use code-review for a nontrivial completed change or an explicit review request, passing the task-start baseline (including new and uncommitted files) and the request/spec. For global files pass the saved backup and changed-file list.

Update the current checkpoint and completed-phase history, then report what changed and what passed. Commit only when the user requests a commit; use separate authorization for pushing, publishing, or deployment.
