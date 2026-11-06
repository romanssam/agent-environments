import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hash = content => createHash('sha256').update(content).digest('hex');

function parseArguments(args) {
  const options = { apply: false, replace: false };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--apply') options.apply = true;
    else if (argument === '--dry-run') options.dryRun = true;
    else if (argument === '--replace') options.replace = true;
    else if (argument === '--home') {
      options.home = args[++index];
      if (!options.home || !path.isAbsolute(options.home)) throw new Error('--home requires an absolute directory.');
    } else if (argument === '--help') options.help = true;
    else throw new Error(`Unsupported option: ${argument}. Profile installation and backup restoration are manual.`);
  }
  if (options.apply && options.dryRun) throw new Error('Choose either --apply or --dry-run.');
  return options;
}

async function inspect(target) {
  try { return await lstat(target); }
  catch (error) { if (error.code === 'ENOENT') return undefined; throw error; }
}

function within(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

async function checkDestination(root, target) {
  if (!within(root, target)) throw new Error(`Destination escapes selected root: ${target}`);
  const relative = path.relative(root, target);
  const parts = relative ? relative.split(path.sep) : [];
  let current = root;
  for (let index = 0; index <= parts.length; index += 1) {
    if (index > 0) current = path.join(current, parts[index - 1]);
    const info = await inspect(current);
    if (info?.isSymbolicLink()) throw new Error(`Refusing symbolic link destination: ${current}`);
    if (info && index < parts.length && !info.isDirectory()) throw new Error(`Destination parent is not a directory: ${current}`);
  }
}

async function sourceFiles(root) {
  const files = [];
  async function visit(directory) {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const target = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Refusing symbolic link payload: ${target}`);
      if (entry.isDirectory()) await visit(target);
      else if (entry.isFile()) files.push({ path: path.relative(root, target).split(path.sep).join('/'), absolute: target });
      else throw new Error(`Unsupported payload file: ${target}`);
    }
  }
  if ((await lstat(root)).isSymbolicLink()) throw new Error(`Refusing symbolic link payload: ${root}`);
  await visit(root);
  return files;
}

function safeRelative(root, relative) {
  if (typeof relative !== 'string' || !relative || path.isAbsolute(relative) || relative.includes('\\')) throw new Error(`Invalid payload path: ${relative}`);
  const target = path.resolve(root, relative);
  if (!within(root, target) || target === root) throw new Error(`Payload path escapes its root: ${relative}`);
  return target;
}

function shellQuote(value) {
  if (process.platform === 'win32') {
    if (/["%!\r\n]/.test(value)) throw new Error('Windows hook paths cannot contain quotes, percent signs, exclamation marks or newlines.');
    return `"${value}"`;
  }
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function mergeHooks(content, command) {
  const document = content ? JSON.parse(content.toString('utf8')) : {};
  if (!document || Array.isArray(document) || typeof document !== 'object') throw new Error('hooks.json must contain an object.');
  if (document.hooks === undefined) document.hooks = {};
  if (!document.hooks || Array.isArray(document.hooks) || typeof document.hooks !== 'object') throw new Error('hooks.json hooks must contain an object.');
  const stop = document.hooks.Stop ?? [];
  if (!Array.isArray(stop) || stop.some(group => !group || !Array.isArray(group.hooks))) throw new Error('hooks.json Stop must contain hook groups.');
  if (stop.some(group => group.hooks.some(hook => hook?.type === 'command' && hook.command === command))) return content;
  document.hooks.Stop = [...stop, { hooks: [{ type: 'command', command, timeout: 30 }] }];
  return Buffer.from(`${JSON.stringify(document, null, 2)}\n`);
}

async function prepare(options) {
  const home = path.resolve(options.home ?? os.homedir());
  const codexSetting = options.home ? path.join(home, '.codex') : (process.env.CODEX_HOME || path.join(home, '.codex'));
  if (!path.isAbsolute(codexSetting)) throw new Error('CODEX_HOME must be an absolute directory.');
  const codex = path.resolve(codexSetting);
  const codexBoundary = within(home, codex) ? home : codex;
  await checkDestination(home, home);
  await checkDestination(codexBoundary, codex);
  const manifest = JSON.parse(await readFile(path.join(repository, 'manifest.json'), 'utf8'));
  if (!Array.isArray(manifest.skills) || !manifest.skills.length) throw new Error('manifest.json must list the bundled skills.');
  const operations = [];
  const notes = [];
  const targets = new Set();
  async function add(root, target, content, policy = 'replace', mode = 0o644) {
    await checkDestination(root, target);
    if (targets.has(target)) throw new Error(`Duplicate destination: ${target}`);
    targets.add(target);
    const info = await inspect(target);
    if (info && !info.isFile()) throw new Error(`Destination is not a regular file: ${target}`);
    const previous = info ? await readFile(target) : undefined;
    if (previous?.equals(content)) return;
    if (previous && policy === 'preserve') {
      notes.push(`Pending manual merge: ${target}`);
      return;
    }
    if (previous && policy === 'replace' && !options.replace) throw new Error(`Conflict at ${target}. Review the file, then use --replace to back up and replace it.`);
    operations.push({ root, target, content, previous, mode });
  }
  for (const skill of manifest.skills) {
    if (typeof skill.name !== 'string' || !skill.name || skill.name === '.' || skill.name === '..' || /[\\/]/.test(skill.name)) throw new Error('Invalid skill name in manifest.');
    const source = safeRelative(repository, skill.path ?? `payload/agents-skills/${skill.name}`);
    const expected = path.join(repository, 'payload/agents-skills', skill.name);
    if (source !== expected) throw new Error(`Unexpected skill source: ${skill.name}`);
    const files = await sourceFiles(source);
    if (!Array.isArray(skill.files) || skill.files.length !== files.length) throw new Error(`Payload integrity file count mismatch: ${skill.name}`);
    const checksums = new Map(skill.files.map(file => [file.path, file.sha256]));
    if (checksums.size !== files.length) throw new Error(`Duplicate payload checksum paths: ${skill.name}`);
    for (const file of files) {
      const content = await readFile(file.absolute);
      if (checksums.get(file.path) !== hash(content)) throw new Error(`Payload checksum mismatch: ${skill.name}/${file.path}`);
      await add(home, path.join(home, '.agents/skills', skill.name, file.path), content);
    }
  }
  const scripts = path.join(repository, 'payload/codex/scripts');
  for (const file of await sourceFiles(scripts)) {
    await add(codexBoundary, path.join(codex, 'scripts', file.path), await readFile(file.absolute), 'replace', file.path.endsWith('.sh') ? 0o755 : 0o644);
  }
  await add(codexBoundary, path.join(codex, 'AGENTS.md'), await readFile(path.join(repository, 'payload/codex/AGENTS.md')), 'preserve');
  await add(codexBoundary, path.join(codex, 'config.toml'), await readFile(path.join(repository, 'templates/config.macos.toml')), 'preserve');
  const hooksPath = path.join(codex, 'hooks.json');
  await checkDestination(codexBoundary, hooksPath);
  const hookInfo = await inspect(hooksPath);
  if (hookInfo && !hookInfo.isFile()) throw new Error(`Destination is not a regular file: ${hooksPath}`);
  const previousHooks = hookInfo ? await readFile(hooksPath) : undefined;
  const command = `${shellQuote(process.execPath)} ${shellQuote(path.join(codex, 'scripts/code-session-review/review.cjs'))} hook`;
  await add(codexBoundary, hooksPath, mergeHooks(previousHooks, command), 'merge');
  if (operations.some(operation => operation.previous)) await checkDestination(codexBoundary, path.join(codex, 'backups'));
  return { home, codex, codexBoundary, operations, notes, skillCount: manifest.skills.length };
}

async function makeBackups(plan) {
  const changed = plan.operations.filter(operation => operation.previous);
  if (!changed.length) return undefined;
  const parent = path.join(plan.codex, 'backups');
  await checkDestination(plan.codexBoundary, parent);
  await mkdir(parent, { recursive: true });
  const directory = await mkdtemp(path.join(parent, `${new Date().toISOString().replaceAll(':', '-')}-`));
  const files = [];
  for (const [index, operation] of changed.entries()) {
    const backupPath = `${index.toString().padStart(4, '0')}.bak`;
    await writeFile(path.join(directory, backupPath), operation.previous, { flag: 'wx', mode: 0o600 });
    files.push({ destination: operation.target, backupPath, sha256: hash(operation.previous) });
  }
  await writeFile(path.join(directory, 'manifest.json'), `${JSON.stringify({ version: 1, createdAt: new Date().toISOString(), home: plan.home, codexHome: plan.codex, files }, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  return directory;
}

async function apply(plan) {
  const backup = await makeBackups(plan);
  if (backup) console.log(`Backup: ${backup}`);
  for (const operation of plan.operations) {
    await checkDestination(operation.root, operation.target);
    await mkdir(path.dirname(operation.target), { recursive: true });
    const temporary = path.join(path.dirname(operation.target), `.codex-install-${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, operation.content, { flag: 'wx', mode: operation.mode });
      await checkDestination(operation.root, operation.target);
      await rename(temporary, operation.target);
      if (process.platform !== 'win32') await chmod(operation.target, operation.mode);
    } finally {
      try { await unlink(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
  }
}

try {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    console.log('Usage: node scripts/bootstrap.mjs [--dry-run | --apply] [--home ABSOLUTE_DIRECTORY] [--replace]\nDefault: dry run. Existing config/AGENTS require manual merge. Backups have a manifest for manual restoration. Profiles are installed manually.');
  } else {
    if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Node.js 22 or newer is required.');
    const plan = await prepare(options);
    console.log(`${options.apply ? 'Apply' : 'Dry run'}: ${plan.skillCount} skills, ${plan.operations.length} file changes.\nHome: ${plan.home}\nCODEX_HOME: ${plan.codex}`);
    for (const note of plan.notes) console.log(note);
    if (options.apply) await apply(plan);
    console.log('Hook configured by installation; trust still requires manual approval in Codex /hooks. Accounts and managed plugins are not installed or verified.');
  }
} catch (error) {
  console.error(`Bootstrap failed: ${error.message}`);
  process.exitCode = 1;
}
