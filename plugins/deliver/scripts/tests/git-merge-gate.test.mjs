// deliver's git-level ship gate: git-hook-install.mjs writes a reference-transaction shim (or, below
// git 2.28, pre-merge-commit and pre-commit shims), git runs git-merge-gate.mjs, and judgeRefUpdate()
// or judgeMerge() gives the verdict. Real git in temp repositories, installed by installGitHook().
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { newProj, runHook, gitIn, tmpDir, HOOKS_DIR } from './helpers.mjs';

const { installGitHook, shim, MARKER, GATE, RT_HOOK } = await import(path.join(HOOKS_DIR, 'git-hook-install.mjs'));
const { judgeMerge, judgeRefUpdate } = await import(path.join(HOOKS_DIR, 'require-verified.mjs'));

const BRANCH = 'pm/S1-1-fix';
const STORY = 'docs/stories/S1-1-fix.md';
const INSTALL = path.join(HOOKS_DIR, 'git-hook-install.mjs');
const WIN = process.platform === 'win32';
const claimFor = (id) => ({ owner: 'casey', builder: 'expert-builder', branch: `pm/${id}`, status: 'claimed', tier: 'T0', rounds: 0, retries: 0, deliver: '0.29.0', updated: '2026-10-24 10:00' });
const lines = (tag) => Array.from({ length: 10 }, (_, i) => `line ${i + 1} ${tag}`).join('\n') + '\n';
const storyText = (exec) => [
  `# ${exec.branch}`,
  `<!-- pm-meta: ${JSON.stringify({ builder: 'expert-builder', touches: ['src'] })} -->`,
  '',
  '## Execution',
  `<!-- pm-exec: ${JSON.stringify(exec)} -->`,
  '',
].join('\n');

// The sh-dependent cases need a POSIX sh on PATH; the process-substitution case needs bash.
const HAS_SH = spawnSync('sh', ['-c', 'exit 0'], { windowsHide: true }).status === 0;
const HAS_BASH = spawnSync('bash', ['-c', 'cat <(printf ok)'], { windowsHide: true, encoding: 'utf8' }).stdout === 'ok';
const NO_SH = !HAS_SH && 'no POSIX sh on PATH';

function env(extra = {}) {
  const e = { ...process.env };
  delete e.DELIVER_NO_ENFORCE;
  delete e.CLAUDE_PROJECT_DIR;
  return Object.assign(e, { GIT_EDITOR: 'true' }, extra);
}
const sh = (cwd, command, extra, shell = 'sh') => spawnSync(shell, ['-c', command], { cwd, env: env(extra), encoding: 'utf8', windowsHide: true });
const gitRun = (cwd, args, extra) => spawnSync('git', args, { cwd, env: env(extra), encoding: 'utf8', windowsHide: true });
const head = (p, ref = 'main') => gitIn(p, ['rev-parse', ref]).trim();
const merging = (p) => gitRun(p, ['rev-parse', '-q', '--verify', 'MERGE_HEAD']).status === 0;
const commitFile = (p, rel, text, msg) => { fs.mkdirSync(path.dirname(path.join(p, rel)), { recursive: true }); fs.writeFileSync(path.join(p, rel), text); gitIn(p, ['add', rel]); gitIn(p, ['commit', '-qm', msg]); };

// project(stories, { install }): an approved project whose main claims each story, a story branch
// per story with one code commit (the first edits src/fix.js line 1, the others add src/<id>.js),
// the verdict recorded when verified, main checked out, and the gate installed.
function project(stories = [{ id: 'S1-1-fix' }], { install = true } = {}) {
  const p = newProj(true);
  gitIn(p, ['branch', '-M', 'main']);
  for (const s of stories) fs.writeFileSync(path.join(p, 'docs', 'stories', `${s.id}.md`), storyText(claimFor(s.id)));
  fs.writeFileSync(path.join(p, 'src', 'fix.js'), lines('base'));
  gitIn(p, ['add', '-A']);
  gitIn(p, ['commit', '-qm', 'chore: claim']);
  stories.forEach((s, i) => {
    gitIn(p, ['checkout', '-qb', `pm/${s.id}`, 'main']);
    if (i === 0) fs.writeFileSync(path.join(p, 'src', 'fix.js'), lines('base').replace('line 1 base', 'line 1 fixed'));
    else fs.writeFileSync(path.join(p, 'src', `${s.id}.js`), `${s.id}\n`);
    gitIn(p, ['add', '-A']);
    gitIn(p, ['commit', '-qm', `build(${s.id}): code`]);
    const code = head(p, 'HEAD');
    fs.writeFileSync(path.join(p, 'docs', 'stories', `${s.id}.md`), storyText({ ...claimFor(s.id), status: 'in-review', ...(s.verified ? { verifier: `PASS ${code}` } : {}) }));
    gitIn(p, ['commit', '-qam', `chore(${s.id}): record`]);
  });
  gitIn(p, ['checkout', '-q', 'main']);
  if (install) {
    const r = installGitHook(p);
    assert.equal(r.ok, true, JSON.stringify(r));
  }
  return p;
}
const verified = (opts) => project([{ id: 'S1-1-fix', verified: true }], opts);

// refused(p, before, r, label): git refused the update: main did not move.
function refused(p, before, r, label) {
  assert.notEqual(r.status, 0, `${label}: git exited 0\n${r.stdout}${r.stderr}`);
  assert.equal(head(p), before, `${label}: main moved\n${r.stderr}`);
  assert.match(r.stderr, /deliver blocked/, label);
}
// clean(p): leave no merge, rebase, or dirty tree behind.
function clean(p) {
  if (merging(p)) gitIn(p, ['merge', '--abort']);
  gitRun(p, ['rebase', '--abort']);
  gitRun(p, ['checkout', '-q', '-f', 'main']);
  gitIn(p, ['reset', '-q', '--hard']);
}

// --- install ---

test('git gate: install writes a marked reference-transaction shim with the node and integration branches baked in, and no merge options', () => {
  const p = project();
  const file = path.join(p, '.git', 'hooks', RT_HOOK);
  const text = fs.readFileSync(file, 'utf8');
  assert.equal(text.split('\n')[1], MARKER);
  assert.ok(text.includes(`node="${process.execPath.replace(/\\/g, '/')}"`));
  assert.ok(text.includes(`gate="${GATE.replace(/\\/g, '/')}"`));
  assert.match(text, /case "\$ref" in "refs\/heads\/main"\)/);
  if (!WIN) assert.ok(fs.statSync(file).mode & 0o111);
  assert.equal(fs.existsSync(path.join(p, '.git', 'hooks', 'pre-merge-commit')), false);
  assert.equal(gitRun(p, ['config', '--get', 'branch.main.mergeoptions']).status, 1);
  assert.ok(fs.existsSync(path.join(p, '.git', 'deliver', RT_HOOK)), 'the private copy');
  assert.deepEqual(installGitHook(p).hooks, { [RT_HOOK]: 'current' });
  assert.equal(installGitHook(p, { gate: '/opt/deliver 0.29.1/hooks/git-merge-gate.mjs' }).hooks[RT_HOOK], 'refreshed');
  assert.equal(installGitHook(p).hooks[RT_HOOK], 'refreshed');
});

test('git gate: the v1 pre-merge-commit shim and the mergeoptions it set are removed', () => {
  const p = project([{ id: 'S1-1-fix' }], { install: false });
  const v1 = path.join(p, '.git', 'hooks', 'pre-merge-commit');
  fs.writeFileSync(v1, '#!/bin/sh\n# deliver-merge-gate v1\nexec node "/x/git-merge-gate.mjs" "$@"\n', { mode: 0o755 });
  gitIn(p, ['config', 'branch.main.mergeoptions', '--no-ff']);
  const r = installGitHook(p);
  assert.equal(r.ok, true);
  assert.equal(r.hooks['pre-merge-commit'], 'removed');
  assert.equal(fs.existsSync(v1), false);
  assert.equal(gitRun(p, ['config', '--get', 'branch.main.mergeoptions']).status, 1);
});

// --- every way to move the integration branch ---

test('git gate: an unverified story reaching main by any route is refused', () => {
  const routes = [
    ['merge --no-ff', (p) => gitRun(p, ['merge', '--no-ff', BRANCH, '-m', 'm'])],
    ['merge --ff', (p) => gitRun(p, ['merge', '--ff', BRANCH])],
    ['merge --ff-only', (p) => gitRun(p, ['merge', '--ff-only', BRANCH])],
    ['reset --hard', (p) => gitRun(p, ['reset', '--hard', BRANCH])],
    ['update-ref', (p) => gitRun(p, ['update-ref', 'refs/heads/main', BRANCH])],
    ['branch -f from elsewhere', (p) => { gitIn(p, ['checkout', '-q', BRANCH]); return gitRun(p, ['branch', '-f', 'main', BRANCH]); }],
    ['rebase', (p) => { commitFile(p, 'docs/notes.md', 'n\n', 'docs: notes'); return gitRun(p, ['rebase', BRANCH]); }],
    ['conflicted merge, git commit', (p) => {
      commitFile(p, 'src/fix.js', lines('base').replace('line 1 base', 'line 1 other'), 'other');
      assert.notEqual(gitRun(p, ['merge', BRANCH, '-m', 'm']).status, 0);
      gitIn(p, ['checkout', '--theirs', 'src/fix.js']);
      gitIn(p, ['add', 'src/fix.js']);
      return gitRun(p, ['commit', '--no-edit']);
    }],
    ['conflicted merge, merge --continue', (p) => {
      commitFile(p, 'src/fix.js', lines('base').replace('line 1 base', 'line 1 other'), 'other');
      assert.notEqual(gitRun(p, ['merge', BRANCH, '-m', 'm']).status, 0);
      gitIn(p, ['checkout', '--theirs', 'src/fix.js']);
      gitIn(p, ['add', 'src/fix.js']);
      return gitRun(p, ['merge', '--continue']);
    }],
  ];
  for (const [label, run] of routes) {
    const p = project();
    const before = label === 'rebase' || label.startsWith('conflicted') ? null : head(p);
    const r = run(p);
    refused(p, before ?? head(p), r, label);
  }
});

test('git gate: an octopus merge with one unverified head is refused', () => {
  const p = project([{ id: 'S1-1-fix', verified: true }, { id: 'S1-2-y' }]);
  const before = head(p);
  const r = gitRun(p, ['merge', '--no-ff', 'pm/S1-1-fix', 'pm/S1-2-y', '-m', 'm']);
  refused(p, before, r, 'octopus');
  assert.match(r.stderr, /pm\/S1-2-y/);
  assert.match(r.stderr, /Run git merge --abort, fix the cause, and merge again/);
});

test('git gate: an update-ref refusal says to fix the cause and retry', () => {
  const p = project();
  const r = gitRun(p, ['update-ref', 'refs/heads/main', BRANCH]);
  assert.match(r.stderr, /deliver blocked the update of refs\/heads\/main: pm\/S1-1-fix: .*no verifier verdict/);
  assert.match(r.stderr, /Fix the cause and retry/);
});

test('git gate: a verified story merges by --no-ff, --ff, -n, and reset', () => {
  for (const args of [['merge', '--no-ff', BRANCH, '-m', 'm'], ['merge', '--ff', BRANCH], ['merge', '-n', BRANCH], ['reset', '--hard', BRANCH]]) {
    const p = verified();
    const before = head(p);
    const r = gitRun(p, args);
    assert.equal(r.status, 0, `${args.join(' ')}: ${r.stderr}`);
    assert.notEqual(head(p), before, args.join(' '));
  }
});

// --- the merged result (item 8) ---

test('git gate: a hand-resolved code conflict in the merge is refused even when the story is verified', () => {
  const p = verified();
  commitFile(p, 'src/fix.js', lines('base').replace('line 1 base', 'line 1 other'), 'other');
  const before = head(p);
  assert.notEqual(gitRun(p, ['merge', BRANCH, '-m', 'm']).status, 0);
  fs.writeFileSync(path.join(p, 'src', 'fix.js'), lines('base').replace('line 1 base', 'line 1 hand-merged'));
  gitIn(p, ['add', 'src/fix.js']);
  const r = gitRun(p, ['commit', '--no-edit']);
  refused(p, before, r, 'hand-resolved');
  assert.match(r.stderr, /the merge result differs from the verified automatic merge; re-verify/);
});

test('git gate: extra code staged into a --no-commit merge is refused', () => {
  const p = verified();
  const before = head(p);
  assert.equal(gitRun(p, ['merge', '--no-commit', '--no-ff', BRANCH]).status, 0);
  fs.writeFileSync(path.join(p, 'src', 'extra.js'), 'extra\n');
  gitIn(p, ['add', 'src/extra.js']);
  const r = gitRun(p, ['commit', '-m', 'm']);
  refused(p, before, r, '--no-commit plus code');
  assert.match(r.stderr, /differs from the verified automatic merge/);
});

test('git gate: a conflict confined to the story file is allowed', () => {
  const p = verified();
  // main records something else in the story's Execution block, so the merge conflicts there only.
  commitFile(p, STORY, storyText({ ...claimFor('S1-1-fix'), updated: '2026-10-25 08:00' }), 'chore(S1-1-fix): note');
  assert.notEqual(gitRun(p, ['merge', BRANCH, '-m', 'm']).status, 0);
  gitIn(p, ['checkout', '--theirs', STORY]);
  gitIn(p, ['add', STORY]);
  const r = gitRun(p, ['commit', '--no-edit']);
  assert.equal(r.status, 0, r.stderr);
});

test('git gate: code committed on top of a story merge and fast-forwarded in one update is refused', () => {
  const p = verified();
  gitIn(p, ['checkout', '-qb', 'stage', 'main']);
  gitIn(p, ['merge', '-q', '--no-ff', BRANCH, '-m', 'm']);
  commitFile(p, 'src/late.js', 'late\n', 'late code');
  gitIn(p, ['checkout', '-q', 'main']);
  const before = head(p);
  const r = gitRun(p, ['merge', '--ff-only', 'stage']);
  refused(p, before, r, 'code on top');
  assert.match(r.stderr, /more than the story file and handoff notes on top of a story merge/);
});

// --- what must keep working ---

test('git gate: a pull that fast-forwards main to shipped history is allowed, with no extra merge commit', () => {
  const p = verified();
  const c = tmpDir('pmclone-');
  gitIn(c, ['clone', '-q', p, '.']);
  gitIn(c, ['config', 'user.email', 'casey@example.com']);
  gitIn(c, ['config', 'user.name', 'Casey Example']);
  assert.equal(installGitHook(c).ok, true);
  assert.equal(gitRun(p, ['merge', '--no-ff', BRANCH, '-m', 'feat: ship']).status, 0);
  const r = gitRun(c, ['pull', '--ff-only']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(head(c), head(p));
});

test('git gate: the PM\'s claim and protect commits on main are allowed', () => {
  const p = project();
  fs.writeFileSync(path.join(p, 'docs', 'stories', 'S1-3-z.md'), storyText(claimFor('S1-3-z')));
  gitIn(p, ['add', '-A']);
  const r = gitRun(p, ['commit', '-m', 'chore(S1-3-z): claim']);
  assert.equal(r.status, 0, r.stderr);
  const r2 = gitRun(p, ['commit', '--allow-empty', '-m', 'chore(S1-3-z): protect']);
  assert.equal(r2.status, 0, r2.stderr);
});

test('git gate: a repository that is not a deliver project is unaffected', () => {
  const d = tmpDir('plain-');
  gitIn(d, ['init', '-q', '-b', 'main']);
  gitIn(d, ['config', 'user.email', 'casey@example.com']);
  gitIn(d, ['config', 'user.name', 'Casey Example']);
  commitFile(d, 'a.txt', 'a\n', 'a');
  gitIn(d, ['checkout', '-qb', 'pm/x']);
  commitFile(d, 'b.txt', 'b\n', 'b');
  gitIn(d, ['checkout', '-q', 'main']);
  assert.equal(installGitHook(d).project, false);
  assert.equal(fs.existsSync(path.join(d, '.git', 'hooks', RT_HOOK)), false);
  // Even with the shim in place, the gate stays out of a repository with no deliver project.
  fs.writeFileSync(path.join(d, '.git', 'hooks', RT_HOOK), shim({ branches: ['main'] }), { mode: 0o755 });
  assert.equal(gitRun(d, ['merge', '--ff-only', 'pm/x']).status, 0);
});

test('git gate: the kill switch lets the update through', () => {
  const p = project();
  assert.equal(gitRun(p, ['merge', '--no-ff', BRANCH, '-m', 'm'], { DELIVER_NO_ENFORCE: '1' }).status, 0);
  assert.equal(judgeRefUpdate(p, { target: 'main', old: head(p, 'main^1'), new: head(p) }).allow, true);
});

test('git gate: the shell forms that defeated the Bash hook are still refused', { skip: NO_SH }, () => {
  const p = project();
  const before = head(p);
  for (const form of [
    `if false; then git switch ${BRANCH}; fi; git merge ${BRANCH} -m m`,
    `git merge ${BRANCH} -m m > /dev/null 2>&1`,
    `git merge ${BRANCH} -m m 2>/dev/null </dev/null`,
    `true || git checkout ${BRANCH}; git merge --ff-only ${BRANCH}`,
  ]) {
    const r = sh(p, form);
    assert.notEqual(r.status, 0, form);
    assert.equal(head(p), before, form);
    clean(p);
  }
});

test('git gate: -F <(printf m) is refused', { skip: !HAS_BASH && 'no bash for process substitution' }, () => {
  const p = project();
  const before = head(p);
  const r = sh(p, `git merge --no-ff -F <(printf m) ${BRANCH}`, {}, 'bash');
  refused(p, before, r, '-F <(...)');
});

test('git gate: a single-branch fetch then git merge FETCH_HEAD is refused', { skip: NO_SH }, () => {
  const p = project();
  const c = tmpDir('pmclone-');
  gitIn(c, ['clone', '-q', '--single-branch', '--branch', 'main', p, '.']);
  gitIn(c, ['config', 'user.email', 'casey@example.com']);
  gitIn(c, ['config', 'user.name', 'Casey Example']);
  assert.equal(installGitHook(c).ok, true);
  const before = head(c);
  const r = sh(c, `git fetch -q origin ${BRANCH} && git merge FETCH_HEAD -m m`);
  refused(c, before, r, 'FETCH_HEAD');
  assert.match(r.stderr, /pm\/S1-1-fix: .*no verifier verdict/);
});

test('git gate: below git 2.28 the pre-merge-commit and pre-commit fallback is installed and reported', () => {
  const p = project([{ id: 'S1-1-fix' }], { install: false });
  const r = installGitHook(p, { version: [2, 27, 0] });
  assert.equal(r.mode, 'fallback');
  assert.deepEqual(Object.keys(r.hooks).sort(), ['pre-commit', 'pre-merge-commit']);
  assert.match(r.notes.join('\n'), /git < 2\.28 .*fast-forward updates are not gated/);
  const before = head(p);
  const m = gitRun(p, ['merge', '--no-ff', BRANCH, '-m', 'm']);
  refused(p, before, m, 'fallback merge commit');
  assert.match(m.stderr, /Run git merge --abort, fix the cause, and merge again/);
});

// --- installer safety ---

test('git gate: a core.hooksPath in the working tree is not written; the line to add is reported', () => {
  const p = project([{ id: 'S1-1-fix' }], { install: false });
  gitIn(p, ['config', 'core.hooksPath', '.githooks']);
  const r = installGitHook(p);
  assert.equal(r.ok, false);
  assert.equal(fs.existsSync(path.join(p, '.githooks', RT_HOOK)), false);
  const copy = path.join(p, '.git', 'deliver', RT_HOOK).replace(/\\/g, '/');
  assert.match(r.notes.join('\n'), /is in the working tree.*add deliver's gate to your hook manager/);
  assert.ok(r.notes.join('\n').includes(`sh "${copy}" "$@"`));
  assert.ok(fs.existsSync(copy));
});

test('git gate: a core.hooksPath from global config is not written, and is reported', () => {
  const p = project([{ id: 'S1-1-fix' }], { install: false });
  const g = path.join(tmpDir('gcfg-'), 'gitconfig');
  const hooks = tmpDir('ghooks-');
  fs.writeFileSync(g, `[core]\n\thooksPath = ${hooks.replace(/\\/g, '/')}\n`);
  const saved = process.env.GIT_CONFIG_GLOBAL;
  process.env.GIT_CONFIG_GLOBAL = g;
  try {
    const r = installGitHook(p);
    assert.equal(r.ok, false);
    assert.equal(fs.existsSync(path.join(hooks, RT_HOOK)), false);
    assert.match(r.notes.join('\n'), /global or system git config/);
  } finally {
    if (saved === undefined) delete process.env.GIT_CONFIG_GLOBAL; else process.env.GIT_CONFIG_GLOBAL = saved;
  }
});

test('git gate: foreign, symlinked, unreadable, and late-marker hooks are never overwritten', () => {
  const cases = [
    ['foreign', (f) => fs.writeFileSync(f, '#!/bin/sh\necho mine\n', { mode: 0o755 })],
    ['marker on line 5', (f) => fs.writeFileSync(f, `#!/bin/sh\n#\n#\n#\n${MARKER}\n`, { mode: 0o755 })],
    ['symlink', (f) => { const t = path.join(path.dirname(f), 'real'); fs.writeFileSync(t, `#!/bin/sh\n${MARKER}\n`, { mode: 0o755 }); fs.symlinkSync(t, f); }],
    ...(WIN || process.getuid?.() === 0 ? [] : [['unreadable', (f) => { fs.writeFileSync(f, '#!/bin/sh\nsecret\n'); fs.chmodSync(f, 0o000); }]]),
  ];
  for (const [label, make] of cases) {
    const p = project([{ id: 'S1-1-fix' }], { install: false });
    const f = path.join(p, '.git', 'hooks', RT_HOOK);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    try { make(f); } catch (e) { if (label === 'symlink') continue; throw e; }
    const before = fs.lstatSync(f);
    const r = installGitHook(p);
    assert.equal(r.hooks[RT_HOOK], 'foreign', label);
    assert.match(r.notes.join('\n'), /run \/deliver:doctor after plugin updates/, label);
    assert.ok(r.notes.join('\n').includes(`sh "${path.join(p, '.git', 'deliver', RT_HOOK).replace(/\\/g, '/')}" "$@"`), label);
    const after = fs.lstatSync(f);
    assert.equal(after.ino, before.ino, `${label}: replaced`);
    assert.equal(after.mtimeMs, before.mtimeMs, `${label}: rewritten`);
    if (label === 'unreadable') fs.chmodSync(f, 0o644);
  }
});

test('git gate: session start installs the gate, and reports a foreign hook', () => {
  const p = project([{ id: 'S1-1-fix' }], { install: false });
  const s = runHook('session-context.mjs', { cwd: p });
  assert.equal(s.status, 0);
  assert.doesNotMatch(s.stdout, /merge gate/);
  assert.equal(fs.readFileSync(path.join(p, '.git', 'hooks', RT_HOOK), 'utf8').split('\n')[1], MARKER);
  const q = project([{ id: 'S1-1-fix' }], { install: false });
  fs.writeFileSync(path.join(q, '.git', 'hooks', RT_HOOK), '#!/bin/sh\necho mine\n', { mode: 0o755 });
  const t = runHook('session-context.mjs', { cwd: q });
  assert.match(t.stdout, /merge gate: .*reference-transaction is not deliver's/);
  assert.equal(fs.readFileSync(path.join(q, '.git', 'hooks', RT_HOOK), 'utf8'), '#!/bin/sh\necho mine\n');
});

test('git gate: --uninstall removes only deliver\'s marked shims', () => {
  const p = project();
  fs.writeFileSync(path.join(p, '.git', 'hooks', 'pre-commit'), '#!/bin/sh\necho mine\n', { mode: 0o755 });
  const cli = spawnSync(process.execPath, [INSTALL, '--uninstall', p], { encoding: 'utf8', env: env() });
  assert.equal(cli.status, 0, cli.stdout + cli.stderr);
  assert.equal(fs.existsSync(path.join(p, '.git', 'hooks', RT_HOOK)), false);
  assert.equal(fs.existsSync(path.join(p, '.git', 'deliver', RT_HOOK)), false);
  assert.equal(fs.readFileSync(path.join(p, '.git', 'hooks', 'pre-commit'), 'utf8'), '#!/bin/sh\necho mine\n');
  assert.equal(gitRun(p, ['merge', '--no-ff', BRANCH, '-m', 'm']).status, 0);
});

test('git gate: --check reports the git version and node, and fails on a removed exec bit or a missing gate script until repaired', () => {
  const p = project();
  const check = () => spawnSync(process.execPath, [INSTALL, '--check', p], { encoding: 'utf8', env: env() });
  const ok = check();
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.match(ok.stdout, /^git \d+\.\d+\.\d+: reference-transaction gate \(2\.28 or newer\)/m);
  assert.match(ok.stdout, /^node: .*$/m);
  assert.doesNotMatch(ok.stdout, /NOT RUNNABLE/);
  const file = path.join(p, '.git', 'hooks', RT_HOOK);
  if (!WIN) {
    fs.chmodSync(file, 0o644);
    const r = check();
    assert.equal(r.status, 1);
    assert.match(r.stdout, /hook reference-transaction: not-executable/);
    assert.equal(installGitHook(p).hooks[RT_HOOK], 'current');
    assert.equal(check().status, 0);
  }
  installGitHook(p, { gate: path.join(tmpDir('gone-'), 'git-merge-gate.mjs') });
  const g = check();
  assert.equal(g.status, 1);
  assert.match(g.stdout, /hook reference-transaction: gate-missing/);
  assert.equal(installGitHook(p).hooks[RT_HOOK], 'refreshed');
  assert.equal(check().status, 0);
});

// --- the PreToolUse hook ---

const bash = (cwd, command) => runHook('require-verified.mjs', { tool_name: 'Bash', cwd, tool_input: { command } });

test('git gate: git merge --no-verify of a story is blocked by the PreToolUse hook; merge -n is not', () => {
  const p = verified();
  const r = bash(p, `git merge --no-verify ${BRANCH} -m m`);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /--no-verify skips deliver's merge gate/);
  assert.equal(bash(p, `git merge -n ${BRANCH} -m m`).status, 0);
});

test('git gate: git commit --no-verify of an in-progress story merge is blocked by the PreToolUse hook', () => {
  const p = project();
  gitRun(p, ['merge', '--no-commit', '--no-ff', BRANCH]);
  assert.ok(merging(p));
  for (const cmd of ['git commit --no-verify -m m', 'git commit -n -m m', 'git commit -nm m']) {
    const r = bash(p, cmd);
    assert.equal(r.status, 2, cmd);
    assert.match(r.stderr, /--no-verify skips deliver's merge gate/);
  }
  gitIn(p, ['merge', '--abort']);
  assert.equal(bash(p, 'git commit --no-verify -m m').status, 0);
});

// --- parity: the Bash hook and judgeMerge agree ---

test('git gate: the Bash hook and judgeMerge give the same verdict on the same merge', () => {
  const T1 = { tier: 'T1', protected: ['tests'], protected_base: 'a'.repeat(40) };
  const rows = [
    ['unverified', () => ({ p: project() }), false],
    ['verified', () => ({ p: verified() }), true],
    ['stale verdict', () => {
      const p = verified();
      gitIn(p, ['checkout', '-q', BRANCH]);
      commitFile(p, 'src/fix.js', 'late\n', 'late');
      gitIn(p, ['checkout', '-q', 'main']);
      return { p };
    }, false],
    ['T1 without integrity', () => {
      const p = verified();
      fs.writeFileSync(path.join(p, STORY), storyText({ ...claimFor('S1-1-fix'), ...T1 }));
      gitIn(p, ['commit', '-qam', 'claim T1']);
      gitIn(p, ['checkout', '-q', BRANCH]);
      gitIn(p, ['merge', '-q', '--no-edit', '-X', 'theirs', 'main']);
      const code = head(p, `${BRANCH}~1`);
      fs.writeFileSync(path.join(p, STORY), storyText({ ...claimFor('S1-1-fix'), ...T1, status: 'in-review', verifier: `PASS ${code}` }));
      gitIn(p, ['commit', '-qam', 'record']);
      gitIn(p, ['checkout', '-q', 'main']);
      return { p };
    }, false],
    ['unparseable FETCH_HEAD line', () => {
      const p = project();
      gitIn(p, ['checkout', '-qb', 'feature', 'main']);
      commitFile(p, 'src/feature.js', 'f\n', 'feature');
      gitIn(p, ['checkout', '-q', 'main']);
      const file = path.resolve(p, gitIn(p, ['rev-parse', '--git-path', 'FETCH_HEAD']).trim());
      fs.writeFileSync(file, `${head(p, 'feature')}\t\tbranch 'feature' of ../origin\nnot a line\n`);
      return { p, op: 'FETCH_HEAD', commits: [head(p, 'feature')] };
    }, false],
  ];
  const wrong = [];
  for (const [label, make, allow] of rows) {
    const { p, op = BRANCH, commits } = make();
    const b = bash(p, `git merge --no-ff ${op} -m m`);
    const j = judgeMerge(p, { target: 'main', commits: commits ?? [head(p, op)] });
    if (!allow && !/deliver blocked/.test(b.stderr)) wrong.push(`${label}: bash did not block: ${b.stderr}`);
    if ((b.status === 0) !== allow || j.allow !== allow) wrong.push(`${label}: bash ${b.status} ${b.stderr.trim()} / judgeMerge ${j.allow} ${j.reason}`);
  }
  assert.deepEqual(wrong, []);
});

test('git gate: an unclaimed story is judged against the merge directory\'s project in both', () => {
  const m = tmpDir('mono-');
  gitIn(m, ['init', '-q', '-b', 'main']);
  gitIn(m, ['config', 'user.email', 'casey@example.com']);
  gitIn(m, ['config', 'user.name', 'Casey Example']);
  for (const app of ['apps/a', 'apps/b']) {
    fs.mkdirSync(path.join(m, app, 'docs', 'stories'), { recursive: true });
    fs.writeFileSync(path.join(m, app, 'docs', 'approval.json'), '{"status":"approved"}\n');
  }
  fs.mkdirSync(path.join(m, 'src'));
  fs.writeFileSync(path.join(m, 'src', 'x.js'), 'x\n');
  gitIn(m, ['add', '-A']);
  gitIn(m, ['commit', '-qm', 'two projects']);
  gitIn(m, ['checkout', '-qb', 'pm/S9-9-x']);
  commitFile(m, 'src/x.js', 'y\n', 'code');
  gitIn(m, ['checkout', '-q', 'main']);
  const b = runHook('require-verified.mjs', { tool_name: 'Bash', cwd: path.join(m, 'apps', 'b'), tool_input: { command: 'git merge --no-ff pm/S9-9-x -m m' } });
  assert.equal(b.status, 2);
  assert.match(b.stderr, /no story on main claims pm\/S9-9-x in apps\/b\/docs\/stories/);
  const j = judgeMerge(m, { target: 'main', commits: [head(m, 'pm/S9-9-x')], prefixes: ['apps/b/', 'apps/', ''] });
  assert.equal(j.allow, false);
  assert.match(j.reason, /in apps\/b\/docs\/stories/);
});
