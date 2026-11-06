# Harness2: методика и отдельный runtime

Источник: https://github.com/google-research/harness2
Зафиксированный revision: `1cfe254e8d25b15f37048c3730134686abe60335`.
Пакет: `harness2==0.1.0`, Apache-2.0.

Навык Harness2 применяет Propose–Probe–Compose в обычной работе Codex. Для этого не нужен отдельный benchmark, API key или Python runner.

## Upstream benchmark

Официальный setup этой версии требует Linux. Не объявляй benchmark рабочим на macOS только из-за наличия Python или `fcntl`.
Используй отдельную Linux-среду. Не копируй Windows venv и бинарники.

```bash
uv tool install --from git+https://github.com/google-research/harness2@1cfe254e8d25b15f37048c3730134686abe60335 harness2
harness2-demo --output /absolute/task-artifacts/demo --k 2
```

Команды: `harness2`, `harness2-demo`, `harness2-check`, `harness2-setup`, `harness2-judge`, `harness2-report`, `harness2-bridge`.
Demo не запускался при подготовке этого пакета. README и docs/SETUP.md upstream являются контрактом конкретного эксперимента.
Runner не принимает произвольный frontend как готовый benchmark.

Для model-backed эксперимента сначала попроси пользователя выбрать executor/provider, дать доступ к endpoint, локально настроить credentials и согласовать бюджет.
Вход в Codex desktop не заменяет эту настройку. Платные вызовы запускай только по явному поручению.
