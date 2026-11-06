# The book: static folder, cover and contents

The book is static: HTML, JS, CSS, MP3. Reading progress lives in the browser (`localStorage`). The shared learning library stores the catalogue, content and material versions separately in SQLite; register every prepared output using [library.md](library.md). The runnable output is `site/<book>/`; source material and production notes stay outside it.

## Start a book folder

Set `SKILL` to the installed skill folder. Run once for a new slug; use an existing book's actual files when resuming:

Prepare the PowerShell variables from [runtime.md](runtime.md) first.

```powershell
$PapermorphBook = 'my-book'
$PapermorphSite = "site/$PapermorphBook"
$PapermorphWork = "books/$PapermorphBook"
New-Item -ItemType Directory -Force -Path "$PapermorphSite/lib", "$PapermorphSite/reader", "$PapermorphSite/ch01", "$PapermorphWork/chapters", "content/$PapermorphBook/ch01", "tools/$PapermorphBook" | Out-Null
Copy-Item -LiteralPath "$PapermorphSkill/assets/engine/engine.js", "$PapermorphSkill/assets/engine/engine.css", "$PapermorphSkill/assets/engine/light.css" -Destination "$PapermorphSite/lib/"
Copy-Item -LiteralPath "$PapermorphSkill/assets/reader/reader.css", "$PapermorphSkill/assets/reader/reader.js" -Destination "$PapermorphSite/reader/"
Copy-Item -LiteralPath "$PapermorphSkill/assets/templates/book.html" -Destination "$PapermorphSite/index.html"
Copy-Item -LiteralPath "$PapermorphSkill/assets/templates/reader.html" -Destination "$PapermorphSite/read.html"
Copy-Item -LiteralPath "$PapermorphSkill/assets/templates/unit-art.js" -Destination "$PapermorphSite/unit-art.js"
Copy-Item -LiteralPath "$PapermorphSkill/assets/templates/chapter.html" -Destination "$PapermorphSite/ch01/index.html"
Copy-Item -LiteralPath "$PapermorphSkill/assets/templates/narration.ru.json" -Destination "content/$PapermorphBook/ch01/narration.ru.json"
Copy-Item -LiteralPath "$PapermorphSkill/assets/templates/BOOK.md" -Destination "$PapermorphWork/BOOK.md"
```

Default language is Russian: `narration.ru.json`, `audio/ru/timings.js`, `CHAPTER.language = 'ru'`, and Russian visible UI and narration. The local templates are already translated. Preserve these defaults unless the user explicitly requests another language.

Use the light theme for every surface. The book and chapter templates load `light.css` after their original styles. Keep this loading order in generated files, including after local style blocks. The stylesheet also maps the original SVG palette to readable colours on a light background. For new custom SVG colours, check labels and semantic colours on the actual light surface.

Build `read.html` using [reader.md](reader.md). It is the primary learning entry from the cover. A lesson is complete when this page teaches the topic independently and its interactions work; its text is also stored under `text/` for library search.

Each book has its own engine, source materials, narration and optional tests. The engine and cover derive the same progress key from the book's URL folder. Keep existing books on their current paths; their legacy progress remains intact.

A chapter returns to its book's index. Preserve cover → contents → chapter navigation and the return from contents to cover. Add cover → interactive text lesson and a visible link back from that lesson. The book opens directly at `/<book>/`; it needs no parent index page. Keep existing books' navigation when editing them.

## Cover and contents (`index.html`)

One page: no hash or `#book` shows the cover, `#contents` or `#chNN` the contents; a lesson's home button returns to `#chNN`, and the card grows into the lesson frame through a view transition.

- Edit the title, kicker, lede, the faint chalk phrases on the cover (a few formulas or lines from the book), and the `<title>`.
- Set the main learning action to `read.html`. Keep a separate labelled action for animated lessons with narration and their contents.
- `UNITS`: `[unit title, [[chapter title, minutes], …]]`; chapters are numbered in order. Add a chapter when its lesson is ready; also set the previous chapter's `CHAPTER.next = '../chNN/'`.
- `HUES`: one colour per unit, cycling.

## Unit sketches (`unit-art.js`)

Give each unit a small sketch of its own ideas, drawn in the unit colour, with one gentle topic-related loop. Use the agreed asset approach. Keep the left third light for the title on phones; check the finished contents at 1440 px and 390 px once. The template handles reduced motion; classes and loop examples are in `unit-art.js` and the `.unit-art` CSS.

## Guide character

Keep the existing infinity guide by default. For an agreed custom guide, adapt `mascotEl` and the cover drawing together, retaining blink, happy hop and wrong-answer tilt states.

## Local preview and delivery

Serve the static output over HTTP for audio playback:

```powershell
& $PapermorphPython -X utf8 -m http.server 8765 --bind 127.0.0.1 --directory 'site'
```

Open `http://localhost:8765/<book>/`. Confirm the cover opens the text lesson, the narration action opens contents, ready chapter links load their lessons, and lessons return to the book's contents. Register `site/<book>/` using [library.md](library.md), then confirm the saved entry with `show`. Deliver its saved path with its HTML, scripts, styles and audio, the preview command and entry URL, available chapter count and unresolved issues. Source PDFs, extracted pages, narration drafts and development environments are not part of the static book.

## Languages

Narration and on-screen text are written in Russian by default. Add another language only at the user's explicit request. A second language comes after the book is done and approved: keep beat ids and question ids stable, add `narration.<lang>.json` and audio per language, and decide with the user how switching behaves mid-lesson before building it.
