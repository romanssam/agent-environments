"""Создать озвучку и временные метки слов через Edge TTS.

Запуск из папки книги; SKILL — путь к установленному навыку:
    uv run --with edge-tts $SKILL/scripts/tts.py content/ch01/narration.ru.json site/ch01/audio/ru

Требуются доступ к сети и ffprobe из FFmpeg для определения длины клипов.

Метка [[mark]] стоит перед нужным словом в тексте озвучки. Файл timings.js
содержит длину клипа, начало каждого отмеченного слова в секундах и субтитры
по предложениям. Анимация может появиться вместе с отмеченным словом.
Скрипт пересоздаёт клипы, если изменились текст, голос или скорость.
Временные метки слов сохраняются в кеше. Изменение меток и субтитров
не требует повторного синтеза звука. Голос по умолчанию: ru-RU-DmitryNeural.
"""

import asyncio
import hashlib
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

import edge_tts

MARK = re.compile(r"\[\[(\w+)\]\]")


async def synth(text, voice, rate, mp3_path):
    words = []  # (seconds, word)
    comm = edge_tts.Communicate(text, voice, rate=rate, boundary="WordBoundary")
    with open(mp3_path, "wb") as f:
        async for chunk in comm.stream():
            if chunk["type"] == "audio":
                f.write(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                words.append((chunk["offset"] / 1e7, chunk["text"]))
    return words


def split_marks(raw):
    """Return clean text and {mark: char position in clean text}."""
    marks, clean, pos = {}, [], 0
    # MARK.split alternates text, name, text, name, ...
    for i, part in enumerate(MARK.split(raw)):
        if i % 2:
            if part in marks:
                raise ValueError(f"повторная метка {part!r} в одном шаге")
            marks[part] = pos
        else:
            clean.append(part)
            pos += len(part)
    return "".join(clean), marks


def time_at(clean, words):
    """Return f(pos): start time of the first spoken word at or after char pos."""
    cursor, located = 0, []
    for t, w in words:
        i = clean.find(w, cursor)
        if i < 0:
            continue
        located.append((i, t))
        cursor = i + len(w)
    return lambda pos: next((round(t, 3) for i, t in located if i >= pos), None)


def mark_times(clean, marks, words):
    at, out = time_at(clean, words), {}
    for name, pos in marks.items():
        out[name] = at(pos)
        if out[name] is None:
            raise SystemExit(f"метка {name!r} не сопоставлена с произнесённым словом")
    return out


def caption_cues(clean, words):
    """One cue per sentence: [start seconds, sentence]."""
    at, cues, start = time_at(clean, words), [], 0
    for m in list(re.finditer(r"[.?!]\s+", clean)) + [None]:
        end = m.end() if m else len(clean)
        text = clean[start:end].strip()
        if text:
            cues.append([at(start) or 0, text])
        start = end
    return cues


def duration(mp3):
    r = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(mp3)],
        capture_output=True, text=True, check=True)
    return round(float(r.stdout), 3)


def write_atomic(path, text):
    """Replace output only after its complete contents have been written."""
    with tempfile.NamedTemporaryFile(dir=path.parent, prefix=f".{path.name}-", delete=False) as f:
        tmp = Path(f.name)
    try:
        tmp.write_text(text, encoding="utf-8")
        tmp.replace(path)
    finally:
        tmp.unlink(missing_ok=True)


async def main(src, out_dir):
    spec = json.loads(Path(src).read_text(encoding="utf-8-sig"))
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    cache_path = Path(src).with_suffix(".timings.json")  # build cache, kept out of the site
    cache = json.loads(cache_path.read_text(encoding="utf-8-sig")) if cache_path.exists() else {}
    voice, rate = spec.get("voice", "ru-RU-DmitryNeural"), spec.get("rate", "-4%")
    result = {}
    public = lambda v: {k: v[k] for k in ("dur", "marks", "cues")}
    live = {b: public(v) for b, v in cache.items()
            if {"dur", "marks", "cues"} <= v.keys() and (out_dir / f"{b}.mp3").exists()}
    timings_path = out_dir / "timings.js"
    for beat, raw in spec["beats"].items():
        mp3 = out_dir / f"{beat}.mp3"
        old = cache.get(beat)
        clean, marks = split_marks(raw)
        key = hashlib.sha1(f"{voice}|{rate}|{clean}".encode()).hexdigest()
        # Existing caches included [[marks]] in the key; reuse an unchanged old beat once,
        # then save its spoken-text key so future mark edits do not regenerate audio.
        legacy_key = hashlib.sha1(f"{voice}|{rate}|{raw}".encode()).hexdigest()
        reusable = old and old.get("key") in (key, legacy_key) and "words" in old and mp3.exists() and mp3.stat().st_size > 0
        tmp = None
        if reusable:
            words = old["words"]
            clip = mp3
        else:
            with tempfile.NamedTemporaryFile(dir=out_dir, prefix=f".{beat}-", suffix=".mp3", delete=False) as f:
                tmp = Path(f.name)
            clip = tmp
        try:
            if not reusable:
                words = await synth(clean, voice, rate, clip)
            entry = {"key": key, "dur": duration(clip), "words": words,
                     "marks": mark_times(clean, marks, words), "cues": caption_cues(clean, words)}
            if tmp:
                tmp.replace(mp3)
                print(f"{beat}: озвучка создана")
            result[beat] = entry
            cache[beat] = entry
            # A later failed beat must not discard the successful beats' cache.
            write_atomic(cache_path, json.dumps(cache, ensure_ascii=False, indent=1))
            # Keep the successful MP3's timings consistent even if a later beat fails.
            live[beat] = public(entry)
            write_atomic(timings_path, "window.TIMINGS = " + json.dumps(live, ensure_ascii=False, indent=1) + ";\n")
        finally:
            if tmp:
                tmp.unlink(missing_ok=True)
    write_atomic(cache_path, json.dumps(result, ensure_ascii=False, indent=1))
    js = {b: public(v) for b, v in result.items()}
    write_atomic(timings_path, "window.TIMINGS = " + json.dumps(js, ensure_ascii=False, indent=1) + ";\n")


if __name__ == "__main__":
    asyncio.run(main(*sys.argv[1:3]))
