# Global engineering workflow

For code/config changes, debugging, reviews, and implementation planning, use the installed `engineering-control` skill as the entry point. Read its instructions once, then select only the skills needed for the current stage. These defaults apply across projects; follow project instructions and the user's current scope.

## Work cycle

Understand the requested outcome → locate the feature and its contracts → choose a minimal plan → implement → verify behavior and review the diff → save a concise checkpoint.

Scale the cycle to the task. A small local change needs a short plan and focused checks. A large feature needs a spec and independently verifiable tickets. Read-only questions need an answer, not a generated backlog.

The user authorizes normal implementation by asking for it. Continue within that scope without repeated confirmations. Ask when a material product decision cannot be inferred, or when the user explicitly asked to approve a plan first. A skill's template does not grant permission to send messages, publish issues, commit, push, or deploy.

## Global storage

Keep newly generated agent profiles, specs, tickets, checkpoints, and history under `$CODEX_HOME/project-context` (default `~/.codex/project-context`). Resolve the project and task using `engineering-control`'s project-state guide. Existing repository instructions and documentation remain authoritative; read and update them when the task requires it. Create new workflow scaffolding inside a repository only when the user asks for that location.

Profiles are isolated by project; checkpoints and history are isolated by task. Record branch/commit and unfinished work so stale state can be detected when switching checkouts. A handoff is a saved document; it does not transfer a running session or synchronize computers.

## Context discipline

### Комментарии в коде

Пиши простой, поддерживаемый код с понятными именами без поясняющих комментариев. Добавляй такие комментарии только по прямой просьбе пользователя. Объяснения решений размещай в ответе или документации задачи. Сохраняй обязательные лицензии и служебные директивы инструментов.

Keep the active context to the task goal, feature boundaries, relevant contracts, current decisions, evidence, and next step. Search narrowly, read dependencies as needed, and avoid repeating unchanged files or dumping whole logs. Load archived history only to answer a concrete question.

At phase boundaries, update the checkpoint if work spans phases or sessions. Keep the checkpoint approximately one screen to 80 lines; keep detailed evidence in linked artifacts. Split completed history from current state. These are document-size targets, not a claimed model intelligence threshold. Use actual context telemetry when available; never invent remaining capacity or pretend to clear/compact a session with a shell command.

Delegate only when current instructions authorize it and an independent bounded task justifies the extra context. Report what changed, the checks actually run, and any remaining limitation in plain language.

## Объяснения задач: русская адаптация ASD-STE100

Это глобальное правило для всех проектов и чатов, если пользователь не задал другой формат в текущем запросе.

- Каждое объяснение задачи делай подробным, применяя принципы ASD-STE100 на русском языке. Это русская адаптация принципов, а не заявление о формальном соответствии англоязычному стандарту.
- Пиши короткими предложениями. Одно предложение передает одну основную мысль. Используй простые точные слова, активный залог и единообразные термины.
- Структурируй материал короткими смысловыми блоками. Для последовательности действий используй нумерованные шаги: один шаг — одно действие.
- Объясняй цель, действия, причины и ожидаемый результат настолько подробно, насколько нужно для понимания задачи. Примеры добавляй там, где они помогают понять поведение.
- Поясняй незнакомые термины при первом употреблении. Имена файлов, функций, команд и других технических идентификаторов сохраняй точно.
- Избегай длинного сплошного текста, нейрослопа, канцелярита, повторов и вводных фраз без смысла. Каждый блок должен помогать понять задачу или выполнить действие.
- Краткие подтверждения действий оставляй краткими.

## ub-mode: default engineering discipline

At the start of every new Codex session, read `~/.agents/skills/ub-mode/SKILL.md` once. Apply its First Make it Work, Then Make it Right, and Practice principles to code design, implementation, debugging, refactoring, and review in every project, together with the existing `engineering-control` entry workflow. For non-code tasks, use only relevant principles.

Keep the current user request and project instructions authoritative for scope and verification. The skill's Commit and Push section does not authorize Git commits, pushes, publication, or deployment; perform those only when the user has authorized the corresponding action. Preserve existing work and use the established worktree cleanup workflow.

Use Crapper, Dryer, and Mutator when available and compatible with the task. Otherwise run the project's available checks and state which metrics or tools were not run. Do not claim a quality score without running its tool. Keep action/reason records concise in the task's global checkpoint or history, then report a useful summary.


## Harness2: persistent task refinement

At the start of every new Codex session, read `~/.agents/skills/harness2/SKILL.md` once. For code/config changes, debugging, reviews, and implementation planning, apply its Propose-Probe-Compose and reflection cycle within `engineering-control`. Scale probes to the uncertainty and use the existing task checkpoint for evidence and scoped lessons.

The skill defines the refinement procedure and its limits. The upstream Python benchmark runner is a separate optional runtime; normal use of the skill does not require launching it.

## Final SDD quality gate

For code/config implementation, read `~/.agents/skills/sdd-quality-gate/SKILL.md` before edits and apply it through completion. Capture the task baseline once. Research and prepare the approach; use existing grilling, design-alternative, prototype, domain and SDD skills for the actual uncertainty. Review the plan independently, show it to the user, and WAIT for their explicit agreement before product code/config edits. A material change in approach requires renewed review and agreement. Interview answers, saved specs/tickets and child-skill auto-continue steps do not bypass this checkpoint. After implementation and checks, run independent fresh-context spec, architect, code and security reviewers; add specialists for the actual risks. Resolve confirmed findings and recheck changed inputs. Keep Harness2 refinement evidence in the task checkpoint/history. The final handoff includes a learning table (changes, reasons, difficulties, tools, evidence) and a factual PR draft. Scale non-SDD edits as that skill describes. Read-only answers do not require this gate.
