const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync, spawn } = require('node:child_process');

const home = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
function executable(name) {
    const extensions = process.platform === 'win32' ? ['.exe', '.cmd', '.bat'] : [''];
    for (const entry of (process.env.PATH || '').split(path.delimiter)) {
        const directory = entry.replace(/^"|"$/g, '');
        if (!path.isAbsolute(directory)) continue;
        const relative = path.relative(process.cwd(), directory);
        if (!relative || (!relative.startsWith('..') && !path.isAbsolute(relative))) continue;
        for (const extension of extensions) {
            const candidate = path.join(directory, name + extension);
            if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return fs.realpathSync(candidate);
        }
    }
    throw new Error(`Trusted executable not found on PATH: ${name}`);
}

const gitBinary = executable('git');
function codexBinary() {
    if (process.env.CODEX_REVIEW_BIN) {
        if (!path.isAbsolute(process.env.CODEX_REVIEW_BIN)) throw new Error('CODEX_REVIEW_BIN must be absolute');
        return process.env.CODEX_REVIEW_BIN;
    }
    return executable('codex');
}

const roles = {
    plan: 'Review the proposed approach BEFORE production edits. Inspect relevant existing code/contracts. Check goal, scope, risks, simplest coherent design, verification, unresolved material decisions and return-to-planning conditions. Check the routing of grilling/alternatives/prototype when needed, not as mandatory ceremony. A prototype or interview answer does not authorize implementation. Report concrete gaps; unresolved material decisions mean incomplete. Inspect the plan listed in files; criteria may be empty for this planning review.',
    spec: 'Trace EVERY acceptance criterion in the supplied spec to implementation and verification evidence. In summary list each criterion ID, fulfilled/partial/missing/unverified and evidence. Read relevant existing modules even when absent from the changed files. Report scope creep and missing behavior. An unavailable required contract or unverifiable criterion means incomplete, never pass.',
    architect:
        'Prioritize easy reading and the smallest coherent design. Check module boundaries, ownership, unnecessary indirection, speculative abstractions, repeated decisions and meaningful duplication. Recommend subtraction first. Similar syntax alone does not justify a shared abstraction. Report only concrete maintenance costs with a smaller alternative; do not demand a redesign for preference.',
    reviewer:
        'Check actual behavior, regressions, edge cases, asynchronous races, errors, types and meaningful test coverage. Tie each finding to a reachable scenario and consequence. Inspect callers of changed contracts.',
    security:
        'Trace reachable risks across input, authorization, secrets, HTML, URLs, files, shell arguments and external actions. Identify trust boundary, attack path and impact. Check relevant existing callers; avoid hypothetical hardening unrelated to the change.',
    api: 'Check request/response contracts, methods, payloads, permission metadata, pagination, retries and error handling against the actual owning contracts.',
    ui: 'Check changed user flows, loading/error/empty states, responsive layout, keyboard, focus, semantics and labels. Distinguish source inspection from actual browser evidence; missing necessary visual evidence means incomplete.',
    performance:
        'Check measurable or concretely demonstrable render/request churn, large data, bundles and resource cleanup. Avoid speculative optimization.',
};

function git(root, ...args) {
    return execFileSync(gitBinary, ['--no-optional-locks', ...args], {
        cwd: root,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
    });
}

function digest(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function fileHash(file) {
    let stat;
    try {
        stat = fs.lstatSync(file);
    } catch (error) {
        if (error.code === 'ENOENT') return 'deleted';
        throw error;
    }
    if (stat.isSymbolicLink()) return digest(`link:${fs.readlinkSync(file)}`);
    if (stat.isDirectory()) return 'directory';
    const hash = crypto.createHash('sha256');
    const buffer = Buffer.alloc(65536);
    const descriptor = fs.openSync(file, 'r');
    try {
        let count;
        while ((count = fs.readSync(descriptor, buffer, 0, buffer.length, null)))
            hash.update(buffer.subarray(0, count));
    } finally {
        fs.closeSync(descriptor);
    }
    return hash.digest('hex');
}

function inputHash(file) {
    return fileHash(fs.realpathSync(file));
}

function approvalSignature(approach, spec = approach?.spec) {
    if (
        !approach ||
        approach.status !== 'approved' ||
        !approach.approvalNote?.trim() ||
        (spec || null) !== approach.spec ||
        approach.planHash !== inputHash(approach.plan) ||
        (approach.spec && approach.specHash !== inputHash(approach.spec))
    )
        return null;
    return digest(
        JSON.stringify({
            id: approach.id,
            planHash: approach.planHash,
            specHash: approach.specHash,
            approvedAt: approach.approvedAt,
            approvalNote: approach.approvalNote,
        })
    );
}

function isCurrentPass(result, current, approach) {
    const signature = approvalSignature(approach);
    return Boolean(
        result &&
            result.status === 'pass' &&
            signature &&
            result.approvalSignature === signature &&
            result.codeFingerprint === digest(JSON.stringify(current)) &&
            (!result.spec || result.specHash === inputHash(result.spec)) &&
            (!result.evidence || result.evidenceHash === inputHash(result.evidence))
    );
}

function snapshot(root) {
    const index = Object.create(null);
    for (const entry of git(root, 'ls-files', '--stage', '-z').split('\0').filter(Boolean)) {
        const separator = entry.indexOf('\t');
        const name = entry.slice(separator + 1);
        index[name] = (index[name] || '') + entry.slice(0, separator);
    }
    const names = new Set(
        git(root, 'ls-files', '--cached', '--others', '--exclude-standard', '-z').split('\0').filter(Boolean)
    );
    const files = Object.create(null);
    for (const name of [...names].sort())
        files[name] = digest(`${index[name] || ''}:${fileHash(path.join(root, name))}`);
    let head = null;
    try {
        head = git(root, 'rev-parse', '--verify', 'HEAD').trim();
    } catch {}
    const dirty = new Set(git(root, 'diff', '--name-only', '-z').split('\0').filter(Boolean));
    for (const name of git(root, 'diff', '--cached', '--name-only', '-z').split('\0').filter(Boolean)) dirty.add(name);
    for (const name of names) if (!index[name]) dirty.add(name);
    return { head, files, dirty: [...dirty].sort() };
}

function changedFiles(before, after) {
    return [...new Set([...Object.keys(before.files), ...Object.keys(after.files)])]
        .filter((file) => before.files[file] !== after.files[file])
        .sort();
}

function validateReport(report, expectedFiles, expectedCriteria = []) {
    const strings = (value) => Array.isArray(value) && value.every((item) => typeof item === 'string');
    if (
        !report ||
        !['pass', 'changes_requested', 'incomplete'].includes(report.status) ||
        typeof report.summary !== 'string' ||
        !report.summary.trim() ||
        !strings(report.checked_files) ||
        !strings(report.limitations) ||
        !Array.isArray(report.findings) ||
        !Array.isArray(report.criteria)
    )
        throw new Error('Invalid reviewer report');
    for (const finding of report.findings) {
        if (
            !finding ||
            !['P1', 'P2'].includes(finding.priority) ||
            !['correctness', 'security', 'simplicity', 'duplication', 'readability'].includes(finding.category) ||
            !['file', 'problem', 'fix'].every((key) => typeof finding[key] === 'string' && finding[key].trim()) ||
            !Number.isInteger(finding.line) ||
            finding.line < 1
        )
            throw new Error('Invalid reviewer finding');
    }
    if (report.status === 'pass' && report.findings.length) throw new Error('Pass cannot contain findings');
    if (report.status === 'changes_requested' && !report.findings.length)
        throw new Error('Missing actionable findings');
    if (expectedFiles.some((file) => !report.checked_files.includes(file))) throw new Error('Incomplete file coverage');
    for (const criterion of report.criteria) {
        if (
            !criterion ||
            typeof criterion.id !== 'string' ||
            !['fulfilled', 'partial', 'missing', 'unverified'].includes(criterion.status) ||
            typeof criterion.evidence !== 'string' ||
            !criterion.evidence.trim()
        )
            throw new Error('Invalid criterion evidence');
        if (report.status === 'pass' && criterion.status !== 'fulfilled')
            throw new Error('Unverified criterion cannot pass');
    }
    const ids = report.criteria.map((criterion) => criterion.id);
    if (new Set(ids).size !== ids.length || expectedCriteria.some((id) => !ids.includes(id)))
        throw new Error('Incomplete criterion coverage');
    return report;
}

function reviewerArgs(root, output, servers = []) {
    const args = [
        '--no-daemon',
        '-a',
        'never',
        'exec',
        '--sandbox',
        'read-only',
        '--ephemeral',
        '--color',
        'never',
        '--cd',
        root,
        '--output-schema',
        path.join(__dirname, 'schema.json'),
        '--output-last-message',
        output,
        '--disable',
        'hooks',
        '--disable',
        'apps',
        '--disable',
        'plugins',
        '--disable',
        'multi_agent',
        '--disable',
        'memories',
        '-c',
        'notify=[]',
    ];
    for (const server of servers) {
        if (!/^[A-Za-z0-9_-]+$/.test(server))
            throw new Error(`Unsupported MCP server key: ${server}; review remains incomplete`);
        args.push('-c', `mcp_servers.${server}.enabled=false`);
    }
    return [...args, '-'];
}

function configuredServers(root) {
    const servers = JSON.parse(
        execFileSync(
            codexBinary(),
            ['--no-daemon', '-C', root, '--disable', 'apps', '--disable', 'plugins', 'mcp', 'list', '--json'],
            { cwd: root, encoding: 'utf8', timeout: 15000, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }
        )
    );
    if (!Array.isArray(servers) || servers.some((server) => typeof server.name !== 'string')) {
        throw new Error('Cannot establish the MCP inventory; review remains incomplete');
    }
    return servers.map((server) => server.name);
}

function writeJson(file, value) {
    fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

function readJson(file) {
    return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
}

function updateApproach(file, expectedId, next, beforeWrite = () => {}) {
    const lockFile = file + '.lock';
    const lock = fs.openSync(lockFile, 'wx');
    try {
        if (readJson(file)?.id !== expectedId)
            throw new Error('A newer approach superseded this update; its state is preserved');
        beforeWrite();
        writeJson(file, next);
    } finally {
        fs.closeSync(lock);
        fs.unlinkSync(lockFile);
    }
}

function reviewRole(root, output, prompt) {
    const args = reviewerArgs(root, output, configuredServers(root));
    return new Promise((resolve, reject) => {
        const log = fs.openSync(output + '.log', 'w');
        const child = spawn(codexBinary(), args, {
            cwd: root,
            windowsHide: true,
            detached: process.platform !== 'win32',
            env: { ...process.env, CODEX_QUALITY_REVIEW_ACTIVE: '1' },
            stdio: ['pipe', log, log],
        });
        let timedOut = false;
        const timer = setTimeout(() => {
            timedOut = true;
            try {
                if (process.platform === 'win32') {
                    execFileSync(
                        path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe'),
                        ['/PID', String(child.pid), '/T', '/F'],
                        {
                            windowsHide: true,
                            stdio: 'ignore',
                            timeout: 10000,
                        }
                    );
                } else process.kill(-child.pid, 'SIGKILL');
            } catch (error) {
                child.kill();
                reject(new Error(`Reviewer timeout; process-tree termination failed: ${error.message}`));
            }
        }, 480000);
        child.stdin.on('error', () => {});
        child.once('error', (error) => {
            clearTimeout(timer);
            fs.closeSync(log);
            reject(error);
        });
        child.once('exit', (code) => {
            clearTimeout(timer);
            fs.closeSync(log);
            if (timedOut || code !== 0)
                reject(new Error(timedOut ? 'Reviewer timeout' : `Reviewer exited ${code}; see ${output}.log`));
            else {
                try {
                    resolve(JSON.parse(fs.readFileSync(output, 'utf8')));
                } catch (error) {
                    reject(error);
                }
            }
        });
        child.stdin.end(prompt);
    });
}

function locations(root, session) {
    if (!session) throw new Error('CODEX_THREAD_ID is unavailable; supply --session <stable-task-id>');
    const directory = path.join(
        home,
        'project-context',
        'global-code-review',
        'runs',
        digest(`${process.platform === 'win32' ? root.toLowerCase() : root}:${session}`).slice(0, 24)
    );
    fs.mkdirSync(directory, { recursive: true });
    return {
        directory,
        baseline: path.join(directory, 'baseline.json'),
        result: path.join(directory, 'result.json'),
        approach: path.join(directory, 'approach.json'),
    };
}

async function main(args = process.argv.slice(2), runReviewer = reviewRole) {
    if (process.env.CODEX_QUALITY_REVIEW_ACTIVE === '1') return;
    const event = args[0] === 'hook' ? JSON.parse(fs.readFileSync(0, 'utf8')) : null;
    try {
        return await runCommand(args, runReviewer, event);
    } catch (error) {
        if (!event) throw error;
        const message = `Quality gate error: ${error.message}; review remains unverified. Read the sdd-quality-gate skill before reporting completion.`;
        process.stdout.write(
            JSON.stringify(event.stop_hook_active ? { systemMessage: message } : { decision: 'block', reason: message })
        );
    }
}

async function runCommand(args, runReviewer, event) {
    const command = args.shift();
    const options = {};
    while (args.length) {
        const key = args.shift();
        if (
            !['--spec', '--evidence', '--goal', '--session', '--roles', '--plan', '--approval-note'].includes(key) ||
            !args.length
        )
            throw new Error(`Invalid option ${key}`);
        options[key.slice(2)] = args.shift();
    }
    const cwd = event?.cwd || process.cwd();
    let root;
    try {
        root = git(cwd, 'rev-parse', '--show-toplevel').trim();
    } catch (error) {
        if (event) return;
        throw new Error('A Git repository is required');
    }
    const locationsForTask = locations(root, event?.session_id || options.session || process.env.CODEX_THREAD_ID);
    const { directory, baseline, result, approach: approachFile } = locationsForTask;
    let approach = readJson(approachFile);
    if (command === 'begin') {
        const current = snapshot(root);
        if (fs.existsSync(baseline)) {
            const previous = fs.existsSync(result) && JSON.parse(fs.readFileSync(result, 'utf8'));
            if (!isCurrentPass(previous, current, approach)) {
                process.stdout.write(`Existing unfinished baseline retained: ${baseline}\n`);
                return;
            }
        }
        const archive = path.join(directory, 'baseline-' + crypto.randomUUID());
        fs.mkdirSync(archive);
        const dirtyCopies = Object.create(null);
        for (const file of current.dirty) {
            const source = path.join(root, file);
            if (!fs.existsSync(source) || !fs.lstatSync(source).isFile()) continue;
            const copy = path.join(archive, 'files', file);
            fs.mkdirSync(path.dirname(copy), { recursive: true });
            fs.copyFileSync(source, copy);
            dirtyCopies[file] = copy;
        }
        fs.writeFileSync(
            path.join(archive, 'index.patch'),
            git(root, 'diff', '--no-ext-diff', '--no-textconv', '--cached', '--binary')
        );
        fs.writeFileSync(
            path.join(archive, 'working.patch'),
            git(root, 'diff', '--no-ext-diff', '--no-textconv', '--binary')
        );
        const nextBaseline = {
            ...current,
            root,
            archive,
            dirtyCopies,
            spec: options.spec && path.resolve(options.spec),
            goal: options.goal || '',
            created: new Date().toISOString(),
        };
        updateApproach(approachFile, approach?.id, { id: crypto.randomUUID(), status: 'not_planned' }, () => {
            writeJson(baseline, nextBaseline);
            if (fs.existsSync(result)) fs.unlinkSync(result);
        });
        process.stdout.write(`Review baseline: ${baseline}\n`);
        return;
    }
    if (!fs.existsSync(baseline)) {
        if (event) return;
        throw new Error('Run begin before editing; a missing baseline is not a successful review');
    }
    const start = JSON.parse(fs.readFileSync(baseline, 'utf8'));
    const current = snapshot(root);
    const files = changedFiles(start, current);
    const spec = options.spec ? path.resolve(options.spec) : start.spec;
    const evidence = options.evidence && path.resolve(options.evidence);
    if (command === 'plan') {
        if (!options.plan) throw new Error('Supply --plan <reviewable-plan.md>');
        const plan = path.resolve(options.plan);
        if (!fs.statSync(plan).isFile() || !fs.readFileSync(plan, 'utf8').trim())
            throw new Error('Plan must be a nonempty readable file');
        const previousId = approach?.id;
        approach = {
            id: crypto.randomUUID(),
            status: 'reviewing',
            plan,
            planHash: inputHash(plan),
            spec: spec || null,
            specHash: spec ? inputHash(spec) : null,
            planningCodeFingerprint: digest(JSON.stringify(current)),
            created: new Date().toISOString(),
        };
        updateApproach(approachFile, previousId, approach);
        const output = path.join(directory, `plan-${approach.id}.json`);
        const packet = {
            root,
            baseline: start.head,
            baselineArchive: start.archive || null,
            files: [plan],
            plan,
            spec: approach.spec,
            goal: options.goal || start.goal,
            criteria: [],
            phase: 'plan-review',
        };
        const prompt = fs.readFileSync(path.join(__dirname, 'prompt.md'), 'utf8');
        let report;
        try {
            report = validateReport(
                await runReviewer(
                    root,
                    output,
                    `${prompt}\n\nROLE: plan\n${roles.plan}\n\nREVIEW PACKET:\n${JSON.stringify(packet, null, 2)}`
                ),
                [plan]
            );
        } catch (error) {
            report = {
                status: 'incomplete',
                summary: error.message,
                checked_files: [],
                findings: [],
                criteria: [],
                limitations: ['Plan reviewer did not complete.'],
            };
        }
        const latest = readJson(approachFile);
        if (latest?.id !== approach.id) throw new Error('A newer plan superseded this review; its state is preserved');
        const isStale =
            approach.planningCodeFingerprint !== digest(JSON.stringify(snapshot(root))) ||
            approach.planHash !== inputHash(plan) ||
            (approach.spec && approach.specHash !== inputHash(approach.spec));
        writeJson(output, report);
        approach.status =
            isStale || report.status === 'incomplete'
                ? 'incomplete'
                : report.status === 'pass'
                  ? 'awaiting_approval'
                  : 'changes_requested';
        updateApproach(approachFile, approach.id, {
            ...approach,
            report: output,
            reviewStatus: report.status,
            isStale,
        });
        process.stdout.write(
            `${approach.status.toUpperCase()}\nPlan review: ${output}\nExplicit user approval is required before production edits.\n`
        );
        process.exitCode =
            approach.status === 'awaiting_approval' ? 0 : approach.status === 'changes_requested' ? 2 : 3;
        return;
    }
    if (command === 'approve') {
        if (!options['approval-note']?.trim())
            throw new Error(
                'Record the actual explicit user reply with --approval-note; reviewers cannot authorize implementation'
            );
        if (
            approach?.status !== 'awaiting_approval' ||
            approach.reviewStatus !== 'pass' ||
            approach.planHash !== inputHash(approach.plan) ||
            approach.spec !== (spec || null) ||
            (approach.spec && approach.specHash !== inputHash(approach.spec)) ||
            approach.planningCodeFingerprint !== digest(JSON.stringify(current))
        ) {
            throw new Error(
                'Plan review is missing, failed or stale; review the current approach and ask the user again'
            );
        }
        updateApproach(approachFile, approach.id, {
            ...approach,
            status: 'approved',
            approvalNote: options['approval-note'].trim(),
            approvedAt: new Date().toISOString(),
        });
        process.stdout.write('APPROVED: recorded explicit user reply for the reviewed plan.\n');
        return;
    }
    if (event?.hook_event_name === 'Stop' && approach?.status === 'awaiting_approval') {
        process.stdout.write(
            JSON.stringify({
                systemMessage:
                    'Awaiting the user’s explicit approval of the reviewed approach. Research/planning only; production edits and final completion remain unapproved.',
            })
        );
        return;
    }
    const signature = approvalSignature(approach, spec);
    if (command === 'check' || command === 'review') {
        if (!signature)
            throw new Error(
                'No current approved approach. Review the plan, show it to the user, and record their explicit agreement before implementation'
            );
        if (command === 'check') {
            process.stdout.write(
                'APPROVED: plan and spec are current; implementation may continue within this approach.\n'
            );
            return;
        }
    }
    const fingerprint = digest(
        JSON.stringify({
            current,
            spec: spec && inputHash(spec),
            evidence: evidence && inputHash(evidence),
            approval: signature,
        })
    );
    if (event) {
        if (event.hook_event_name !== 'Stop' || (!files.length && !fs.existsSync(result))) return;
        const previous = fs.existsSync(result) && JSON.parse(fs.readFileSync(result, 'utf8'));
        if (isCurrentPass(previous, current, approach)) return;
        const message = `Final quality review is missing, failed or stale. Read ${path.join(os.homedir(), '.agents', 'skills', 'sdd-quality-gate', 'SKILL.md')} and complete the fresh-context review before reporting completion. Baseline: ${baseline}. If the user requested a pause, report the pending review explicitly.`;
        process.stdout.write(
            JSON.stringify(event.stop_hook_active ? { systemMessage: message } : { decision: 'block', reason: message })
        );
        return;
    }
    if (command !== 'review') throw new Error('Use begin, plan, approve, check, review or hook');
    if (!files.length) {
        process.stdout.write('No file changes since baseline; no reviewers started.\n');
        return;
    }
    if (spec && !fs.statSync(spec).isFile()) throw new Error('Spec must be a readable file');
    if (evidence && !fs.statSync(evidence).isFile()) throw new Error('Evidence must be a readable file');
    const criteria = spec ? [...new Set(fs.readFileSync(spec, 'utf8').match(/\bAC[-_]?\d+\b/g) || [])] : [];
    if (spec && !criteria.length)
        throw new Error(
            'Use stable criterion IDs (AC1, AC2, ...) in the spec or a task-local criteria document referencing it'
        );
    const requested = options.roles ? options.roles.split(',') : [];
    const selected = [
        ...new Set([
            ...(spec ? ['spec', 'architect', 'reviewer', 'security'] : ['architect', 'reviewer', 'security']),
            ...requested,
        ]),
    ];
    if (selected.some((role) => role === 'plan' || !Object.hasOwn(roles, role)))
        throw new Error('Unknown final review role');
    const round = path.join(
        directory,
        new Date().toISOString().replace(/[:.]/g, '-') + '-' + crypto.randomUUID().slice(0, 8)
    );
    fs.mkdirSync(round);
    const packet = {
        root,
        baseline: start.head,
        baselineArchive: start.archive || null,
        dirtyCopies: start.dirtyCopies || {},
        files,
        criteria,
        preExistingDirty: start.dirty.filter((file) => files.includes(file)),
        spec: spec || null,
        specHash: spec && inputHash(spec),
        evidence: evidence || null,
        goal: options.goal || start.goal,
        approvedPlan: approach.plan,
        approvedPlanHash: approach.planHash,
        approval: { approvedAt: approach.approvedAt, note: approach.approvalNote },
        comparison:
            'Compare baseline HEAD, current HEAD, index, working files and untracked files. Changed files may contain older work; do not attribute pre-existing code to this task without evidence.',
    };
    writeJson(path.join(round, 'packet.json'), packet);
    const prompt = fs.readFileSync(path.join(__dirname, 'prompt.md'), 'utf8');
    const reports = Object.create(null);
    const pending = [...selected];
    async function worker() {
        while (pending.length) {
            const role = pending.shift();
            process.stdout.write(`Reviewing: ${role}\n`);
            try {
                reports[role] = validateReport(
                    await runReviewer(
                        root,
                        path.join(round, `${role}.json`),
                        `${prompt}\n\nROLE: ${role}\n${roles[role]}\n\nREVIEW PACKET:\n${JSON.stringify(packet, null, 2)}`
                    ),
                    files,
                    role === 'spec' ? criteria : []
                );
            } catch (error) {
                reports[role] = {
                    status: 'incomplete',
                    summary: String(error.message),
                    checked_files: [],
                    findings: [],
                    criteria: [],
                    limitations: ['Reviewer did not complete.'],
                };
                writeJson(path.join(round, `${role}.json`), reports[role]);
            }
        }
    }
    await Promise.all([worker(), worker()]);
    const final = snapshot(root);
    const finalSpecHash = spec && inputHash(spec);
    const finalEvidenceHash = evidence && inputHash(evidence);
    const finalSignature = approvalSignature(readJson(approachFile), spec);
    const finalFingerprint = digest(
        JSON.stringify({ current: final, spec: finalSpecHash, evidence: finalEvidenceHash, approval: finalSignature })
    );
    const isStale = finalFingerprint !== fingerprint;
    const status =
        isStale || selected.some((role) => reports[role].status === 'incomplete')
            ? 'incomplete'
            : selected.some((role) => reports[role].status === 'changes_requested')
              ? 'changes_requested'
              : 'pass';
    writeJson(result, {
        status,
        isStale,
        codeFingerprint: digest(JSON.stringify(final)),
        spec: spec || null,
        specHash: finalSpecHash,
        evidence: evidence || null,
        evidenceHash: finalEvidenceHash,
        approvalSignature: finalSignature,
        approvedPlan: approach.plan,
        round,
        roles: selected,
        reports,
    });
    process.stdout.write(
        `\n${status.toUpperCase()}${isStale ? ': inputs changed during review' : ''}\nReports: ${round}\n`
    );
    process.exitCode = status === 'pass' ? 0 : status === 'changes_requested' ? 2 : 3;
}

module.exports = { snapshot, changedFiles, validateReport, reviewerArgs, configuredServers, executable, main };
if (require.main === module)
    main().catch((error) => {
        if (process.argv[2] === 'hook')
            process.stdout.write(
                JSON.stringify({ systemMessage: `Quality gate error: ${error.message}; review remains unverified.` })
            );
        else process.stderr.write(`Quality gate error: ${error.message}\n`);
        process.exitCode = process.argv[2] === 'hook' ? 0 : 3;
    });
