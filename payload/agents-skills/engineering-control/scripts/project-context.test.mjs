import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, after } from 'node:test';
import { canonicalRemote, resolveProject } from './project-context.mjs';

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-global-pipeline-test-'));
const stateRoot = path.join(temporaryRoot, 'state');
function repo(name, remote) {
    const project = path.join(temporaryRoot, name);
    fs.mkdirSync(project);
    execFileSync('git', ['init', '-q', project], { windowsHide: true });
    if (remote) execFileSync('git', ['-C', project, 'remote', 'add', 'origin', remote], { windowsHide: true });
    return project;
}
after(() => {
    const resolved = fs.realpathSync(temporaryRoot);
    const temp = fs.realpathSync(os.tmpdir());
    assert.equal(path.dirname(resolved), temp);
    assert.ok(path.basename(resolved).startsWith('codex-global-pipeline-test-'));
    fs.rmSync(resolved, { recursive: true });
});

test('HTTPS and SSH identities agree and omit credentials/query/fragment', () => {
    const remote = 'https://someone:secret@Example.com/team/repository.git?token=secret#part';
    assert.equal(canonicalRemote(remote), 'example.com/team/repository');
    assert.equal(canonicalRemote(remote), canonicalRemote('git@example.com:team/repository.git'));
    assert.equal(canonicalRemote(remote), canonicalRemote('example.com:team/repository.git'));
    assert.equal(canonicalRemote('buildhost:team/repository.git'), canonicalRemote('ssh://buildhost/team/repository.git'));
    assert.equal(canonicalRemote(remote), canonicalRemote('ssh://git@example.com/team/repository.git'));
    assert.equal(canonicalRemote('C:\\work\\repository'), '');
    assert.equal(canonicalRemote('file:///tmp/repository.git'), '');
});
test('clones share a profile while unrelated repositories stay separate', () => {
    const a = repo('clone-one', 'https://example.com/team/repo.git');
    const b = repo('renamed-clone', 'git@example.com:team/repo.git');
    const c = repo('different', 'https://example.com/team/other.git');
    assert.equal(resolveProject({ project: a, stateRoot }).id, resolveProject({ project: b, stateRoot }).id);
    assert.notEqual(resolveProject({ project: a, stateRoot }).id, resolveProject({ project: c, stateRoot }).id);
});
test('nondefault protocol ports identify different services', () => {
    assert.notEqual(canonicalRemote('ssh://example.com:443/team/repo.git'), canonicalRemote('ssh://example.com/team/repo.git'));
    assert.notEqual(canonicalRemote('https://example.com:22/team/repo.git'), canonicalRemote('https://example.com/team/repo.git'));
    assert.equal(canonicalRemote('ssh://example.com:22/team/repo.git'), canonicalRemote('ssh://example.com/team/repo.git'));
});
test('read-only resolution writes nothing; initialization preserves user content and repo cleanliness', () => {
    const project = repo('preservation');
    const options = { project, stateRoot, task: 'feature-one' };
    const first = resolveProject(options);
    assert.equal(fs.existsSync(first.profile), false);
    resolveProject({ ...options, init: true });
    fs.writeFileSync(first.profile, 'User-owned profile.\n');
    const checkpoint = path.join(first.taskDirectory, 'context.md');
    fs.writeFileSync(checkpoint, 'Existing progress.\n');
    resolveProject({ ...options, init: true });
    assert.equal(fs.readFileSync(first.profile, 'utf8'), 'User-owned profile.\n');
    assert.equal(fs.readFileSync(checkpoint, 'utf8'), 'Existing progress.\n');
    assert.equal(execFileSync('git', ['-C', project, 'status', '--short'], { encoding: 'utf8', windowsHide: true }), '');
});
test('tasks are isolated and traversal is rejected', () => {
    const project = repo('tasks');
    const a = resolveProject({ project, stateRoot, task: 'one', init: true });
    const b = resolveProject({ project, stateRoot, task: 'two', init: true });
    assert.notEqual(a.taskDirectory, b.taskDirectory);
    assert.throws(() => resolveProject({ project, stateRoot, task: '../escape', init: true }), /Task must/);
});
test('global storage cannot be initialized in the project', () => {
    const project = repo('global-only');
    assert.throws(() => resolveProject({ project, stateRoot: path.join(project, 'state'), init: true }), /outside/);
    assert.equal(fs.existsSync(path.join(project, 'state')), false);
});
test('worktrees without an origin share their main repository identity', () => {
    const project = repo('worktree-source');
    execFileSync('git', ['-C', project, '-c', 'user.name=Pipeline Test', '-c', 'user.email=test@example.invalid', 'commit', '--allow-empty', '-qm', 'fixture'], { windowsHide: true });
    const worktree = path.join(temporaryRoot, 'worktree-checkout');
    execFileSync('git', ['-C', project, 'worktree', 'add', '-q', '-b', 'fixture', worktree], { windowsHide: true });
    assert.equal(resolveProject({ project, stateRoot }).id, resolveProject({ project: worktree, stateRoot }).id);
});
