# Papermorph на macOS

Навык установлен в `~/.agents/skills/papermorph`.
Upstream: https://github.com/DozenTwelve/Papermorph
Revision: `093418e1d23026f93fe2b12a7ea203dde5361455`. Лицензия MIT: `../LICENSE`.
Сохраняй локальную русскую адаптацию, шаблоны, озвучку и SQLite-библиотеку при обновлении.

## Зависимости

Нужны рабочий Python 3.12+, uv и FFmpeg с ffprobe. Используй Python из `load_workspace_dependencies`, если этот инструмент доступен; иначе проверь `python3 --version`.
Не копируй окружение Windows. Через uv загружаются pymupdf, edge-tts, playwright и pillow по потребности.
Для браузерных снимков установи Chromium:

```bash
uv run --python 3.12 --with playwright python -m playwright install chromium
```

## Команды

```bash
PAPERMORPH_SKILL="$HOME/.agents/skills/papermorph"
uv run --python 3.12 --with pymupdf python "$PAPERMORPH_SKILL/scripts/outline.py" books/my-book/book.pdf
uv run --python 3.12 --with edge-tts python "$PAPERMORPH_SKILL/scripts/tts.py" content/my-book/ch01/narration.ru.json site/my-book/ch01/audio/ru
python3 "$PAPERMORPH_SKILL/scripts/library.py" init
python3 -m http.server 8765 --bind 127.0.0.1 --directory site
```

Открой http://127.0.0.1:8765/my-book/. Порт выбирай свободный.
Библиотека: PAPERMORPH_LIBRARY, затем CODEX_HOME/learning-library, затем ~/.codex/learning-library.
Переносятся инструменты библиотеки; личные книги и SQLite-база в этот пакет не входят.

Edge TTS отправляет текст внешнему сервису и требует сети. При недоступности сохрани текст и сообщи, что озвучка не готова.
Проверки shot.py, check_blank.py и check_volume.py запускай по references/review.md. Для снимков нужны playwright/Chromium и pillow.
Для Windows смотри runtime.windows.md; не выполняй PowerShell-примеры на Mac без адаптации.
