const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { snapshot, changedFiles, validateReport, reviewerArgs, executable } = require('./review.cjs');

function git(root, ...args) {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function fixture(t) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'code-session-review-test-'));
    const root = path.join(directory, 'repo');
    fs.mkdirSync(root);
    t.after(() => {
        assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
        assert.ok(path.basename(directory).startsWith('code-session-review-test-'));
        fs.rmSync(directory, { recursive: true, force: true });
    });
    git(root, 'init', '--quiet');
    git(root, 'config', 'core.autocrlf', 'false');
    git(root, 'config', 'user.name', 'Review Runner Test');
    git(root, 'config', 'user.email', 'review-runner@example.invalid');
    fs.writeFileSync(path.join(root, 'tracked.ts'), 'export const count = 1;\n');
    fs.writeFileSync(path.join(root, 'delete.ts'), 'export const obsolete = true;\n');
    fs.writeFileSync(path.join(root, '.gitignore'), 'ignored.txt\n');
    git(root, 'add', '.');
    git(root, 'commit', '--quiet', '-m', 'Initial fixture');
    return { root, directory };
}

function passReport(files = ['src/main.ts']) {
    return {
        status: 'pass',
        summary: 'Проверенные изменения не содержат подтверждённых проблем.',
        checked_files: files,
        findings: [],
        criteria: [],
        limitations: [],
    };
}

function finding() {
    return {
        priority: 'P1',
        category: 'security',
        file: 'src/main.ts',
        line: 3,
        problem: 'Недоверенный HTML попадает в DOM без очистки.',
        fix: 'Очистить HTML на границе ввода.',
    };
}

test('unchanged dirty files are excluded from the current session', (t) => {
    const { root } = fixture(t);
    fs.writeFileSync(path.join(root, 'tracked.ts'), 'export const count = 2;\n');
    fs.writeFileSync(path.join(root, 'existing-untracked.ts'), 'export const draft = true;\n');
    const before = snapshot(root);
    assert.deepEqual(changedFiles(before, snapshot(root)), []);
    assert.ok(before.dirty.includes('tracked.ts'));
    assert.ok(before.dirty.includes('existing-untracked.ts'));
});

test('staged, unstaged, untracked, deleted and Cyrillic paths are included', (t) => {
    const { root } = fixture(t);
    const before = snapshot(root);
    fs.writeFileSync(path.join(root, 'tracked.ts'), 'export const count = 3;\n');
    fs.writeFileSync(path.join(root, 'staged.ts'), 'export const saved = true;\n');
    git(root, 'add', 'staged.ts');
    fs.writeFileSync(path.join(root, 'новый файл.ts'), 'export const ready = true;\n');
    fs.unlinkSync(path.join(root, 'delete.ts'));
    fs.writeFileSync(path.join(root, 'ignored.txt'), 'ignored content');
    const after = snapshot(root);
    assert.deepEqual(
        changedFiles(before, after).sort(),
        ['delete.ts', 'staged.ts', 'tracked.ts', 'новый файл.ts'].sort()
    );
    assert.equal(after.files['ignored.txt'], undefined);
    assert.ok(!after.dirty.includes('ignored.txt'));
});

test('changes committed during the session remain in scope', (t) => {
    const { root } = fixture(t);
    const before = snapshot(root);
    fs.writeFileSync(path.join(root, 'tracked.ts'), 'export const count = 4;\n');
    fs.writeFileSync(path.join(root, 'committed.ts'), 'export const delivered = true;\n');
    git(root, 'add', '.');
    git(root, 'commit', '--quiet', '-m', 'Session work');
    const after = snapshot(root);
    assert.notEqual(after.head, before.head);
    assert.deepEqual(after.dirty, []);
    assert.deepEqual(changedFiles(before, after).sort(), ['committed.ts', 'tracked.ts']);
});

test('external writes after the initial snapshot invalidate the reviewed content', (t) => {
    const { root } = fixture(t);
    fs.writeFileSync(path.join(root, 'tracked.ts'), 'export const count = 5;\n');
    const before = snapshot(root);
    fs.writeFileSync(path.join(root, 'tracked.ts'), 'export const count = 6;\n');
    const after = snapshot(root);
    assert.notEqual(after.files['tracked.ts'], before.files['tracked.ts']);
    assert.deepEqual(changedFiles(before, after), ['tracked.ts']);
});

test('a staged change remains visible when the working copy equals the initial content', (t) => {
    const { root } = fixture(t);
    const original = fs.readFileSync(path.join(root, 'tracked.ts'));
    const before = snapshot(root);
    fs.writeFileSync(path.join(root, 'tracked.ts'), 'export const count = 7;\n');
    git(root, 'add', 'tracked.ts');
    fs.writeFileSync(path.join(root, 'tracked.ts'), original);
    assert.ok(changedFiles(before, snapshot(root)).includes('tracked.ts'));
});

test('symlinks are fingerprinted without following their target', (t) => {
    const { root, directory } = fixture(t);
    const target = path.join(directory, 'outside.txt');
    fs.writeFileSync(target, 'first target content');
    try {
        fs.symlinkSync(target, path.join(root, 'linked.txt'), 'file');
    } catch (error) {
        if (['EPERM', 'EACCES', 'ENOSYS'].includes(error.code)) {
            t.skip('Creating file symlinks is unavailable in this environment.');
            return;
        }
        throw error;
    }
    const before = snapshot(root);
    fs.writeFileSync(target, 'changed external target content');
    const after = snapshot(root);
    assert.ok(before.files['linked.txt']);
    assert.equal(after.files['linked.txt'], before.files['linked.txt']);
    assert.deepEqual(changedFiles(before, after), []);
});

test('reports accept pass, actionable findings and explicit incomplete status', () => {
    assert.doesNotThrow(() => validateReport(passReport(), ['src/main.ts']));
    assert.doesNotThrow(() =>
        validateReport({ ...passReport(), status: 'changes_requested', findings: [finding()] }, ['src/main.ts'])
    );
    assert.doesNotThrow(() =>
        validateReport({ ...passReport(), status: 'incomplete', limitations: ['API contract is unavailable.'] }, [
            'src/main.ts',
        ])
    );
});

test('pass cannot conceal findings or missing file coverage', () => {
    assert.throws(() => validateReport({ ...passReport(), findings: [finding()] }, ['src/main.ts']));
    assert.throws(() => validateReport(passReport(), ['src/main.ts', 'src/other.ts']));
    assert.throws(() => validateReport(passReport([]), ['src/main.ts']));
});

test('report fields and finding values are validated', () => {
    for (const key of Object.keys(passReport())) {
        const report = passReport();
        delete report[key];
        assert.throws(() => validateReport(report, ['src/main.ts']), `missing ${key}`);
    }
    for (const update of [
        { status: 'success' },
        { summary: 42 },
        { checked_files: 'src/main.ts' },
        { checked_files: [42] },
        { limitations: 'none' },
        { limitations: [42] },
        { findings: {} },
        { findings: [null] },
        { criteria: {} },
        { criteria: [null] },
        { criteria: [{ id: 1, status: 'fulfilled', evidence: 'src/main.ts:1' }] },
        { criteria: [{ id: 'AC1', status: 'unknown', evidence: 'src/main.ts:1' }] },
        { criteria: [{ id: 'AC1', status: 'fulfilled', evidence: '' }] },
    ]) {
        assert.throws(() => validateReport({ ...passReport(), ...update }, ['src/main.ts']), JSON.stringify(update));
    }
    for (const update of [
        { priority: 'P3' },
        { category: 'style' },
        { file: 42 },
        { line: 0 },
        { line: 1.5 },
        { problem: 42 },
        { fix: null },
    ]) {
        const report = { ...passReport(), status: 'changes_requested', findings: [{ ...finding(), ...update }] };
        assert.throws(() => validateReport(report, ['src/main.ts']), JSON.stringify(update));
    }
    assert.throws(() => validateReport(null, []));
    assert.throws(() => validateReport([], []));
});

test('a spec pass requires every criterion exactly once with fulfilled evidence', () => {
    const criterion = { id: 'AC1', status: 'fulfilled', evidence: 'src/main.ts:1 and focused check output.' };
    assert.doesNotThrow(() => validateReport({ ...passReport(), criteria: [criterion] }, ['src/main.ts'], ['AC1']));
    assert.throws(() => validateReport(passReport(), ['src/main.ts'], ['AC1']));
    assert.throws(() =>
        validateReport({ ...passReport(), criteria: [criterion, criterion] }, ['src/main.ts'], ['AC1'])
    );
    for (const status of ['partial', 'missing', 'unverified']) {
        const report = { ...passReport(), criteria: [{ ...criterion, status }] };
        assert.throws(() => validateReport(report, ['src/main.ts'], ['AC1']), status);
        assert.doesNotThrow(() => validateReport({ ...report, status: 'incomplete' }, ['src/main.ts'], ['AC1']));
    }
});

test('reviewer starts a fresh read-only context with hooks disabled', () => {
    const root = path.resolve(os.tmpdir(), 'проект с пробелами');
    const output = path.resolve(os.tmpdir(), 'review output.json');
    const args = reviewerArgs(root, output);
    const pair = (names, value) => args.some((arg, index) => names.includes(arg) && args[index + 1] === value);
    assert.ok(args.includes('exec'));
    assert.ok(pair(['-C', '--cd'], root));
    assert.ok(pair(['-s', '--sandbox'], 'read-only'));
    assert.ok(args.includes('--ephemeral'));
    assert.ok(pair(['-o', '--output-last-message'], output));
    assert.ok(
        pair(['--disable'], 'hooks') ||
            args.some(
                (arg, index) =>
                    ['-c', '--config'].includes(arg) &&
                    /^(?:features\.hooks|hooks\.enabled)\s*=\s*false$/.test(args[index + 1])
            )
    );
    for (const forbidden of ['resume', 'fork', '--last', '--yolo', '--dangerously-bypass-approvals-and-sandbox']) {
        assert.ok(!args.includes(forbidden), forbidden);
    }
});

test('MCP server overrides disable safe keys and reject dotted keys', () => {
    const args = reviewerArgs(os.tmpdir(), path.join(os.tmpdir(), 'report.json'), ['server_name', 'server-two', 'a7']);
    for (const key of ['server_name', 'server-two', 'a7']) {
        assert.ok(args.includes(`mcp_servers.${key}.enabled=false`));
    }
    assert.throws(() => reviewerArgs(os.tmpdir(), 'report.json', ['unsafe.key']), /incomplete/);
});

test('Git resolves to an absolute executable outside the checkout', () => {
    const binary = executable('git');
    assert.ok(path.isAbsolute(binary));
    const relative = path.relative(process.cwd(), path.dirname(binary));
    assert.ok(relative && (relative.startsWith('..') || path.isAbsolute(relative)));
    assert.ok(fs.statSync(binary).isFile());
});

const subprocessSource = `
const fs = require('node:fs');
const path = require('node:path');
const { main } = require(process.env.REVIEW_RUNNER_TEST_PATH);
const scenario = JSON.parse(process.argv[1]);
const metrics = { calls: [], maxInFlight: 0 };
let inFlight = 0;
let mutated = false;

if (scenario.replaceApproachAfterRead) {
    const originalRead = fs.readFileSync;
    fs.readFileSync = function (file, ...args) {
        const content = originalRead.call(fs, file, ...args);
        if (typeof file === 'string' && path.basename(file) === 'approach.json') {
            fs.readFileSync = originalRead;
            const previous = JSON.parse(content.toString());
            fs.writeFileSync(file, JSON.stringify({ ...previous, ...scenario.replaceApproachAfterRead }));
        }
        return content;
    };
}

async function fakeReviewer(root, output, prompt) {
    const role = prompt.match(/\\nROLE: ([a-z]+)\\n/)?.[1] || path.basename(output, '.json');
    const marker = 'REVIEW PACKET:\\n';
    const packet = JSON.parse(prompt.slice(prompt.indexOf(marker) + marker.length));
    metrics.calls.push({ role, files: packet.files, packet });
    inFlight += 1;
    metrics.maxInFlight = Math.max(metrics.maxInFlight, inFlight);
    try {
        await new Promise((resolve) => setTimeout(resolve, 15));
        if (role === 'plan' && scenario.replaceApproachDuringPlan) {
            const file = path.join(path.dirname(output), 'approach.json');
            const previous = JSON.parse(fs.readFileSync(file, 'utf8'));
            fs.writeFileSync(file, JSON.stringify({ ...previous, ...scenario.replaceApproachDuringPlan }));
        }
        if (!mutated && scenario.mutate === 'code') {
            const file = packet.phase === 'plan-review' ? 'tracked.ts' : packet.files[0];
            fs.appendFileSync(path.join(root, file), '\\nexport const external = true;\\n');
            mutated = true;
        }
        if (!mutated && scenario.mutate === 'plan') {
            fs.appendFileSync(packet.plan, '\\nA new implementation step.\\n');
            mutated = true;
        }
        if (!mutated && scenario.mutate === 'spec') {
            fs.appendFileSync(packet.spec, '\\nAC-2: Added during review.\\n');
            mutated = true;
        }
        if (!mutated && scenario.mutate === 'evidence') {
            fs.appendFileSync(packet.evidence, '\\nA check result changed during review.\\n');
            mutated = true;
        }
        if (scenario.throwRole === role) throw new Error('Injected reviewer failure');
        let report = {
            status: scenario.nonpassRole === role ? 'changes_requested' : 'pass',
            summary: 'AC-1 checked against implementation and evidence.',
            checked_files: packet.files,
            findings: [],
            criteria: role === 'spec' ? packet.criteria.map((id) => ({
                id, status: scenario.criterionStatus || 'fulfilled', evidence: 'Implementation and focused checks verified.',
            })) : [],
            limitations: [],
        };
        if (role === 'spec' && scenario.missingCriterion) report.criteria.shift();
        if (role === 'spec' && scenario.duplicateCriterion) report.criteria.push(report.criteria[0]);
        if (report.status === 'changes_requested') report.findings.push({
            priority: 'P1', category: 'security', file: packet.files[0], line: 1,
            problem: 'Injected reachable issue.', fix: 'Apply the minimal repair.',
        });
        if (scenario.malformedRole === role) report = { status: 'pass', findings: [] };
        fs.writeFileSync(output, JSON.stringify(report));
        return report;
    } finally {
        inFlight -= 1;
    }
}

main(scenario.args, fakeReviewer).catch((error) => {
    process.stderr.write(error.stack + '\\n');
    process.exitCode = 3;
}).finally(() => {
    fs.writeFileSync(path.join(process.env.CODEX_HOME, 'invocations.json'), JSON.stringify(metrics));
});
`;

function sessionFixture(t, beforeBegin, options = {}) {
    const context = fixture(t);
    const home = path.join(context.directory, 'codex-home');
    const spec = path.join(context.directory, 'spec.md');
    const evidence = path.join(context.directory, 'evidence.md');
    const plan = path.join(context.directory, 'plan.md');
    fs.mkdirSync(home);
    fs.writeFileSync(spec, 'AC-1: The implementation keeps the existing behavior.\n');
    fs.writeFileSync(evidence, 'Focused checks: passed in this isolated fixture.\n');
    fs.writeFileSync(plan, '1. Keep existing behavior with a minimal local change.\n2. Run focused checks.\n');
    const session = { ...context, home, spec, evidence, plan, id: 'stable-integration-session' };
    if (beforeBegin) beforeBegin(session);
    const beginArgs = ['begin', '--session', session.id];
    if (!options.noSpec) beginArgs.push('--spec', spec);
    const begin = runMain(session, beginArgs);
    assert.equal(begin.status, 0, begin.stderr);
    if (options.plan !== false) {
        const planned = planReview(session);
        assert.equal(planned.status, 0, planned.stderr);
        if (options.approve !== false) {
            const approved = approve(session);
            assert.equal(approved.status, 0, approved.stderr);
        }
    }
    return session;
}

function runMain(session, args, options = {}) {
    const result = spawnSync(process.execPath, ['-e', subprocessSource, JSON.stringify({ ...options, args })], {
        cwd: session.root,
        encoding: 'utf8',
        input: options.event && JSON.stringify(options.event),
        timeout: 60000,
        maxBuffer: 8 * 1024 * 1024,
        windowsHide: true,
        env: {
            ...process.env,
            CODEX_HOME: session.home,
            CODEX_QUALITY_REVIEW_ACTIVE: options.active ? '1' : '',
            CODEX_REVIEW_BIN: path.join(session.home, 'models-must-not-run.exe'),
            REVIEW_RUNNER_TEST_PATH: path.join(__dirname, 'review.cjs'),
        },
    });
    assert.equal(result.error, undefined, result.error?.message);
    const metrics = JSON.parse(fs.readFileSync(path.join(session.home, 'invocations.json'), 'utf8'));
    return { ...result, metrics };
}

function review(session, options = {}) {
    return runMain(session, ['review', '--session', session.id, '--evidence', session.evidence], options);
}

function planReview(session, options = {}) {
    return runMain(session, ['plan', '--session', session.id, '--plan', session.plan], options);
}

function approve(session, note = 'Fixture user reply: Согласен, реализуй') {
    return runMain(session, ['approve', '--session', session.id, '--approval-note', note]);
}

function prepareApprovedPlan(session) {
    const planned = planReview(session);
    assert.equal(planned.status, 0, planned.stderr);
    const approved = approve(session);
    assert.equal(approved.status, 0, approved.stderr);
}

function check(session) {
    return runMain(session, ['check', '--session', session.id]);
}

function sessionApproach(session) {
    const [file] = resultFiles(session.home, 'approach.json');
    assert.ok(file, 'the session has an approach record');
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function resultFiles(directory, name = 'result.json') {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const file = path.join(directory, entry.name);
        return entry.isDirectory() ? resultFiles(file, name) : entry.name === name ? [file] : [];
    });
}

function sessionResult(session) {
    const files = resultFiles(session.home);
    assert.equal(files.length, 1, 'one aggregate result per session');
    return JSON.parse(fs.readFileSync(files[0], 'utf8'));
}

function changeCode(session) {
    fs.writeFileSync(path.join(session.root, 'tracked.ts'), 'export const count = 2;\n');
}

function stop(session, active = false) {
    return runMain(session, ['hook'], {
        event: {
            hook_event_name: 'Stop',
            cwd: session.root,
            session_id: session.id,
            stop_hook_active: active,
        },
    });
}

function hookResponse(result) {
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim() ? JSON.parse(result.stdout) : {};
}

test('SDD review requires four independent roles and limits concurrency to two', (t) => {
    const session = sessionFixture(t);
    changeCode(session);
    const result = review(session);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.metrics.calls.map((call) => call.role).sort(), [
        'architect',
        'reviewer',
        'security',
        'spec',
    ]);
    assert.equal(result.metrics.maxInFlight, 2);
    assert.ok(result.metrics.calls.every((call) => call.files.includes('tracked.ts')));
    const saved = sessionResult(session);
    assert.equal(saved.status, 'pass');
    assert.equal(saved.isStale, false);
    assert.deepEqual(Object.keys(saved.reports).sort(), ['architect', 'reviewer', 'security', 'spec']);
    for (const role of saved.roles) {
        assert.equal(saved.reports[role].status, 'pass');
        assert.ok(fs.existsSync(path.join(saved.round, role + '.json')));
    }
});

test('an issue from one mandatory role blocks the aggregate pass', (t) => {
    const session = sessionFixture(t);
    changeCode(session);
    const result = review(session, { nonpassRole: 'security' });
    assert.equal(result.status, 2, result.stderr);
    const saved = sessionResult(session);
    assert.equal(saved.status, 'changes_requested');
    assert.equal(saved.reports.security.status, 'changes_requested');
    assert.equal(saved.reports.architect.status, 'pass');
    assert.equal(result.metrics.calls.length, 4);
});

test('a reviewer exception produces an incomplete result and exit 3', (t) => {
    const session = sessionFixture(t);
    changeCode(session);
    const result = review(session, { throwRole: 'reviewer' });
    assert.equal(result.status, 3, result.stderr);
    const saved = sessionResult(session);
    assert.equal(saved.status, 'incomplete');
    assert.equal(saved.reports.reviewer.status, 'incomplete');
    assert.match(saved.reports.reviewer.summary, /Injected reviewer failure/);
    assert.equal(result.metrics.calls.length, 4);
});

test('a malformed reviewer report cannot produce a pass', (t) => {
    const session = sessionFixture(t);
    changeCode(session);
    const result = review(session, { malformedRole: 'spec' });
    assert.equal(result.status, 3, result.stderr);
    const saved = sessionResult(session);
    assert.equal(saved.status, 'incomplete');
    assert.equal(saved.reports.spec.status, 'incomplete');
});

test('code changed during review invalidates all passing reports', (t) => {
    const session = sessionFixture(t);
    changeCode(session);
    const result = review(session, { mutate: 'code' });
    assert.equal(result.status, 3, result.stderr);
    const saved = sessionResult(session);
    assert.equal(saved.status, 'incomplete');
    assert.equal(saved.isStale, true);
    assert.ok(Object.values(saved.reports).every((report) => report.status === 'pass'));
});

test('spec changed during review invalidates all passing reports', (t) => {
    const session = sessionFixture(t);
    changeCode(session);
    const result = review(session, { mutate: 'spec' });
    assert.equal(result.status, 3, result.stderr);
    const saved = sessionResult(session);
    assert.equal(saved.status, 'incomplete');
    assert.equal(saved.isStale, true);
    assert.ok(Object.values(saved.reports).every((report) => report.status === 'pass'));
});

test('evidence changed during review invalidates all passing reports', (t) => {
    const session = sessionFixture(t);
    changeCode(session);
    const result = review(session, { mutate: 'evidence' });
    assert.equal(result.status, 3, result.stderr);
    const saved = sessionResult(session);
    assert.equal(saved.status, 'incomplete');
    assert.equal(saved.isStale, true);
    assert.ok(Object.values(saved.reports).every((report) => report.status === 'pass'));
});

for (const scenario of [
    { missingCriterion: true },
    { duplicateCriterion: true },
    { criterionStatus: 'partial' },
    { criterionStatus: 'unverified' },
]) {
    test(`a spec pass is rejected for ${JSON.stringify(scenario)}`, (t) => {
        const session = sessionFixture(t);
        changeCode(session);
        const result = review(session, scenario);
        assert.equal(result.status, 3, result.stderr);
        const saved = sessionResult(session);
        assert.equal(saved.status, 'incomplete');
        assert.equal(saved.reports.spec.status, 'incomplete');
        assert.equal(saved.reports.reviewer.status, 'pass');
    });
}

test('repeated begin retains the unfinished original baseline', (t) => {
    const session = sessionFixture(t);
    const [baselineFile] = resultFiles(session.home, 'baseline.json');
    const original = fs.readFileSync(baselineFile, 'utf8');
    changeCode(session);
    const repeated = runMain(session, ['begin', '--session', session.id, '--spec', session.spec]);
    assert.equal(repeated.status, 0, repeated.stderr);
    assert.match(repeated.stdout, /unfinished baseline retained/);
    assert.equal(fs.readFileSync(baselineFile, 'utf8'), original);
    assert.equal(review(session).status, 0);
    assert.ok(sessionResult(session).reports.reviewer.checked_files.includes('tracked.ts'));
});

for (const changedInput of ['spec', 'evidence']) {
    test(`repeated begin retains a previously passing baseline after ${changedInput} changes`, (t) => {
        const session = sessionFixture(t);
        changeCode(session);
        assert.equal(review(session).status, 0);
        const [baselineFile] = resultFiles(session.home, 'baseline.json');
        const [resultFile] = resultFiles(session.home);
        const originalBaseline = fs.readFileSync(baselineFile, 'utf8');
        const originalResult = fs.readFileSync(resultFile, 'utf8');
        fs.appendFileSync(
            session[changedInput],
            changedInput === 'spec' ? 'AC-2: New acceptance criterion.\n' : 'A validation result has changed.\n'
        );
        const repeated = runMain(session, ['begin', '--session', session.id, '--spec', session.spec]);
        assert.equal(repeated.status, 0, repeated.stderr);
        assert.match(repeated.stdout, /unfinished baseline retained/);
        assert.equal(fs.readFileSync(baselineFile, 'utf8'), originalBaseline);
        assert.equal(fs.readFileSync(resultFile, 'utf8'), originalResult);
        prepareApprovedPlan(session);
        const reviewed = review(session);
        assert.equal(reviewed.status, 0, reviewed.stderr);
        assert.equal(reviewed.metrics.calls.length, 4);
        assert.doesNotMatch(reviewed.stdout, /No file changes/);
        assert.ok(reviewed.metrics.calls.every((call) => call.files.includes('tracked.ts')));
    });
}

test('baseline archives preserve staged work and a deleted pre-existing untracked file', (t) => {
    const originalDraft = 'export const draft = "pre-existing";\n';
    const session = sessionFixture(t, (context) => {
        fs.writeFileSync(path.join(context.root, 'tracked.ts'), 'export const count = 11;\n');
        git(context.root, 'add', 'tracked.ts');
        fs.writeFileSync(path.join(context.root, 'tracked.ts'), 'export const count = 12;\n');
        fs.writeFileSync(path.join(context.root, 'old-draft.ts'), originalDraft);
    });
    fs.unlinkSync(path.join(session.root, 'old-draft.ts'));
    const result = review(session);
    assert.equal(result.status, 0, result.stderr);
    const saved = sessionResult(session);
    const packet = JSON.parse(fs.readFileSync(path.join(saved.round, 'packet.json'), 'utf8'));
    assert.deepEqual(packet.files, ['old-draft.ts']);
    assert.deepEqual(packet.preExistingDirty, ['old-draft.ts']);
    assert.equal(fs.readFileSync(packet.dirtyCopies['old-draft.ts'], 'utf8'), originalDraft);
    assert.ok(path.isAbsolute(packet.baselineArchive));
    assert.match(fs.readFileSync(path.join(packet.baselineArchive, 'index.patch'), 'utf8'), /count = 11/);
    assert.match(fs.readFileSync(path.join(packet.baselineArchive, 'working.patch'), 'utf8'), /count = 12/);
});

test('a tracked file named __proto__ remains in scope and review coverage', (t) => {
    const session = sessionFixture(t, (context) => {
        fs.writeFileSync(path.join(context.root, '__proto__'), 'original content\n');
        git(context.root, 'add', '__proto__');
        git(context.root, 'commit', '--quiet', '-m', 'Track special filename');
    });
    const before = snapshot(session.root);
    fs.writeFileSync(path.join(session.root, '__proto__'), 'changed content\n');
    assert.deepEqual(changedFiles(before, snapshot(session.root)), ['__proto__']);
    const result = review(session);
    assert.equal(result.status, 0, result.stderr);
    const saved = sessionResult(session);
    assert.equal(saved.status, 'pass');
    for (const report of Object.values(saved.reports)) assert.deepEqual(report.checked_files, ['__proto__']);
});

test('the inherited property name __proto__ cannot select a reviewer role', (t) => {
    const session = sessionFixture(t);
    changeCode(session);
    const result = runMain(session, [
        'review',
        '--session',
        session.id,
        '--evidence',
        session.evidence,
        '--roles',
        '__proto__',
    ]);
    assert.equal(result.status, 3, result.stderr);
    assert.match(result.stderr, /Unknown (?:final )?review role/);
    assert.deepEqual(result.metrics.calls, []);
});

test('the recursion guard prevents any nested reviewer invocation', (t) => {
    const session = sessionFixture(t);
    changeCode(session);
    const result = review(session, { active: true });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.metrics.calls, []);
    assert.deepEqual(resultFiles(session.home), []);
});

test('a session without code changes starts no reviewers', (t) => {
    const session = sessionFixture(t);
    const result = review(session);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.metrics.calls, []);
    assert.deepEqual(resultFiles(session.home), []);
    assert.match(result.stdout, /No file changes/);
});

test('Stop accepts a current pass and blocks stale code without a review loop', (t) => {
    const session = sessionFixture(t);
    changeCode(session);
    assert.equal(review(session).status, 0);
    const current = stop(session);
    assert.deepEqual(hookResponse(current), {});
    assert.deepEqual(current.metrics.calls, []);
    fs.appendFileSync(path.join(session.root, 'tracked.ts'), 'export const later = true;\n');
    const stale = stop(session);
    const block = hookResponse(stale);
    assert.equal(block.decision, 'block');
    assert.match(block.reason, /stale/);
    assert.deepEqual(stale.metrics.calls, []);
    const repeated = stop(session, true);
    const warning = hookResponse(repeated);
    assert.equal(warning.decision, undefined);
    assert.match(warning.systemMessage, /stale/);
    assert.deepEqual(repeated.metrics.calls, []);
});

test('Stop blocks a pass after its spec changes', (t) => {
    const session = sessionFixture(t);
    changeCode(session);
    assert.equal(review(session).status, 0);
    fs.appendFileSync(session.spec, 'AC-2: A new acceptance criterion.\n');
    const result = stop(session);
    assert.equal(hookResponse(result).decision, 'block');
    assert.deepEqual(result.metrics.calls, []);
});

for (const missing of ['spec', 'evidence', 'result']) {
    test(`Stop blocks ${missing} loss or corruption and avoids repeated blocking`, (t) => {
        const session = sessionFixture(t);
        changeCode(session);
        assert.equal(review(session).status, 0);
        if (missing === 'result') {
            const [file] = resultFiles(session.home);
            fs.writeFileSync(file, '{ invalid JSON');
        } else fs.unlinkSync(session[missing]);
        const first = stop(session);
        const block = hookResponse(first);
        assert.equal(block.decision, 'block');
        assert.match(block.reason, /unverified/);
        assert.deepEqual(first.metrics.calls, []);
        const repeated = stop(session, true);
        const warning = hookResponse(repeated);
        assert.equal(warning.decision, undefined);
        assert.match(warning.systemMessage, /unverified/);
        assert.deepEqual(repeated.metrics.calls, []);
    });
}

test('plan review uses one separate role and records the exact approval reply', (t) => {
    const session = sessionFixture(t, undefined, { plan: false });
    const planned = planReview(session);
    assert.equal(planned.status, 0, planned.stderr);
    assert.deepEqual(
        planned.metrics.calls.map((call) => call.role),
        ['plan']
    );
    const packet = planned.metrics.calls[0].packet;
    assert.deepEqual(packet.files, [session.plan]);
    assert.equal(packet.plan, session.plan);
    assert.equal(packet.spec, session.spec);
    assert.equal(packet.phase, 'plan-review');
    assert.equal(sessionApproach(session).status, 'awaiting_approval');
    const note = 'Да. Согласен с этим планом. Реализуй.';
    const approved = approve(session, note);
    assert.equal(approved.status, 0, approved.stderr);
    assert.deepEqual(approved.metrics.calls, []);
    assert.equal(sessionApproach(session).status, 'approved');
    assert.equal(sessionApproach(session).approvalNote, note);
});

for (const state of ['not_planned', 'awaiting_approval']) {
    test(`check and final review reject ${state} without starting final reviewers`, (t) => {
        const session = sessionFixture(t, undefined, { plan: state !== 'not_planned', approve: false });
        assert.equal(sessionApproach(session).status, state);
        for (const result of [check(session), review(session)]) {
            assert.equal(result.status, 3, result.stderr);
            assert.match(result.stderr, /approved approach/);
            assert.deepEqual(result.metrics.calls, []);
        }
    });
}

test('a failed plan review cannot be approved', (t) => {
    const session = sessionFixture(t, undefined, { plan: false });
    const planned = planReview(session, { nonpassRole: 'plan' });
    assert.equal(planned.status, 2, planned.stderr);
    assert.equal(sessionApproach(session).status, 'changes_requested');
    const approved = approve(session);
    assert.equal(approved.status, 3, approved.stderr);
    assert.match(approved.stderr, /missing, failed or stale/);
    assert.notEqual(sessionApproach(session).status, 'approved');
});

for (const changedInput of ['code', 'plan', 'spec']) {
    test(`${changedInput} mutation during plan review prevents approval`, (t) => {
        const session = sessionFixture(t, undefined, { plan: false });
        const planned = planReview(session, { mutate: changedInput });
        assert.equal(planned.status, 3, planned.stderr);
        assert.equal(sessionApproach(session).status, 'incomplete');
        assert.equal(sessionApproach(session).isStale, true);
        assert.equal(approve(session).status, 3);
        assert.equal(check(session).status, 3);
    });

    test(`${changedInput} mutation before approval invalidates the reviewed plan`, (t) => {
        const session = sessionFixture(t, undefined, { approve: false });
        if (changedInput === 'code') changeCode(session);
        else fs.appendFileSync(session[changedInput], '\nChanged before approval.\n');
        const approved = approve(session);
        assert.equal(approved.status, 3, approved.stderr);
        assert.match(approved.stderr, /missing, failed or stale/);
        assert.equal(check(session).status, 3);
    });
}

test('approved plan allows later implementation changes', (t) => {
    const session = sessionFixture(t);
    changeCode(session);
    const checked = check(session);
    assert.equal(checked.status, 0, checked.stderr);
    assert.deepEqual(checked.metrics.calls, []);
    assert.equal(sessionApproach(session).status, 'approved');
});

for (const changedInput of ['plan', 'spec']) {
    test(`${changedInput} changes after approval require a new reviewed approach`, (t) => {
        const session = sessionFixture(t);
        fs.appendFileSync(session[changedInput], '\nChanged after approval.\n');
        const checked = check(session);
        assert.equal(checked.status, 3, checked.stderr);
        assert.match(checked.stderr, /approved approach/);
        assert.deepEqual(checked.metrics.calls, []);
    });
}

test('replanning after partial implementation preserves the task baseline', (t) => {
    const session = sessionFixture(t);
    const [baselineFile] = resultFiles(session.home, 'baseline.json');
    const original = fs.readFileSync(baselineFile, 'utf8');
    const oldApproach = sessionApproach(session).id;
    changeCode(session);
    fs.appendFileSync(session.plan, '3. Verify the revised implementation.\n');
    prepareApprovedPlan(session);
    assert.equal(fs.readFileSync(baselineFile, 'utf8'), original);
    assert.notEqual(sessionApproach(session).id, oldApproach);
    assert.equal(check(session).status, 0);
    const reviewed = review(session);
    assert.equal(reviewed.status, 0, reviewed.stderr);
    assert.equal(reviewed.metrics.calls.length, 4);
    assert.ok(reviewed.metrics.calls.every((call) => call.files.includes('tracked.ts')));
});

test('Stop allows yielding for plan approval even when code files changed', (t) => {
    const session = sessionFixture(t, undefined, { approve: false });
    changeCode(session);
    const stopped = stop(session);
    const response = hookResponse(stopped);
    assert.equal(response.decision, undefined);
    assert.match(response.systemMessage, /Awaiting.*approval/);
    assert.deepEqual(stopped.metrics.calls, []);
    assert.equal(check(session).status, 3);
});

test('a new plan invalidates an old pass until approval and final review repeat', (t) => {
    const session = sessionFixture(t);
    changeCode(session);
    assert.equal(review(session).status, 0);
    const oldSignature = sessionResult(session).approvalSignature;
    assert.equal(planReview(session).status, 0);
    assert.equal(sessionApproach(session).status, 'awaiting_approval');
    assert.equal(check(session).status, 3);
    assert.equal(review(session).status, 3);
    const pending = hookResponse(stop(session));
    assert.equal(pending.decision, undefined);
    assert.match(pending.systemMessage, /Awaiting.*approval/);
    assert.equal(approve(session).status, 0);
    assert.equal(hookResponse(stop(session)).decision, 'block');
    assert.equal(review(session).status, 0);
    assert.notEqual(sessionResult(session).approvalSignature, oldSignature);
    assert.deepEqual(hookResponse(stop(session)), {});
});

test('editing the approved plan invalidates an old final pass', (t) => {
    const session = sessionFixture(t);
    changeCode(session);
    assert.equal(review(session).status, 0);
    fs.appendFileSync(session.plan, '3. A different implementation step.\n');
    assert.equal(check(session).status, 3);
    assert.equal(review(session).status, 3);
    assert.equal(hookResponse(stop(session)).decision, 'block');
});

test('a new baseline invalidates the old approved approach', (t) => {
    const session = sessionFixture(t);
    changeCode(session);
    assert.equal(review(session).status, 0);
    const oldApproach = sessionApproach(session).id;
    const begun = runMain(session, ['begin', '--session', session.id, '--spec', session.spec]);
    assert.equal(begun.status, 0, begun.stderr);
    assert.match(begun.stdout, /Review baseline:/);
    assert.equal(sessionApproach(session).status, 'not_planned');
    assert.notEqual(sessionApproach(session).id, oldApproach);
    assert.deepEqual(resultFiles(session.home), []);
    assert.equal(check(session).status, 3);
});

test('work without a spec still requires approval and runs three final roles', (t) => {
    const session = sessionFixture(t, undefined, { plan: false, noSpec: true });
    assert.equal(check(session).status, 3);
    assert.equal(review(session).status, 3);
    prepareApprovedPlan(session);
    changeCode(session);
    const reviewed = review(session);
    assert.equal(reviewed.status, 0, reviewed.stderr);
    assert.deepEqual(reviewed.metrics.calls.map((call) => call.role).sort(), ['architect', 'reviewer', 'security']);
    for (const call of reviewed.metrics.calls) {
        assert.equal(call.packet.spec, null);
        assert.equal(call.packet.approvedPlan, session.plan);
        assert.ok(call.packet.approvedPlanHash);
    }
    assert.equal(sessionResult(session).status, 'pass');
    assert.ok(sessionResult(session).approvalSignature);
});

test('approach race guard: approve preserves a newer state created after its initial read', (t) => {
    const session = sessionFixture(t, undefined, { approve: false });
    const replacement = { id: 'newer-concurrent-plan', status: 'awaiting_approval' };
    const approved = runMain(
        session,
        ['approve', '--session', session.id, '--approval-note', 'Fixture user reply: Approved.'],
        { replaceApproachAfterRead: replacement }
    );
    assert.equal(approved.status, 3, approved.stderr);
    assert.match(approved.stderr, /newer approach superseded/);
    assert.equal(sessionApproach(session).id, replacement.id);
    assert.equal(sessionApproach(session).status, replacement.status);
    assert.equal(sessionApproach(session).approvalNote, undefined);
    assert.deepEqual(approved.metrics.calls, []);
});

test('approach race guard: an existing lock prevents approval and remains owned by its creator', (t) => {
    const session = sessionFixture(t, undefined, { approve: false });
    const [approachFile] = resultFiles(session.home, 'approach.json');
    const original = fs.readFileSync(approachFile, 'utf8');
    const lockFile = approachFile + '.lock';
    fs.writeFileSync(lockFile, 'owned by another command');
    const approved = approve(session);
    assert.equal(approved.status, 3, approved.stderr);
    assert.match(approved.stderr, /EEXIST/);
    assert.equal(fs.readFileSync(approachFile, 'utf8'), original);
    assert.equal(fs.readFileSync(lockFile, 'utf8'), 'owned by another command');
    assert.deepEqual(approved.metrics.calls, []);
});

test('approach race guard: an older plan review cannot overwrite a newer pending plan', (t) => {
    const session = sessionFixture(t, undefined, { plan: false });
    const replacement = { id: 'newer-plan-during-review', status: 'awaiting_approval' };
    const planned = planReview(session, { replaceApproachDuringPlan: replacement });
    assert.equal(planned.status, 3, planned.stderr);
    assert.match(planned.stderr, /newer plan superseded/);
    assert.equal(sessionApproach(session).id, replacement.id);
    assert.equal(sessionApproach(session).status, replacement.status);
    assert.equal(planned.metrics.calls.length, 1);
    assert.equal(planned.metrics.calls[0].role, 'plan');
});

test('begin race guard: a superseded begin preserves the active baseline and result', (t) => {
    const session = sessionFixture(t);
    changeCode(session);
    assert.equal(review(session).status, 0);
    const [baselineFile] = resultFiles(session.home, 'baseline.json');
    const [resultFile] = resultFiles(session.home);
    const originalBaseline = fs.readFileSync(baselineFile, 'utf8');
    const originalResult = fs.readFileSync(resultFile, 'utf8');
    const replacement = { id: 'newer-pending-plan-before-begin', status: 'awaiting_approval' };
    const begun = runMain(session, ['begin', '--session', session.id, '--spec', session.spec], {
        replaceApproachAfterRead: replacement,
    });
    assert.equal(begun.status, 3, begun.stderr);
    assert.match(begun.stderr, /newer approach superseded/);
    assert.equal(fs.readFileSync(baselineFile, 'utf8'), originalBaseline);
    assert.equal(fs.readFileSync(resultFile, 'utf8'), originalResult);
    assert.equal(sessionApproach(session).id, replacement.id);
    assert.equal(sessionApproach(session).status, replacement.status);
    assert.deepEqual(begun.metrics.calls, []);
});
