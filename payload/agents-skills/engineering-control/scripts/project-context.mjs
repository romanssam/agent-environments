import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function git(cwd, ...args) {
    try {
        return execFileSync('git', ['-C', cwd, ...args], {
            encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
        }).trim();
    } catch {
        return '';
    }
}

export function canonicalRemote(value) {
    if (!value) return '';
    if (!value.includes('://') && !/^[a-zA-Z]:[\\/]/.test(value) && !value.startsWith('file:')) {
        const scp = value.match(/^(?:[^@\s]+@)?([^/:\s]+):(.+)$/);
        if (scp) return `${scp[1].toLowerCase()}/${scp[2].replace(/^\/+|\/+$/g, '').replace(/\.git$/, '')}`;
    }
    try {
        const url = new URL(value);
        if (!['http:', 'https:', 'ssh:', 'git:'].includes(url.protocol)) return '';
        const defaultPort = { 'http:': '80', 'https:': '443', 'ssh:': '22', 'git:': '9418' }[url.protocol];
        const port = url.port && url.port !== defaultPort ? `:${url.port}` : '';
        return `${url.hostname.toLowerCase()}${port}/${url.pathname.replace(/^\/+|\/+$/g, '').replace(/\.git$/, '')}`;
    } catch {
        return '';
    }
}

function canonicalPath(value) {
    const resolved = fs.realpathSync(value);
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function createOnce(file, content) {
    try {
        fs.writeFileSync(file, content, { flag: 'wx', encoding: 'utf8' });
    } catch (error) {
        if (error.code !== 'EEXIST') throw error;
    }
}

export function resolveProject({ project, stateRoot, task, init = false }) {
    const cwd = fs.realpathSync(project);
    if (!fs.statSync(cwd).isDirectory()) throw new Error('Project must be a directory.');
    if (task && !/^[a-z0-9][a-z0-9-]{0,79}$/.test(task)) {
        throw new Error('Task must use 1-80 lowercase letters, digits, or hyphens.');
    }
    const root = git(cwd, 'rev-parse', '--show-toplevel') || cwd;
    const remote = canonicalRemote(git(root, 'remote', 'get-url', 'origin'));
    const common = git(root, 'rev-parse', '--path-format=absolute', '--git-common-dir');
    const identity = remote ? `remote:${remote}` : `local:${canonicalPath(common || root)}`;
    const id = createHash('sha256').update(identity).digest('hex').slice(0, 20);
    const storageRoot = path.resolve(stateRoot || path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'project-context'));
    const relativeStorage = path.relative(path.resolve(root), storageRoot);
    if (relativeStorage === '' || (!relativeStorage.startsWith(`..${path.sep}`) && relativeStorage !== '..' && !path.isAbsolute(relativeStorage))) {
        throw new Error('Global state must be outside the project directory.');
    }
    const directory = path.join(storageRoot, id);
    const profile = path.join(directory, 'profile.md');
    const taskDirectory = task ? path.join(directory, 'tasks', task) : null;
    if (init) {
        fs.mkdirSync(directory, { recursive: true });
        createOnce(profile, `# Project profile\n\n- Identity: ${id}\n- Name: ${path.basename(root)}\n- Read the current checkout's AGENTS.md/CLAUDE.md and command manifests first.\n- Architecture and verification: discover from the relevant source and record verified pointers here.\n- Workflow storage: this global profile; one task directory per work item.\n- Tracker: local Markdown in tasks/<task>/; spec.md, issues/NN-slug.md, context.md, history.md.\n- Domain sources: existing project glossary/ADRs when available; new agent-only notes under domain/.\n- Status vocabulary and continuation rules: engineering-control/references/project-state.md.\n`);
        if (taskDirectory) {
            fs.mkdirSync(taskDirectory, { recursive: true });
            const branch = git(root, 'branch', '--show-current') || '(no branch)';
            const base = git(root, 'rev-parse', 'HEAD') || '(no commit)';
            createOnce(path.join(taskDirectory, 'context.md'), `# Task checkpoint: ${task}\n\n- Status: initialized; implementation and verification have not run.\n- Branch at initialization: ${branch}\n- Base at initialization: ${base}\n- Next: record the user's goal, scope, selected skills, and acceptance criteria before implementation.\n`);
        }
    }
    return { id, projectRoot: root, identitySource: remote ? 'git-origin' : 'local-path', profile, taskDirectory, exists: fs.existsSync(profile) };
}

function main() {
    const args = process.argv.slice(2);
    const options = { project: process.cwd() };
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--init') options.init = true;
        else if (['--project', '--state-root', '--task'].includes(arg)) {
            if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`Missing value for ${arg}.`);
            options[{ '--project': 'project', '--state-root': 'stateRoot', '--task': 'task' }[arg]] = args[++i];
        } else throw new Error(`Unknown option: ${arg}`);
    }
    process.stdout.write(`${JSON.stringify(resolveProject(options), null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try { main(); } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
