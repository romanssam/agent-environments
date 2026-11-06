# Запуск Papermorph в Windows

Установленный скилл: `<WINDOWS_HOME>/.agents/skills/papermorph`.
Источник: https://github.com/DozenTwelve/Papermorph
Версия источника: `093418e1d23026f93fe2b12a7ea203dde5361455`.
Лицензия: MIT, файл `../LICENSE`.

Локальная адаптация добавляет русский интерфейс, шаблоны, озвучку, поддержку UTF-8 и общую библиотеку SQLite. Сохраняй эти изменения при обновлении upstream. `SKILL` в исходной справке означает абсолютную папку скилла.

## Подготовка сеанса PowerShell

```powershell
$PapermorphSkill = '<WINDOWS_HOME>\.agents\skills\papermorph'
$PapermorphPython = '<WINDOWS_HOME>\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
$env:PYTHONUTF8 = '1'
$env:Path = '<WINDOWS_HOME>\.codex\tools\papermorph\bin' + [IO.Path]::PathSeparator + $env:Path
```

Путь Python получен через `load_workspace_dependencies`. Если версия встроенного окружения изменилась, получи актуальный путь через этот инструмент. Используй `uv run --python $PapermorphPython`. Это обходит системный псевдоним Python из WindowsApps.

Зависимости загружаются через `uv` в общий кэш. Для PDF нужен `pymupdf`. Для озвучки нужны `edge-tts` и `ffprobe`. Для снимков нужны `playwright`, Chromium и `pillow`.

```powershell
uv run --python $PapermorphPython --with playwright python -X utf8 -m playwright install chromium
uv run --python $PapermorphPython --with pymupdf python -X utf8 "$PapermorphSkill/scripts/outline.py" 'books/my-book/book.pdf'
uv run --python $PapermorphPython --with edge-tts python -X utf8 "$PapermorphSkill/scripts/tts.py" 'content/my-book/ch01/narration.ru.json' 'site/my-book/ch01/audio/ru'
```

`ffprobe` установлен в `<WINDOWS_HOME>/.codex/tools/papermorph/bin`. Пакет FFmpeg и его лицензия сохраняются рядом в `ffmpeg-package`. Источник: https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip. Изменение `Path` выше действует только в текущем процессе.

Озвучка отправляет текст в Edge TTS и требует сети. При ошибке сохрани текст, повторно используй успешные аудиофрагменты и сообщи точный статус. Русский голос по умолчанию: `ru-RU-DmitryNeural`.

## Просмотр

```powershell
& $PapermorphPython -X utf8 -m http.server 8765 --bind 127.0.0.1 --directory 'site'
```

Открой `http://127.0.0.1:8765/my-book/`. Используй свободный порт. Для фонового процесса Windows используй `Start-Process -WindowStyle Hidden`.

## Проверки

Используй `shot.py` и `check_blank.py` по [review.md](review.md). В Windows задавай временную папку явно вместо `/tmp`.

```powershell
uv run --python $PapermorphPython --with playwright --with pillow python -X utf8 "$PapermorphSkill/scripts/shot.py" ch01 --url 'http://127.0.0.1:8765/my-book/' --out "$env:TEMP/papermorph-my-book"
uv run --python $PapermorphPython --with playwright python -X utf8 "$PapermorphSkill/scripts/check_blank.py" 'site/my-book' ch01 --url 'http://127.0.0.1:8765/my-book/'
```

`check_volume.py` проверяет громкость на явно указанной главе. Параметры смотри через `--help`. Это целевая проверка управления аудио.

## Ограничения

`split_pages.py` извлекает существующий текстовый слой PDF. Для сканов нужно отдельно подготовить распознанный текст. SQLite не синхронизирует браузерный прогресс и не отправляет материалы в облако.
