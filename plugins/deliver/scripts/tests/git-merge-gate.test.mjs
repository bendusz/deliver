// deliver's git-level ship gate: git-hook-install.mjs writes the shims, git runs
// git-merge-gate.mjs from pre-merge-commit (and from pre-commit during a merge), and judgeMerge()
// gives the verdict. Real git in temp repositories, with the hook installed by installGitHook().
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { newProj, runHook, gitIn, tmpDir, HOOKS_DIR } from './helpers.mjs';

const { installGitHook, shim, MARKER, GATE } = await import(path.join(HOOKS_DIR, 'git-hook-install.mjs'));
const { judgeMerge } = await import(path.join(HOOKS_DIR, 'require-verified.mjs'));

const BRANCH = 'pm/S1-1-fix';
const STORY = path.join('docs', 'stories', 'S1-1-fix.md');
const CLAIM = { owner: 'casey', builder: 'expert-builder', branch: BRANCH, status: 'claimed', tier: 'T0', rounds: 0, retries: 0, deliver: '0.29.0', updated: '2026-10-24 10:00' };
const lines = (tag) => Array.from({ length: 10 }, (_, i) => `line ${i + 1} ${tag}`).join('\n') + '\n';
const storyText = (exec) => [
  '# S1-1: fix',
  `<!-- pm-meta: ${JSON.stringify({ builder: 'expert-builder', touches: ['src'] })} -->`,
  '',
  '## Execution',
  `<!-- pm-exec: ${JSON.stringify(exec)} -->`,
  '',
].join('\n');

// The sh-dependent cases need a POSIX sh on PATH; git for Windows ships one, but a bare Windows
// PATH may not expose it. The process-substitution case needs bash.
const HAS_SH = spawnSync('sh', ['-c', 'exit 0'], { windowsHide: true }).status === 0;
const HAS_BASH = spawnSync('bash', ['-c', 'cat <(printf ok)'], { windowsHide: true, encoding: 'utf8' }).stdout === 'ok';
const NO_SH = !HAS_SH && 'no POSIX sh on PATH';

// env(extra): the environment git and sh run with: node on PATH for the shim, no kill switch.
function env(extra = {}) {
  const e = { ...process.env };
  delete e.DELIVER_NO_ENFORCE;
  delete e.CLAUDE_PROJECT_DIR;
  e.PATH = `${path.dirname(process.execPath)}${path.delimiter}${e.PATH ?? ''}`;
  return Object.assign(e, extra);
}
const sh = (cwd, command, extra, shell = 'sh') => spawnSync(shell, ['-c', command], { cwd, env: env(extra), encoding: 'utf8', windowsHide: true });
const gitRun = (cwd, args, extra) => spawnSync('git', args, { cwd, env: env(extra), encoding: 'utf8', windowsHide: true });

// project({ verified }): an approved project on main with a claim, a story branch with one code
// commit, the verdict recorded when verified, the gate installed, and main checked out.
function project({ verified = false } = {}) {
  const p = newProj(true);
  gitIn(p, ['branch', '-M', 'main']);
  fs.writeFileSync(path.join(p, STORY), storyText(CLAIM));
  fs.writeFileSync(path.join(p, 'src', 'fix.js'), lines('base'));
  gitIn(p, ['add', STORY, 'src/fix.js']);
  gitIn(p, ['commit', '-qm', 'chore(S1-1): claim']);
  gitIn(p, ['checkout', '-qb', BRANCH]);
  fs.writeFileSync(path.join(p, 'src', 'fix.js'), lines('base').replace('line 1 base', 'line 1 fixed'));
  gitIn(p, ['commit', '-qam', 'build(S1-1): fix']);
  const code = gitIn(p, ['rev-parse', 'HEAD']).trim();
  fs.writeFileSync(path.join(p, STORY), storyText({ ...CLAIM, status: 'in-review', ...(verified ? { verifier: `PASS ${code}` } : {}) }));
  gitIn(p, ['commit', '-qam', 'chore(S1-1): record']);
  gitIn(p, ['checkout', '-q', 'main']);
  const r = installGitHook(p);
  assert.equal(r.ok, true, JSON.stringify(r));
  return p;
}

const head = (p, ref = 'main') => gitIn(p, ['rev-parse', ref]).trim();
const merging = (p) => gitRun(p, ['rev-parse', '-q', '--verify', 'MERGE_HEAD']).status === 0;

// refused(p, before, r): git refused the merge commit: main did not move, and the merge is left in
// progress for git merge --abort.
function refused(p, before, r, label) {
  assert.equal(head(p), before, `${label}: main moved\n${r.stderr}`);
  assert.ok(merging(p), `${label}: no merge in progress\n${r.stdout}${r.stderr}`);
  gitIn(p, ['merge', '--abort']);
}

test('git gate: install writes marked shims and sets mergeoptions --no-ff, idempotently', () => {
  const p = project();
  for (const name of ['pre-merge-commit', 'pre-commit']) {
    const file = path.join(p, '.git', 'hooks', name);
    const text = fs.readFileSync(file, 'utf8');
    assert.ok(text.startsWith('#!/bin/sh\n'));
    assert.ok(text.includes(MARKER));
    assert.ok(text.includes(`exec node "${GATE.replace(/\\/g, '/')}" "$@"`));
    if (process.platform !== 'win32') assert.ok(fs.statSync(file).mode & 0o111, `${name} is executable`);
  }
  assert.equal(gitIn(p, ['config', '--get', 'branch.main.mergeoptions']).trim(), '--no-ff');
  const again = installGitHook(p);
  assert.deepEqual(again.hooks, { 'pre-merge-commit': 'current', 'pre-commit': 'current' });
  assert.deepEqual(again.branches, { main: 'current' });
  // A new plugin path refreshes the marked shim.
  const moved = installGitHook(p, { gate: '/opt/deliver 0.29.1/hooks/git-merge-gate.mjs' });
  assert.equal(moved.hooks['pre-merge-commit'], 'refreshed');
  assert.match(fs.readFileSync(path.join(p, '.git', 'hooks', 'pre-merge-commit'), 'utf8'), /exec node "\/opt\/deliver 0\.29\.1\/hooks\/git-merge-gate\.mjs" "\$@"/);
  assert.equal(installGitHook(p, { check: true }).hooks['pre-merge-commit'], 'stale');
  assert.equal(installGitHook(p).hooks['pre-merge-commit'], 'refreshed');
});

test('git gate: an unverified story merged with a plain git merge is refused by git', () => {
  const p = project();
  const before = head(p);
  const r = gitRun(p, ['merge', BRANCH, '-m', 'feat(S1-1): fix']);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /deliver blocked this merge commit: pm\/S1-1-fix: .*no verifier verdict/);
  refused(p, before, r, 'plain merge');
});

test('git gate: a verified story merges, as a merge commit', () => {
  const p = project({ verified: true });
  const r = gitRun(p, ['merge', BRANCH, '-m', 'feat(S1-1): fix']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(gitIn(p, ['rev-list', '--parents', '-n', '1', 'main']).trim().split(' ').length, 3);
});

test('git gate: the shell forms that defeated the Bash hook are refused by git', { skip: NO_SH }, () => {
  const p = project();
  const before = head(p);
  const forms = [
    `if false; then git switch ${BRANCH}; fi; git merge ${BRANCH} -m m`,
    `git merge ${BRANCH} -m m > /dev/null 2>&1`,
    `git merge ${BRANCH} -m m 2>/dev/null </dev/null`,
    `true || git checkout ${BRANCH}; GIT_EDITOR=true git merge ${BRANCH}`,
  ];
  for (const form of forms) {
    const r = sh(p, form);
    assert.notEqual(r.status, 0, form);
    refused(p, before, r, form);
  }
});

test('git gate: -F <(printf m) is refused by git', { skip: !HAS_BASH && 'no bash for process substitution' }, () => {
  const p = project();
  const before = head(p);
  const r = sh(p, `git merge --no-ff -F <(printf m) ${BRANCH}`, {}, 'bash');
  assert.notEqual(r.status, 0, r.stderr);
  refused(p, before, r, '-F <(...)');
});

test('git gate: a single-branch fetch then git merge FETCH_HEAD is refused by git', { skip: NO_SH }, () => {
  const p = project();
  const c = tmpDir('pmclone-');
  gitIn(c, ['clone', '-q', '--single-branch', '--branch', 'main', p, '.']);
  gitIn(c, ['config', 'user.email', 'casey@example.com']);
  gitIn(c, ['config', 'user.name', 'Casey Example']);
  assert.equal(installGitHook(c).ok, true);
  const before = head(c);
  const r = sh(c, `git fetch -q origin ${BRANCH} && git merge FETCH_HEAD -m m`);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /pm\/S1-1-fix: .*no verifier verdict/);
  refused(c, before, r, 'FETCH_HEAD');
});

test('git gate: a conflicted merge committed by hand is judged by the pre-commit shim', () => {
  const p = project();
  fs.writeFileSync(path.join(p, 'src', 'fix.js'), lines('base').replace('line 1 base', 'line 1 other'));
  gitIn(p, ['commit', '-qam', 'other change']);
  const before = head(p);
  assert.notEqual(gitRun(p, ['merge', BRANCH, '-m', 'm']).status, 0);
  gitIn(p, ['checkout', '--theirs', 'src/fix.js']);
  gitIn(p, ['add', 'src/fix.js']);
  const r = gitRun(p, ['commit', '--no-edit']);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /deliver blocked this merge commit/);
  refused(p, before, r, 'git commit');
  // An ordinary commit is untouched.
  fs.writeFileSync(path.join(p, 'src', 'other.js'), 'x\n');
  gitIn(p, ['add', 'src/other.js']);
  assert.equal(gitRun(p, ['commit', '-qm', 'chore: other']).status, 0);
});

test('git gate: the kill switch lets the merge through', () => {
  const p = project();
  const r = gitRun(p, ['merge', BRANCH, '-m', 'm'], { DELIVER_NO_ENFORCE: '1' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(judgeMerge(p, { target: 'main', commits: [head(p, BRANCH)] }).allow, true);
});

test('git gate: a repository that is not a deliver project is unaffected', () => {
  const d = tmpDir('plain-');
  gitIn(d, ['init', '-q', '-b', 'main']);
  gitIn(d, ['config', 'user.email', 'casey@example.com']);
  gitIn(d, ['config', 'user.name', 'Casey Example']);
  fs.writeFileSync(path.join(d, 'a.txt'), 'a\n');
  gitIn(d, ['add', 'a.txt']);
  gitIn(d, ['commit', '-qm', 'a']);
  gitIn(d, ['checkout', '-qb', 'pm/x']);
  fs.writeFileSync(path.join(d, 'b.txt'), 'b\n');
  gitIn(d, ['add', 'b.txt']);
  gitIn(d, ['commit', '-qm', 'b']);
  gitIn(d, ['checkout', '-q', 'main']);
  const r0 = installGitHook(d);
  assert.equal(r0.project, false);
  assert.equal(fs.existsSync(path.join(d, '.git', 'hooks', 'pre-merge-commit')), false);
  // Even with the shim in place, the gate stays out of a repository with no deliver project.
  fs.writeFileSync(path.join(d, '.git', 'hooks', 'pre-merge-commit'), shim(GATE), { mode: 0o755 });
  const r = gitRun(d, ['merge', '--no-ff', 'pm/x', '-m', 'm']);
  assert.equal(r.status, 0, r.stderr);
});

test('git gate: a merge into a branch that is no integration branch is not judged', () => {
  const p = project();
  gitIn(p, ['checkout', '-qb', 'scratch']);
  const r = gitRun(p, ['merge', '--no-ff', BRANCH, '-m', 'm']);
  assert.equal(r.status, 0, r.stderr);
});

test('git gate: an existing foreign pre-merge-commit is never overwritten, and is reported', () => {
  const p = newProj(true);
  gitIn(p, ['branch', '-M', 'main']);
  const file = path.join(p, '.git', 'hooks', 'pre-merge-commit');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '#!/bin/sh\necho mine\n', { mode: 0o755 });
  const r = installGitHook(p);
  assert.equal(r.ok, false);
  assert.equal(r.hooks['pre-merge-commit'], 'foreign');
  assert.equal(r.hooks['pre-commit'], 'installed');
  assert.match(r.notes.join('\n'), /pre-merge-commit exists and is not deliver's/);
  assert.equal(fs.readFileSync(file, 'utf8'), '#!/bin/sh\necho mine\n');
  // The session-start context says so, and still leaves the file alone.
  const s = runHook('session-context.mjs', { cwd: p });
  assert.equal(s.status, 0);
  assert.match(s.stdout, /merge gate: .*pre-merge-commit exists and is not deliver's/);
  assert.equal(fs.readFileSync(file, 'utf8'), '#!/bin/sh\necho mine\n');
  // The install CLI reports it with a non-zero exit.
  const cli = spawnSync(process.execPath, [path.join(HOOKS_DIR, 'git-hook-install.mjs'), p], { encoding: 'utf8', env: env() });
  assert.equal(cli.status, 1);
  assert.match(cli.stdout, /hook pre-merge-commit: foreign/);
});

test('git gate: session start installs the gate in a deliver project', () => {
  const p = newProj(true);
  gitIn(p, ['branch', '-M', 'main']);
  const s = runHook('session-context.mjs', { cwd: p });
  assert.equal(s.status, 0);
  assert.doesNotMatch(s.stdout, /merge gate/);
  assert.ok(fs.readFileSync(path.join(p, '.git', 'hooks', 'pre-merge-commit'), 'utf8').includes(MARKER));
  assert.equal(gitIn(p, ['config', '--get', 'branch.main.mergeoptions']).trim(), '--no-ff');
  const cli = spawnSync(process.execPath, [path.join(HOOKS_DIR, 'git-hook-install.mjs'), '--check', p], { encoding: 'utf8', env: env() });
  assert.equal(cli.status, 0, cli.stdout + cli.stderr);
});

test('git gate: core.hooksPath is honoured, and a user mergeoptions without --no-ff is reported, not changed', () => {
  const p = newProj(true);
  gitIn(p, ['branch', '-M', 'main']);
  gitIn(p, ['config', 'core.hooksPath', '.githooks']);
  gitIn(p, ['config', 'branch.main.mergeoptions', '--ff-only']);
  const r = installGitHook(p);
  assert.ok(fs.readFileSync(path.join(p, '.githooks', 'pre-merge-commit'), 'utf8').includes(MARKER));
  assert.equal(r.branches.main, 'conflict');
  assert.match(r.notes.join('\n'), /branch\.main\.mergeoptions is "--ff-only"/);
  assert.equal(gitIn(p, ['config', '--get', 'branch.main.mergeoptions']).trim(), '--ff-only');
});

test('git gate: the integration branch the committed plan names gets mergeoptions', () => {
  const p = newProj(true);
  gitIn(p, ['branch', '-M', 'main']);
  fs.writeFileSync(path.join(p, 'docs', 'plan.md'), '# Plan\n\n- Integration branch: `develop`\n');
  gitIn(p, ['add', 'docs/plan.md']);
  gitIn(p, ['commit', '-qm', 'plan']);
  gitIn(p, ['branch', 'develop']);
  const r = installGitHook(p);
  assert.deepEqual(Object.keys(r.branches), ['develop']);
  assert.equal(gitIn(p, ['config', '--get', 'branch.develop.mergeoptions']).trim(), '--no-ff');
});

// --- the PreToolUse hook closes the gate's own bypass ---

const bash = (cwd, command) => runHook('require-verified.mjs', { tool_name: 'Bash', cwd, tool_input: { command } });

test('git gate: git merge --no-verify of a story is blocked by the PreToolUse hook', () => {
  const p = project({ verified: true });
  const r = bash(p, `git merge --no-verify ${BRANCH} -m m`);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /--no-verify skips deliver's merge gate/);
  assert.equal(bash(p, `git merge ${BRANCH} -m m`).status, 0);
});

test('git gate: git commit --no-verify of an in-progress story merge is blocked by the PreToolUse hook', () => {
  const p = project();
  gitRun(p, ['merge', '--no-commit', BRANCH]);
  assert.ok(merging(p));
  const r = bash(p, 'git commit --no-verify -m m');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /--no-verify skips deliver's merge gate/);
  gitIn(p, ['merge', '--abort']);
  assert.equal(bash(p, 'git commit --no-verify -m m').status, 0);
});

test('git gate: a deliver project in a subdirectory of a monorepo is found and judged', () => {
  const m = tmpDir('mono-');
  gitIn(m, ['init', '-q', '-b', 'main']);
  gitIn(m, ['config', 'user.email', 'casey@example.com']);
  gitIn(m, ['config', 'user.name', 'Casey Example']);
  const app = path.join(m, 'apps', 'todo');
  fs.mkdirSync(path.join(app, 'docs', 'stories'), { recursive: true });
  fs.mkdirSync(path.join(app, 'src'), { recursive: true });
  fs.writeFileSync(path.join(app, 'docs', 'approval.json'), '{"status":"approved"}\n');
  fs.writeFileSync(path.join(app, STORY), storyText(CLAIM));
  fs.writeFileSync(path.join(app, 'src', 'fix.js'), 'a\n');
  gitIn(m, ['add', '.']);
  gitIn(m, ['commit', '-qm', 'claim']);
  gitIn(m, ['checkout', '-qb', BRANCH]);
  fs.writeFileSync(path.join(app, 'src', 'fix.js'), 'b\n');
  gitIn(m, ['commit', '-qam', 'fix']);
  gitIn(m, ['checkout', '-q', 'main']);
  assert.equal(installGitHook(app).ok, true);
  const before = head(m);
  const r = gitRun(m, ['merge', BRANCH, '-m', 'm']);
  assert.match(r.stderr, /pm\/S1-1-fix: .*apps\/todo\/docs\/stories\/S1-1-fix\.md records no verifier verdict/);
  refused(m, before, r, 'monorepo');
});

test('git gate: judgeMerge refuses a commit short of a story tip and ignores what main holds', () => {
  const p = project();
  const short = head(p, `${BRANCH}~1`);
  const v = judgeMerge(p, { target: 'main', commits: [short] });
  assert.equal(v.allow, false);
  assert.match(v.reason, /short of its tip/);
  assert.deepEqual(judgeMerge(p, { target: 'main', commits: [head(p, 'main~1')] }).allow, true);
  assert.equal(judgeMerge(p, { target: 'pm/S1-1-fix', commits: [head(p, BRANCH)] }).allow, true);
  assert.equal(judgeMerge(p, { target: 'main', commits: [head(p, BRANCH)] }).story, true);
});
