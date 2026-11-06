import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../scripts/bootstrap.mjs');

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'portable codex '));
  t.after(() => rm(root, { recursive: true, force: true }));
  const repo = path.join(root, 'repo with spaces');
  const home = path.join(root, 'home with spaces');
  await mkdir(path.join(repo, 'scripts'), { recursive: true });
  await cp(source, path.join(repo, 'scripts/bootstrap.mjs'));
  await mkdir(home);
  const files = {
    'payload/agents-skills/example/SKILL.md': '# Example\n',
    'payload/agents-skills/example/references/guide.md': '# Guide\n',
    'payload/codex/AGENTS.md': '# Global instructions\n',
    'payload/codex/scripts/code-session-review/review.cjs': 'process.exitCode = 0;\n',
    'templates/config.macos.toml': 'model = "example"\n',
  };
  for (const [name, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(repo, name)), { recursive: true });
    await writeFile(path.join(repo, name), content);
  }
  const skillFiles = Object.entries(files).filter(([name]) => name.startsWith('payload/agents-skills/example/'));
  await writeFile(path.join(repo, 'manifest.json'), JSON.stringify({ skills: [{
    name: 'example', path: 'payload/agents-skills/example',
    files: skillFiles.map(([name, content]) => ({ path: name.slice('payload/agents-skills/example/'.length), sha256: createHash('sha256').update(content).digest('hex') })),
  }] }));
  function run(...args) {
    return spawnSync(process.execPath, [path.join(repo, 'scripts/bootstrap.mjs'), '--home', home, ...args], {
      encoding: 'utf8', env: { ...process.env, CODEX_HOME: path.join(root, 'must not be used') },
    });
  }
  return { root, repo, home, run };
}

test('default and explicit dry runs leave the selected home unchanged', async t => {
  const { home, run } = await fixture(t);
  for (const args of [[], ['--dry-run']]) {
    const result = run(...args);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /dry.run/i);
    assert.deepEqual(await readdir(home), []);
  }
});

test('install copies skills/resources/runner, config and global instructions and is idempotent', async t => {
  const { home, run } = await fixture(t);
  const first = run('--apply');
  assert.equal(first.status, 0, first.stderr);
  assert.equal(await readFile(path.join(home, '.agents/skills/example/references/guide.md'), 'utf8'), '# Guide\n');
  assert.equal(await readFile(path.join(home, '.codex/AGENTS.md'), 'utf8'), '# Global instructions\n');
  assert.equal(await readFile(path.join(home, '.codex/config.toml'), 'utf8'), 'model = "example"\n');
  const hooks = JSON.parse(await readFile(path.join(home, '.codex/hooks.json'), 'utf8'));
  assert.match(hooks.hooks.Stop[0].hooks[0].command, /review\.cjs/);
  const before = await readFile(path.join(home, '.codex/hooks.json'), 'utf8');
  const second = run('--apply');
  assert.equal(second.status, 0, second.stderr);
  assert.equal(await readFile(path.join(home, '.codex/hooks.json'), 'utf8'), before);
  await assert.rejects(lstat(path.join(home, '.codex/backups')), { code: 'ENOENT' });
});

test('preserves existing config, instructions and unrelated hooks and backs up hook modification', async t => {
  const { home, run } = await fixture(t);
  await mkdir(path.join(home, '.codex'));
  await writeFile(path.join(home, '.codex/config.toml'), 'private_setting = true\n');
  await writeFile(path.join(home, '.codex/AGENTS.md'), '# User instructions\n');
  const previous = { extra: true, hooks: { Stop: [{ matcher: '*', hooks: [{ type: 'command', command: 'existing-stop' }] }], SessionStart: [] } };
  await writeFile(path.join(home, '.codex/hooks.json'), JSON.stringify(previous));
  const result = run('--apply');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /manual merge/i);
  assert.equal(await readFile(path.join(home, '.codex/config.toml'), 'utf8'), 'private_setting = true\n');
  assert.equal(await readFile(path.join(home, '.codex/AGENTS.md'), 'utf8'), '# User instructions\n');
  const merged = JSON.parse(await readFile(path.join(home, '.codex/hooks.json'), 'utf8'));
  assert.deepEqual(merged.hooks.Stop[0], previous.hooks.Stop[0]);
  assert.equal(merged.hooks.Stop.length, 2);
  assert.deepEqual(merged.hooks.SessionStart, []);
  assert.equal(merged.extra, true);
  const backups = await readdir(path.join(home, '.codex/backups'));
  assert.equal(backups.length, 1);
  const backup = JSON.parse(await readFile(path.join(home, '.codex/backups', backups[0], 'manifest.json'), 'utf8'));
  assert.equal(backup.files.length, 1);
  assert.equal(backup.files[0].destination, path.join(home, '.codex/hooks.json'));
  const again = run('--apply');
  assert.equal(again.status, 0, again.stderr);
  assert.deepEqual(await readdir(path.join(home, '.codex/backups')), backups);
});

test('refuses conflicts before any writes and replaces only with explicit backup', async t => {
  const { home, run } = await fixture(t);
  const destination = path.join(home, '.agents/skills/example/SKILL.md');
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, 'custom skill\n');
  const denied = run('--apply');
  assert.notEqual(denied.status, 0);
  assert.match(denied.stderr, /conflict/i);
  await assert.rejects(lstat(path.join(home, '.codex')), { code: 'ENOENT' });
  await assert.rejects(lstat(path.join(home, '.agents/skills/example/references')), { code: 'ENOENT' });
  assert.equal(await readFile(destination, 'utf8'), 'custom skill\n');
  const replaced = run('--apply', '--replace');
  assert.equal(replaced.status, 0, replaced.stderr);
  const backups = await readdir(path.join(home, '.codex/backups'));
  const backupRoot = path.join(home, '.codex/backups', backups[0]);
  const backup = JSON.parse(await readFile(path.join(backupRoot, 'manifest.json'), 'utf8'));
  const entry = backup.files.find(file => file.destination === destination);
  assert.ok(entry);
  assert.equal(await readFile(path.join(backupRoot, entry.backupPath), 'utf8'), 'custom skill\n');
});

test('rejects malformed hooks before any writes', async t => {
  const { home, run } = await fixture(t);
  await mkdir(path.join(home, '.codex'));
  await writeFile(path.join(home, '.codex/hooks.json'), '{broken');
  const result = run('--apply');
  assert.notEqual(result.status, 0);
  await assert.rejects(lstat(path.join(home, '.agents')), { code: 'ENOENT' });
});

test('rejects destination symlink traversal including selected roots', async t => {
  for (const relative of ['.agents', '.codex', '.agents/skills/example']) {
    const { root, home, run } = await fixture(t);
    const outside = path.join(root, 'outside');
    await mkdir(outside);
    await mkdir(path.dirname(path.join(home, relative)), { recursive: true });
    await symlink(outside, path.join(home, relative), process.platform === 'win32' ? 'junction' : 'dir');
    const result = run('--apply');
    assert.notEqual(result.status, 0, relative);
    assert.match(result.stderr, /symlink|symbolic link/i);
    assert.deepEqual(await readdir(outside), []);
  }
});

test('rejects altered payload checksums and unsupported options without writes', async t => {
  const { repo, home, run } = await fixture(t);
  await writeFile(path.join(repo, 'payload/agents-skills/example/SKILL.md'), 'tampered');
  const integrity = run('--apply');
  assert.notEqual(integrity.status, 0);
  assert.match(integrity.stderr, /checksum|integrity/i);
  const unsupported = run('--restore', '/tmp/arbitrary');
  assert.notEqual(unsupported.status, 0);
  assert.deepEqual(await readdir(home), []);
});

test('honors CODEX_HOME without --home while keeping skills under the selected operating-system home', async t => {
  const { root, repo, home } = await fixture(t);
  const codex = path.join(root, 'custom codex home');
  const result = spawnSync(process.execPath, [path.join(repo, 'scripts/bootstrap.mjs'), '--apply'], {
    encoding: 'utf8', env: { ...process.env, HOME: home, USERPROFILE: home, CODEX_HOME: codex },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(await readFile(path.join(codex, 'AGENTS.md'), 'utf8'), '# Global instructions\n');
  assert.equal(await readFile(path.join(home, '.agents/skills/example/SKILL.md'), 'utf8'), '# Example\n');
  await assert.rejects(lstat(path.join(home, '.codex')), { code: 'ENOENT' });
});

test('rejects symlink backup roots and selected home roots before writing', async t => {
  const { root, home, run } = await fixture(t);
  const outside = path.join(root, 'outside backup target');
  await mkdir(outside);
  await mkdir(path.join(home, '.codex'));
  await symlink(outside, path.join(home, '.codex/backups'), process.platform === 'win32' ? 'junction' : 'dir');
  await writeFile(path.join(home, '.codex/hooks.json'), '{}');
  const result = run('--apply');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /symlink|symbolic link/i);
  assert.deepEqual(await readdir(outside), []);
  await assert.rejects(lstat(path.join(home, '.agents')), { code: 'ENOENT' });
  const alias = path.join(root, 'linked home');
  await symlink(outside, alias, process.platform === 'win32' ? 'junction' : 'dir');
  const rootResult = run('--home', alias, '--apply');
  assert.notEqual(rootResult.status, 0);
  assert.match(rootResult.stderr, /symlink|symbolic link/i);
  assert.deepEqual(await readdir(outside), []);
});

test('quotes POSIX hook paths containing shell syntax as literal arguments', { skip: process.platform === 'win32' }, async t => {
  const { root, run } = await fixture(t);
  const home = path.join(root, "home ' $(touch injected) `literal`");
  await mkdir(home);
  const result = run('--home', home, '--apply');
  assert.equal(result.status, 0, result.stderr);
  const hooks = JSON.parse(await readFile(path.join(home, '.codex/hooks.json'), 'utf8'));
  const execution = spawnSync('/bin/sh', ['-c', hooks.hooks.Stop[0].hooks[0].command], { encoding: 'utf8', cwd: root });
  assert.equal(execution.status, 0, execution.stderr);
  await assert.rejects(lstat(path.join(root, 'injected')), { code: 'ENOENT' });
});
