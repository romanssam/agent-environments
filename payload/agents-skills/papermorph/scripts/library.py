import argparse
import hashlib
import json
import os
import re
import shutil
import sqlite3
import stat
import sys
import tempfile
from contextlib import closing
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path, PurePosixPath, PureWindowsPath


TEXT_EXTENSIONS = {".html", ".htm", ".md", ".txt", ".json"}
MAX_FILE_BYTES = 2 * 1024 * 1024
MAX_FILE_TEXT_CHARS = 250000
MAX_VERSION_TEXT_CHARS = 2000000
SCHEMA_VERSION = 1


class LibraryError(Exception):
    pass


class VisibleHTML(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.hidden = []
        self.parts = []

    def handle_starttag(self, tag, attrs):
        if tag in {"script", "style"}:
            self.hidden.append(tag)
        elif not self.hidden and tag in {"p", "div", "br", "li", "h1", "h2", "h3", "h4", "tr", "section"}:
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if self.hidden and tag == self.hidden[-1]:
            self.hidden.pop()
        elif not self.hidden:
            self.parts.append("\n")

    def handle_data(self, data):
        if not self.hidden:
            self.parts.append(data)


def utc_now():
    return datetime.now(timezone.utc).isoformat(timespec="microseconds")


def library_root(argument=None):
    value = argument or os.environ.get("PAPERMORPH_LIBRARY")
    if value:
        return Path(value).expanduser().resolve()
    codex_home = os.environ.get("CODEX_HOME")
    return ((Path(codex_home).expanduser() if codex_home else Path.home() / ".codex") / "learning-library").resolve()


def connect(root, create=False):
    database = root / "library.sqlite3"
    if not create and not database.is_file():
        raise LibraryError("Библиотека не создана. Сначала выполните команду init.")
    if create:
        root.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(database, timeout=30, isolation_level=None)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute("PRAGMA synchronous = FULL")
    version = connection.execute("PRAGMA user_version").fetchone()[0]
    if version not in {0, SCHEMA_VERSION}:
        connection.close()
        raise LibraryError(f"Неподдерживаемая версия базы: {version}.")
    if version == 0:
        if not create:
            connection.close()
            raise LibraryError("Схема библиотеки отсутствует. Выполните команду init.")
        try:
            connection.executescript("""
                BEGIN IMMEDIATE;
                CREATE TABLE IF NOT EXISTS materials (
                    id INTEGER PRIMARY KEY,
                    slug TEXT NOT NULL UNIQUE,
                    title TEXT NOT NULL,
                    type TEXT NOT NULL CHECK (type IN ('book', 'course', 'chapter', 'notes')),
                    status TEXT NOT NULL CHECK (status IN ('draft', 'ready')),
                    language TEXT NOT NULL CHECK (language = 'ru'),
                    sources_json TEXT NOT NULL,
                    current_version INTEGER NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS versions (
                    material_id INTEGER NOT NULL REFERENCES materials(id),
                    version INTEGER NOT NULL,
                    title TEXT NOT NULL,
                    type TEXT NOT NULL,
                    status TEXT NOT NULL,
                    language TEXT NOT NULL CHECK (language = 'ru'),
                    sources_json TEXT NOT NULL,
                    entry_path TEXT NOT NULL,
                    snapshot_path TEXT NOT NULL UNIQUE,
                    fingerprint TEXT NOT NULL,
                    search_metadata TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    PRIMARY KEY (material_id, version)
                );
                CREATE TABLE IF NOT EXISTS files (
                    material_id INTEGER NOT NULL,
                    version INTEGER NOT NULL,
                    path TEXT NOT NULL,
                    size INTEGER NOT NULL,
                    sha256 TEXT NOT NULL,
                    content TEXT NOT NULL,
                    search_content TEXT NOT NULL,
                    text_truncated INTEGER NOT NULL,
                    PRIMARY KEY (material_id, version, path),
                    FOREIGN KEY (material_id, version) REFERENCES versions(material_id, version)
                );
                CREATE TRIGGER IF NOT EXISTS immutable_versions_update BEFORE UPDATE ON versions
                BEGIN SELECT RAISE(ABORT, 'immutable version'); END;
                CREATE TRIGGER IF NOT EXISTS immutable_versions_delete BEFORE DELETE ON versions
                BEGIN SELECT RAISE(ABORT, 'immutable version'); END;
                CREATE TRIGGER IF NOT EXISTS immutable_files_update BEFORE UPDATE ON files
                BEGIN SELECT RAISE(ABORT, 'immutable file'); END;
                CREATE TRIGGER IF NOT EXISTS immutable_files_delete BEFORE DELETE ON files
                BEGIN SELECT RAISE(ABORT, 'immutable file'); END;
                PRAGMA user_version = 1;
                COMMIT;
            """)
        except BaseException:
            if connection.in_transaction:
                connection.rollback()
            connection.close()
            raise
    if create:
        (root / "materials").mkdir(exist_ok=True)
        (root / ".staging").mkdir(exist_ok=True)
    return connection


def validate_slug(value):
    if not re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,99}", value):
        raise LibraryError("slug должен содержать 1–100 строчных латинских букв, цифр, дефисов или знаков подчеркивания.")
    if value.upper() in {"CON", "PRN", "AUX", "NUL", *(f"COM{i}" for i in range(1, 10)), *(f"LPT{i}" for i in range(1, 10))}:
        raise LibraryError("slug совпадает с зарезервированным именем Windows.")


def validate_entry(value):
    value = value.replace("\\", "/")
    path = PurePosixPath(value)
    if not value or path.is_absolute() or PureWindowsPath(value).drive or ".." in path.parts:
        raise LibraryError("entry должен быть относительным путем внутри папки материала.")
    return path.as_posix()


def inventory(source):
    result = []
    for directory, subdirectories, filenames in os.walk(source, followlinks=False):
        subdirectories.sort(key=lambda name: (name.casefold(), name))
        filenames.sort(key=lambda name: (name.casefold(), name))
        for name in subdirectories + filenames:
            path = Path(directory) / name
            info = path.lstat()
            if stat.S_ISLNK(info.st_mode) or getattr(info, "st_file_attributes", 0) & getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0):
                raise LibraryError(f"Ссылки и точки подключения не поддерживаются: {path}")
            if not stat.S_ISDIR(info.st_mode) and not stat.S_ISREG(info.st_mode):
                raise LibraryError(f"Неподдерживаемый тип файла: {path}")
        result.extend(Path(directory) / name for name in filenames)
    return sorted(result, key=lambda path: (path.relative_to(source).as_posix().casefold(), path.relative_to(source).as_posix()))


def extract_text(path, size, budget):
    if path.suffix.lower() not in TEXT_EXTENSIONS:
        return "", False
    if budget <= 0:
        return "", size > 0
    with path.open("rb") as stream:
        data = stream.read(MAX_FILE_BYTES)
    body = data.decode("utf-8-sig", errors="replace")
    if path.suffix.lower() in {".html", ".htm"}:
        parser = VisibleHTML()
        parser.feed(body)
        parser.close()
        body = "".join(parser.parts)
    body = re.sub(r"\s+", " ", body).strip()
    limit = min(MAX_FILE_TEXT_CHARS, budget)
    return body[:limit], size > len(data) or len(body) > limit


def stage_files(source, root, entry):
    paths = inventory(source)
    if entry not in {path.relative_to(source).as_posix() for path in paths}:
        raise LibraryError(f"Стартовый файл не найден: {entry}")
    staging = Path(tempfile.mkdtemp(prefix="register-", dir=root / ".staging"))
    files = []
    budget = MAX_VERSION_TEXT_CHARS
    try:
        for original in paths:
            relative = original.relative_to(source).as_posix()
            destination = staging / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            before = original.stat()
            digest = hashlib.sha256()
            size = 0
            with original.open("rb") as input_stream, destination.open("xb") as output_stream:
                while chunk := input_stream.read(1024 * 1024):
                    output_stream.write(chunk)
                    digest.update(chunk)
                    size += len(chunk)
                output_stream.flush()
                os.fsync(output_stream.fileno())
            after = original.stat()
            if (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns) or size != after.st_size:
                raise LibraryError(f"Файл изменился во время копирования: {original}")
            content, truncated = extract_text(destination, size, budget)
            budget -= len(content)
            files.append({"path": relative, "size": size, "sha256": digest.hexdigest(), "content": content, "text_truncated": truncated})
        return staging, files
    except BaseException:
        shutil.rmtree(staging)
        raise


def material_summary(connection, root, material_id, version=None):
    row = connection.execute("""
        SELECT m.slug, m.created_at AS material_created_at, m.updated_at, v.*,
               (SELECT count(*) FROM versions WHERE material_id = m.id) AS version_count,
               (SELECT count(*) FROM files WHERE material_id = m.id AND version = v.version) AS file_count
        FROM materials m JOIN versions v ON v.material_id = m.id
        WHERE m.id = ? AND v.version = coalesce(?, m.current_version)
    """, (material_id, version)).fetchone()
    if row is None:
        raise LibraryError("Материал или его версия не найдены.")
    return {
        "slug": row["slug"], "title": row["title"], "type": row["type"],
        "status": row["status"], "language": row["language"],
        "sources": json.loads(row["sources_json"]), "version": row["version"],
        "version_count": row["version_count"], "file_count": row["file_count"],
        "entry": row["entry_path"], "snapshot": str(root / row["snapshot_path"]),
        "entry_file": str(root / row["snapshot_path"] / row["entry_path"]),
        "fingerprint": row["fingerprint"], "created_at": row["created_at"],
        "updated_at": row["updated_at"]
    }


def register(root, args):
    validate_slug(args.slug)
    if args.language != "ru":
        raise LibraryError("Библиотека принимает только материалы с language=ru.")
    title = args.title.strip()
    if not title:
        raise LibraryError("Название материала не должно быть пустым.")
    entry = validate_entry(args.entry)
    source = Path(args.path).expanduser().resolve()
    if not source.is_dir():
        raise LibraryError("path должен указывать на папку подготовленного материала.")
    if root.is_relative_to(source) or source.is_relative_to(root / "materials") or source.is_relative_to(root / ".staging"):
        raise LibraryError("Нельзя регистрировать корень библиотеки, его родительскую папку или содержимое materials и .staging. Используйте отдельную папку результата, например work/<slug>/site/<slug>.")
    sources = sorted(set(value.strip() for value in args.source if value.strip()), key=lambda value: (value.casefold(), value))
    metadata = {"title": title, "type": args.type, "status": args.status, "language": "ru", "sources": sources, "entry": entry}
    staging = None
    published = None
    committed = False
    with closing(connect(root, create=True)) as connection:
        try:
            staging, files = stage_files(source, root, entry)
            manifest = {**metadata, "files": [{key: file[key] for key in ("path", "size", "sha256")} for file in files]}
            fingerprint = hashlib.sha256(json.dumps(manifest, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()
            connection.execute("BEGIN IMMEDIATE")
            current = connection.execute("""
                SELECT m.id, m.current_version, v.fingerprint FROM materials m
                JOIN versions v ON v.material_id = m.id AND v.version = m.current_version WHERE m.slug = ?
            """, (args.slug,)).fetchone()
            if current and current["fingerprint"] == fingerprint:
                connection.rollback()
                result = material_summary(connection, root, current["id"])
                result["created"] = False
                return result
            timestamp = utc_now()
            versions_directory = root / "materials" / args.slug / "versions"
            versions_directory.mkdir(parents=True, exist_ok=True)
            version = 1 if current is None else current["current_version"] + 1
            while (versions_directory / str(version)).exists():
                version += 1
            sources_json = json.dumps(sources, ensure_ascii=False)
            if current:
                material_id = current["id"]
                connection.execute("""
                    UPDATE materials SET title=?, type=?, status=?, language='ru', sources_json=?, current_version=?, updated_at=? WHERE id=?
                """, (title, args.type, args.status, sources_json, version, timestamp, material_id))
            else:
                cursor = connection.execute("""
                    INSERT INTO materials (slug,title,type,status,language,sources_json,current_version,created_at,updated_at)
                    VALUES (?,?,?,?,'ru',?,?,?,?)
                """, (args.slug, title, args.type, args.status, sources_json, version, timestamp, timestamp))
                material_id = cursor.lastrowid
            published = versions_directory / str(version)
            staging.rename(published)
            staging = None
            relative_snapshot = published.relative_to(root).as_posix()
            search_metadata = " ".join([args.slug, title, args.type, args.status, *sources]).casefold()
            connection.execute("""
                INSERT INTO versions (material_id,version,title,type,status,language,sources_json,entry_path,snapshot_path,fingerprint,search_metadata,created_at)
                VALUES (?,?,?,?,?,'ru',?,?,?,?,?,?)
            """, (material_id, version, title, args.type, args.status, sources_json, entry, relative_snapshot, fingerprint, search_metadata, timestamp))
            connection.executemany("""
                INSERT INTO files (material_id,version,path,size,sha256,content,search_content,text_truncated) VALUES (?,?,?,?,?,?,?,?)
            """, [(material_id, version, item["path"], item["size"], item["sha256"], item["content"], item["content"].casefold(), int(item["text_truncated"])) for item in files])
            connection.commit()
            committed = True
            result = material_summary(connection, root, material_id)
            result["created"] = True
            return result
        except BaseException:
            if connection.in_transaction:
                connection.rollback()
            if published is not None and not committed:
                indexed = connection.execute("SELECT 1 FROM versions WHERE snapshot_path=?", (published.relative_to(root).as_posix(),)).fetchone()
                if indexed is None:
                    shutil.rmtree(published)
            raise
        finally:
            if staging is not None:
                shutil.rmtree(staging)


def list_materials(root, args, query=None):
    with closing(connect(root)) as connection:
        conditions = []
        parameters = []
        if args.type:
            conditions.append("v.type = ?")
            parameters.append(args.type)
        if args.status:
            conditions.append("v.status = ?")
            parameters.append(args.status)
        if query is not None:
            needle = "%" + query.casefold().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
            conditions.append("""(v.search_metadata LIKE ? ESCAPE '\\' OR EXISTS (
                SELECT 1 FROM files f WHERE f.material_id = m.id AND f.version = m.current_version
                AND f.search_content LIKE ? ESCAPE '\\'
            ))""")
            parameters.extend([needle, needle])
        where = " WHERE " + " AND ".join(conditions) if conditions else ""
        rows = connection.execute("""
            SELECT m.id FROM materials m JOIN versions v ON v.material_id = m.id AND v.version = m.current_version
        """ + where + " ORDER BY m.slug LIMIT ?", [*parameters, args.limit]).fetchall()
        items = [material_summary(connection, root, row["id"]) for row in rows]
        return {"library_root": str(root), "count": len(items), "items": items}


def show_material(root, args):
    with closing(connect(root)) as connection:
        row = connection.execute("SELECT id FROM materials WHERE slug=?", (args.slug,)).fetchone()
        if row is None:
            raise LibraryError(f"Материал не найден: {args.slug}")
        result = material_summary(connection, root, row["id"], args.version)
        result["versions"] = [dict(item) for item in connection.execute("SELECT version,title,status,entry_path,created_at,fingerprint FROM versions WHERE material_id=? ORDER BY version", (row["id"],))]
        result["files"] = [dict(item) for item in connection.execute("SELECT path,size,sha256,text_truncated FROM files WHERE material_id=? AND version=? ORDER BY path", (row["id"], result["version"]))]
        return result


def positive_integer(value):
    number = int(value)
    if number < 1:
        raise argparse.ArgumentTypeError("Значение должно быть больше нуля.")
    return number


def main():
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description="Локальная библиотека учебных материалов Papermorph на русском языке.")
    parser.add_argument("--root", help="Папка библиотеки; по умолчанию PAPERMORPH_LIBRARY или CODEX_HOME/learning-library.")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("init", help="Создать пустую библиотеку или проверить ее схему.")
    registration = commands.add_parser("register", help="Сохранить снимок подготовленной папки и зарегистрировать версию.")
    registration.add_argument("--slug", required=True)
    registration.add_argument("--title", required=True)
    registration.add_argument("--path", required=True)
    registration.add_argument("--entry", default="index.html")
    registration.add_argument("--source", action="append", default=[])
    registration.add_argument("--type", choices=("book", "course", "chapter", "notes"), default="book")
    registration.add_argument("--status", choices=("draft", "ready"), default="draft")
    registration.add_argument("--language", default="ru")
    for name in ("list", "search"):
        command = commands.add_parser(name, help="Показать материалы." if name == "list" else "Найти материалы по метаданным и тексту.")
        if name == "search":
            command.add_argument("query")
        command.add_argument("--type", choices=("book", "course", "chapter", "notes"))
        command.add_argument("--status", choices=("draft", "ready"))
        command.add_argument("--limit", type=positive_integer, default=100)
    showing = commands.add_parser("show", help="Показать материал, его версии и файлы.")
    showing.add_argument("slug")
    showing.add_argument("--version", type=positive_integer)
    args = parser.parse_args()
    root = library_root(args.root)
    try:
        if args.command == "init":
            with closing(connect(root, create=True)) as connection:
                result = {"library_root": str(root), "database": str(root / "library.sqlite3"), "schema_version": SCHEMA_VERSION, "language": "ru", "materials": connection.execute("SELECT count(*) FROM materials").fetchone()[0]}
        elif args.command == "register":
            result = register(root, args)
        elif args.command in {"list", "search"}:
            result = list_materials(root, args, getattr(args, "query", None))
        else:
            result = show_material(root, args)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except (LibraryError, OSError, sqlite3.Error, ValueError) as error:
        print(f"Ошибка: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
