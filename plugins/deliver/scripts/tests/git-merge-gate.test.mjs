// deliver's git-level ship gate: git-hook-install.mjs writes a reference-transaction shim (or, below
// git 2.28, pre-merge-commit and pre-commit shims), git runs git-merge-gate.mjs, and judgeRefUpdate()
// or judgeMerge() gives the verdict. Real git in temp repositories, installed by installGitHook().
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { newProj, runHook, gitIn, tmpDir, HOOKS_DIR } from './helpers.mjs';

const { installGitHook, shim, writeAtomic, shCompatible, shSyntaxOk, wrapper, MARKER, GATE, RT_HOOK, TREE_NOTE } = await import(path.join(HOOKS_DIR, 'git-hook-install.mjs'));
const { judgeMerge, judgeRefUpdate, ONE_AT_A_TIME, fetchUrl, planName, planEntry } = await import(path.join(HOOKS_DIR, 'require-verified.mjs'));

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
    ['cherry-pick', (p) => { commitFile(p, 'docs/notes.md', 'n\n', 'docs: notes'); return gitRun(p, ['cherry-pick', `${BRANCH}~1`]); }],
    ['merge --squash, git commit', (p) => { commitFile(p, 'docs/notes.md', 'n\n', 'docs: notes'); assert.equal(gitRun(p, ['merge', '--squash', BRANCH]).status, 0); return gitRun(p, ['commit', '-m', 'squash']); }],
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
    const before = ['rebase', 'cherry-pick', 'merge --squash, git commit'].includes(label) || label.startsWith('conflicted') ? null : head(p);
    const r = run(p);
    refused(p, before ?? head(p), r, label);
    if (label === 'cherry-pick' || label.startsWith('merge --squash')) assert.match(r.stderr, /as a copy \(a cherry-pick or a squash merge\), and .*no verifier verdict.*after verification, merge the story branch itself with git merge --no-ff pm\/S1-1-fix/, label);
  }
});

test('git gate: a verified story copied by cherry-pick or squash is refused; merge the branch itself', () => {
  for (const [label, run] of [
    ['cherry-pick', (p) => gitRun(p, ['cherry-pick', `${BRANCH}~1`])],
    ['merge --squash, git commit', (p) => { assert.equal(gitRun(p, ['merge', '--squash', BRANCH]).status, 0); return gitRun(p, ['commit', '-m', 'squash']); }],
  ]) {
    const p = verified();
    commitFile(p, 'docs/notes.md', 'n\n', 'docs: notes');
    const before = head(p);
    const r = run(p);
    refused(p, before, r, label);
    assert.match(r.stderr, /as a copy .*bypasses the check that the merge is the verified automatic merge; merge the story branch itself with git merge --no-ff pm\/S1-1-fix/, label);
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

test('git gate: an octopus merge of verified stories is refused, one story at a time, by git, the Bash hook, and judgeMerge alike', () => {
  const p = project([{ id: 'S1-1-fix', verified: true }, { id: 'S1-2-y', verified: true }]);
  const before = head(p);
  const b = bash(p, 'git merge --no-ff pm/S1-1-fix pm/S1-2-y -m m');
  assert.equal(b.status, 2, b.stderr);
  assert.ok(b.stderr.includes(ONE_AT_A_TIME), b.stderr);
  const j = judgeMerge(p, { target: 'main', commits: [head(p, 'pm/S1-1-fix'), head(p, 'pm/S1-2-y')] });
  assert.equal(j.allow, false);
  assert.ok(j.reason.includes(ONE_AT_A_TIME), j.reason);
  const r = gitRun(p, ['merge', '--no-ff', 'pm/S1-1-fix', 'pm/S1-2-y', '-m', 'm']);
  refused(p, before, r, 'octopus of verified stories');
  assert.ok(r.stderr.includes(ONE_AT_A_TIME), r.stderr);
  assert.doesNotMatch(r.stderr, /re-verify/);
  clean(p);
  // One at a time, both ship.
  assert.equal(gitRun(p, ['merge', '--no-ff', 'pm/S1-1-fix', '-m', 'a']).status, 0);
  const second = gitRun(p, ['merge', '--no-ff', 'pm/S1-2-y', '-m', 'b']);
  assert.equal(second.status, 0, second.stderr);
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

test('git gate: amending a verified story merge to change code is refused', () => {
  const p = verified();
  assert.equal(gitRun(p, ['merge', '--no-ff', BRANCH, '-m', 'm']).status, 0);
  const before = head(p);
  fs.writeFileSync(path.join(p, 'src', 'fix.js'), 'amended\n');
  const r = gitRun(p, ['commit', '-a', '--amend', '--no-edit']);
  refused(p, before, r, 'amend');
  assert.match(r.stderr, /differs from the verified automatic merge/);
});

test('git gate: below git 2.38 the merged-tree check alone fails open, and is reported once', { skip: WIN && 'POSIX git wrapper' }, () => {
  const bin = tmpDir('pmoldgit-');
  const real = spawnSync('which', ['git'], { encoding: 'utf8' }).stdout.trim();
  fs.writeFileSync(path.join(bin, 'git'), `#!/bin/sh\ntree=; write=\nfor a in "$@"; do\n  case "$a" in merge-tree) tree=1;; --write-tree) write=1;; esac\ndone\n[ -n "$tree" ] && [ -n "$write" ] && { echo "usage: git merge-tree" >&2; exit 129; }\nexec "${real}" "$@"\n`, { mode: 0o755 });
  const PATH = `${bin}${path.delimiter}${process.env.PATH}`;
  // A verified story merged with extra code staged into the merge: refused when merge-tree works.
  // Built on a side branch, so main stays where the hook would see it.
  const p = verified();
  gitIn(p, ['checkout', '-qb', 'stage', 'main']);
  assert.equal(gitRun(p, ['merge', '--no-commit', '--no-ff', BRANCH]).status, 0);
  fs.writeFileSync(path.join(p, 'src', 'extra.js'), 'extra\n');
  gitIn(p, ['add', 'src/extra.js']);
  assert.equal(gitRun(p, ['commit', '-m', 'm']).status, 0);
  gitIn(p, ['checkout', '-q', 'main']);
  const update = { target: 'main', old: head(p), new: head(p, 'stage') };
  assert.equal(judgeRefUpdate(p, update).allow, false, 'refused where merge-tree --write-tree works');
  const u = project();
  const saved = process.env.PATH;
  process.env.PATH = PATH;
  try {
    const v = judgeRefUpdate(p, update);
    assert.equal(v.allow, true, v.reason);
    // The verdicts still apply.
    gitIn(u, ['checkout', '-qb', 'stage', 'main']);
    assert.equal(gitRun(u, ['merge', '-q', '--no-ff', BRANCH, '-m', 'm']).status, 0);
    assert.equal(judgeRefUpdate(u, { target: 'main', old: head(u), new: head(u, 'stage') }).allow, false);
  } finally {
    process.env.PATH = saved;
  }
  const check = spawnSync(process.execPath, [INSTALL, '--check', p], { encoding: 'utf8', env: env({ PATH }) });
  assert.equal(check.stdout.split(TREE_NOTE).length - 1, 1, check.stdout);
  assert.equal(check.status, 0, check.stdout);
  const s = runHook('session-context.mjs', { cwd: p }, { PATH });
  assert.equal(s.stdout.split(TREE_NOTE).length - 1, 1, s.stdout);
  assert.ok(TREE_NOTE.includes('merged-tree check needs git 2.38; merges are not compared with the verified automatic merge'));
  assert.doesNotMatch(spawnSync(process.execPath, [INSTALL, '--check', p], { encoding: 'utf8', env: env() }).stdout, /needs git 2\.38/);
});

test('git gate: a story stacked on a verified story does not make its merge a partial', () => {
  const p = verified();
  gitIn(p, ['checkout', '-qb', 'pm/S1-2-y', `${BRANCH}~1`]);
  commitFile(p, 'src/y.js', 'y\n', 'build(S1-2-y): code');
  gitIn(p, ['checkout', '-q', 'main']);
  const r = gitRun(p, ['merge', '--no-ff', BRANCH, '-m', 'm']);
  assert.equal(r.status, 0, r.stderr);
});

test('git gate: an unparseable FETCH_HEAD line does not block a merge of a non-story branch', () => {
  const p = project();
  gitIn(p, ['checkout', '-qb', 'feature', 'main']);
  commitFile(p, 'src/feature.js', 'f\n', 'feature');
  gitIn(p, ['checkout', '-q', 'main']);
  const file = path.resolve(p, gitIn(p, ['rev-parse', '--git-path', 'FETCH_HEAD']).trim());
  fs.writeFileSync(file, 'not a line\n');
  const r = gitRun(p, ['merge', '--no-ff', 'feature', '-m', 'm']);
  assert.equal(r.status, 0, r.stderr);
});

test('git gate: a stale remote-tracking snapshot of a verified story does not refuse its merge', () => {
  const p = verified();
  // Pushed before the verdict was recorded: origin's copy is the code commit alone.
  gitIn(p, ['update-ref', `refs/remotes/origin/${BRANCH}`, `${BRANCH}~1`]);
  assert.equal(judgeMerge(p, { target: 'main', commits: [head(p, BRANCH)] }).allow, true);
  const r = gitRun(p, ['merge', '--no-ff', BRANCH, '-m', 'm']);
  assert.equal(r.status, 0, r.stderr);
  // Merging the unverified snapshot itself stays refused.
  const q = verified();
  gitIn(q, ['update-ref', `refs/remotes/origin/${BRANCH}`, `${BRANCH}~1`]);
  const before = head(q);
  refused(q, before, gitRun(q, ['merge', '--no-ff', `origin/${BRANCH}`, '-m', 'm']), 'stale snapshot');
});

test('git gate: git push . of a story into the integration branch is refused', () => {
  const p = project();
  gitIn(p, ['checkout', '-q', BRANCH]);
  const before = head(p);
  const r = gitRun(p, ['push', '.', `${BRANCH}:main`]);
  assert.notEqual(r.status, 0, r.stderr);
  assert.equal(head(p), before);
  assert.match(r.stderr, /deliver blocked/);
  // receive-pack runs the hook inside the git directory: the gate finds the working tree from there.
  gitIn(p, ['checkout', '-q', 'main']);
  const g = spawnSync(process.execPath, [GATE, RT_HOOK], { cwd: path.join(p, '.git'), env: env(), encoding: 'utf8', input: `${head(p)} ${head(p, BRANCH)} refs/heads/main\n` });
  assert.equal(g.status, 86, g.stderr);
  assert.match(g.stderr, /deliver blocked the update of refs\/heads\/main/);
});

test('git gate: pack-refs, gc, and a transaction that moves nothing after a verified merge are allowed', () => {
  const p = verified();
  assert.equal(gitRun(p, ['merge', '--no-ff', BRANCH, '-m', 'm']).status, 0);
  for (const args of [['pack-refs', '--all'], ['gc', '-q'], ['reflog', 'expire', '--all'], ['update-ref', 'refs/heads/main', head(p)]]) {
    const r = gitRun(p, args);
    assert.equal(r.status, 0, `${args.join(' ')}: ${r.stderr}`);
  }
  const v = judgeRefUpdate(p, { target: 'main', old: '0'.repeat(40), new: head(p) });
  assert.equal(v.allow, true, v.reason);
});

test('git gate: a refused fast-forward says how to restore the working tree, and that restores it', () => {
  const p = project();
  fs.writeFileSync(path.join(p, 'local.txt'), 'mine\n');
  const before = head(p);
  const r = gitRun(p, ['merge', '--ff-only', BRANCH]);
  refused(p, before, r, 'ff');
  assert.doesNotMatch(r.stderr, /merge --abort/);
  assert.match(r.stderr, /git reset --merge/);
  assert.equal(gitRun(p, ['reset', '--merge']).status, 0);
  assert.equal(gitIn(p, ['status', '--porcelain']), '?? local.txt\n');
  assert.equal(fs.readFileSync(path.join(p, 'src', 'fix.js'), 'utf8'), lines('base'));
  // update-ref leaves the tree alone, so nothing to restore.
  const u = gitRun(p, ['update-ref', 'refs/heads/main', BRANCH]);
  assert.match(u.stderr, /Fix the cause and retry/);
});

test('git gate: the fallback refuses extra code staged into a merge, and allows a clean verified merge', () => {
  const p = verified({ install: false });
  const r0 = installGitHook(p, { version: [2, 27, 0] });
  assert.match(r0.notes.join('\n'), /fast-forward updates, squash merges, and cherry-picks are not gated \(they make no merge commit\), and a merge commit's result is compared with the automatic merge only where git needs no content merge/);
  const before = head(p);
  assert.equal(gitRun(p, ['merge', '--no-commit', '--no-ff', BRANCH]).status, 0);
  fs.writeFileSync(path.join(p, 'src', 'extra.js'), 'extra\n');
  gitIn(p, ['add', 'src/extra.js']);
  const r = gitRun(p, ['commit', '-m', 'm']);
  refused(p, before, r, 'fallback extra code');
  assert.match(r.stderr, /staged merge result differs from the automatic merge/);
  clean(p);
  const ok = gitRun(p, ['merge', '--no-ff', BRANCH, '-m', 'm']);
  assert.equal(ok.status, 0, ok.stderr);
});

test('git gate: an upstream that is not the integration branch on a remote proves nothing shipped', () => {
  const p = project();
  gitIn(p, ['remote', 'add', 'origin', 'https://example.invalid/repo.git']);
  gitIn(p, ['config', 'branch.main.remote', 'origin']);
  gitIn(p, ['config', 'branch.main.merge', `refs/heads/${BRANCH}`]);
  gitIn(p, ['update-ref', `refs/remotes/origin/${BRANCH}`, BRANCH]);
  for (const args of [['merge', '--no-ff', BRANCH, '-m', 'm'], ['merge', '--ff-only', BRANCH]]) {
    const before = head(p);
    refused(p, before, gitRun(p, args), args.join(' '));
    clean(p);
  }
  assert.equal(judgeMerge(p, { target: 'main', commits: [head(p, BRANCH)] }).allow, false);
});

test('git gate: an update with no old value is judged against the ref as it stands', () => {
  const p = project();
  const part = head(p, `${BRANCH}~1`);
  const v = judgeRefUpdate(p, { target: 'main', old: '0'.repeat(40), new: part });
  assert.equal(v.allow, false, v.reason);
  assert.match(v.reason, /part of pm\/S1-1-fix short of its tip/);
  const before = head(p);
  refused(p, before, gitRun(p, ['update-ref', 'refs/heads/main', part]), 'update-ref with no old value');
});

test('git gate: creating the integration branch at part of a story is refused; at shipped history it is allowed', () => {
  const p = project();
  gitIn(p, ['update-ref', 'refs/remotes/origin/main', 'main']);
  gitIn(p, ['checkout', '-q', BRANCH]);
  gitIn(p, ['branch', '-D', 'main']);
  const part = head(p, `${BRANCH}~1`);
  const v = judgeRefUpdate(p, { target: 'main', old: '0'.repeat(40), new: part });
  assert.equal(v.allow, false, v.reason);
  assert.match(v.reason, /part of pm\/S1-1-fix short of its tip/, 'a commit of the story itself is no copy');
  const r = gitRun(p, ['branch', 'main', part]);
  assert.notEqual(r.status, 0, r.stderr);
  assert.match(r.stderr, /deliver blocked/);
  assert.equal(gitRun(p, ['rev-parse', '-q', '--verify', 'refs/heads/main']).status, 1);
  const ok = gitRun(p, ['branch', 'main', 'origin/main']);
  assert.equal(ok.status, 0, ok.stderr);
});

test('git gate: a refused update-ref keeps the user\'s staged work; the advice is not reset --merge', () => {
  const p = project();
  fs.writeFileSync(path.join(p, 'docs', 'notes.md'), 'mine\n');
  gitIn(p, ['add', 'docs/notes.md']);
  const before = head(p);
  const r = gitRun(p, ['update-ref', 'refs/heads/main', BRANCH]);
  refused(p, before, r, 'update-ref with staged work');
  assert.doesNotMatch(r.stderr, /reset --merge/);
  assert.match(r.stderr, /Fix the cause and retry/);
});

test('git gate: a refused cherry-pick says git cherry-pick --abort, which restores the tree', () => {
  const p = project();
  commitFile(p, 'docs/notes.md', 'n\n', 'docs: notes');
  const before = head(p);
  const r = gitRun(p, ['cherry-pick', `${BRANCH}~1`]);
  refused(p, before, r, 'cherry-pick');
  assert.match(r.stderr, /git cherry-pick --abort/);
  assert.equal(gitRun(p, ['cherry-pick', '--abort']).status, 0);
  assert.equal(gitIn(p, ['status', '--porcelain']), '');
});

test('git gate: a hotfix cherry-picked onto a story branch does not make the hotfix merge a copy', () => {
  const p = project();
  gitIn(p, ['checkout', '-qb', 'hotfix', 'main']);
  commitFile(p, 'src/hot.js', 'hot\n', 'fix: hot');
  gitIn(p, ['checkout', '-q', BRANCH]);
  gitIn(p, ['cherry-pick', 'hotfix']);
  gitIn(p, ['checkout', '-q', 'main']);
  const r = gitRun(p, ['merge', '--no-ff', 'hotfix', '-m', 'm']);
  assert.equal(r.status, 0, r.stderr);
});

test('git gate: a squash whose story record conflicted is still a copy', () => {
  const p = project();
  commitFile(p, STORY, storyText({ ...claimFor('S1-1-fix'), rounds: 1 }), 'chore(S1-1-fix): round');
  const before = head(p);
  assert.notEqual(gitRun(p, ['merge', '--squash', BRANCH]).status, 0, 'the record conflicts');
  gitIn(p, ['checkout', '--theirs', STORY]);
  gitIn(p, ['add', STORY]);
  const r = gitRun(p, ['commit', '-m', 'squash']);
  refused(p, before, r, 'squash with a record conflict');
  assert.match(r.stderr, /as a copy/);
});

test('git gate: rewriting shipped story history with new code is refused; a reword or a record edit is not', () => {
  // A verified --no-ff merge, the story branch deleted, then an amend that adds code.
  const a = verified();
  assert.equal(gitRun(a, ['merge', '--no-ff', BRANCH, '-m', 'm']).status, 0);
  gitIn(a, ['branch', '-D', BRANCH]);
  let before = head(a);
  fs.writeFileSync(path.join(a, 'src', 'fix.js'), 'unverified\n');
  let r = gitRun(a, ['commit', '-a', '--amend', '--no-edit']);
  refused(a, before, r, 'amended merge after branch -D');
  assert.match(r.stderr, /rewriting shipped story history changes code; ship the change as a story/);
  clean(a);
  // A verified fast-forward, then a code-changing amend while the branch still exists.
  const b = verified();
  assert.equal(gitRun(b, ['merge', '--ff-only', BRANCH]).status, 0);
  before = head(b);
  fs.writeFileSync(path.join(b, 'src', 'fix.js'), 'unverified\n');
  r = gitRun(b, ['commit', '-a', '--amend', '--no-edit']);
  refused(b, before, r, 'amended fast-forward');
  assert.match(r.stderr, /rewriting shipped story history changes code/);
  clean(b);
  // Rewording, or editing only the record, keeps the code.
  const c = verified();
  assert.equal(gitRun(c, ['merge', '--no-ff', BRANCH, '-m', 'm']).status, 0);
  gitIn(c, ['branch', '-D', BRANCH]);
  const w = gitRun(c, ['commit', '--amend', '-m', 'feat(S1-1-fix): reworded']);
  assert.equal(w.status, 0, w.stderr);
  fs.appendFileSync(path.join(c, STORY), '\nnote\n');
  const e = gitRun(c, ['commit', '-a', '--amend', '--no-edit']);
  assert.equal(e.status, 0, e.stderr);
});

test('git gate: the fallback is strict on an unreadable FETCH_HEAD only for a fetched merge, and refuses an octopus with a story', () => {
  const p = verified({ install: false });
  installGitHook(p, { version: [2, 27, 0] });
  gitIn(p, ['checkout', '-qb', 'feature', 'main']);
  commitFile(p, 'src/feature.js', 'f\n', 'feature');
  gitIn(p, ['checkout', '-q', 'main']);
  fs.writeFileSync(path.resolve(p, gitIn(p, ['rev-parse', '--git-path', 'FETCH_HEAD']).trim()), 'not a line\n');
  const before = head(p);
  const o = gitRun(p, ['merge', '--no-ff', BRANCH, 'feature', '-m', 'm']);
  refused(p, before, o, 'fallback octopus');
  assert.ok(o.stderr.includes(ONE_AT_A_TIME), o.stderr);
  clean(p);
  const r = gitRun(p, ['merge', '--no-ff', 'feature', '-m', 'm']);
  assert.equal(r.status, 0, r.stderr);
});

// clonedProject(origin): a clone of origin with the gate installed.
function clonedProject(origin) {
  const c = tmpDir('pmclone-');
  gitIn(c, ['clone', '-q', origin, '.']);
  gitIn(c, ['config', 'user.email', 'casey@example.com']);
  gitIn(c, ['config', 'user.name', 'Casey Example']);
  assert.equal(installGitHook(c).ok, true);
  return c;
}

test('git gate: pull --rebase=merges over an unpushed verified story merge is allowed when upstream changed a nearby line', () => {
  const o = verified();
  const c = clonedProject(o);
  assert.equal(gitRun(c, ['merge', '--no-ff', `origin/${BRANCH}`, '-m', 'feat: ship']).status, 0);
  commitFile(o, 'src/fix.js', lines('base').replace('line 3 base', 'line 3 upstream'), 'fix: upstream nearby');
  const r = gitRun(c, ['pull', '--rebase=merges']);
  assert.equal(r.status, 0, r.stderr);
  const text = fs.readFileSync(path.join(c, 'src', 'fix.js'), 'utf8');
  assert.match(text, /line 1 fixed/);
  assert.match(text, /line 3 upstream/);
});

test('git gate: a plain pull --rebase of a local non-story commit is allowed', () => {
  const o = verified();
  const c = clonedProject(o);
  commitFile(c, 'src/local.js', 'local\n', 'feat: local');
  commitFile(o, 'src/fix.js', lines('base').replace('line 3 base', 'line 3 upstream'), 'fix: upstream');
  const r = gitRun(c, ['pull', '--rebase']);
  assert.equal(r.status, 0, r.stderr);
});

test('git gate: a linear pull --rebase replaying an unpushed story merge says to keep the merge', () => {
  const o = verified();
  const c = clonedProject(o);
  assert.equal(gitRun(c, ['merge', '--no-ff', `origin/${BRANCH}`, '-m', 'feat: ship']).status, 0);
  commitFile(o, 'src/other.js', 'upstream\n', 'feat: upstream');
  const before = head(c);
  const r = gitRun(c, ['pull', '--rebase']);
  assert.notEqual(r.status, 0, r.stderr);
  assert.match(r.stderr, /a rebase is replaying a shipped story merge; use git pull --rebase=merges \(or git pull --no-rebase\)/);
  gitRun(c, ['rebase', '--abort']);
  assert.equal(head(c), before);
});

test('git gate: a remote whose name holds a slash is a trusted copy of the integration branch', () => {
  const p = project();
  gitIn(p, ['checkout', '-qb', 'stage', 'main']);
  gitIn(p, ['merge', '-q', '--no-ff', BRANCH, '-m', 'shipped elsewhere']);
  gitIn(p, ['checkout', '-q', 'main']);
  gitIn(p, ['remote', 'add', 'team/origin', 'https://example.invalid/repo.git']);
  gitIn(p, ['update-ref', 'refs/remotes/team/origin/main', 'stage']);
  gitIn(p, ['config', 'branch.main.remote', 'team/origin']);
  gitIn(p, ['config', 'branch.main.merge', 'refs/heads/main']);
  const r = gitRun(p, ['merge', '--ff-only', 'team/origin/main']);
  assert.equal(r.status, 0, r.stderr);
});

test('git gate: amending shipped story code by whitespace alone is refused', () => {
  const p = verified();
  assert.equal(gitRun(p, ['merge', '--no-ff', BRANCH, '-m', 'm']).status, 0);
  gitIn(p, ['branch', '-D', BRANCH]);
  const before = head(p);
  fs.writeFileSync(path.join(p, 'src', 'fix.js'), lines('base').replace('line 1 base', 'line 1fixed'));
  const r = gitRun(p, ['commit', '-a', '--amend', '--no-edit']);
  refused(p, before, r, 'whitespace amend');
  assert.match(r.stderr, /rewriting shipped story history changes code/);
});

// localStory(p, id, change): claim story `id` on main, build it on pm/<id> with `change(p)` as its
// code commit, record its verifier, and return to main.
function localStory(p, id, change) {
  commitFile(p, `docs/stories/${id}.md`, storyText(claimFor(id)), `chore(${id}): claim`);
  gitIn(p, ['checkout', '-qb', `pm/${id}`, 'main']);
  change(p);
  gitIn(p, ['add', '-A']);
  gitIn(p, ['commit', '-qm', `build(${id}): code`]);
  const code = head(p, 'HEAD');
  fs.writeFileSync(path.join(p, 'docs', 'stories', `${id}.md`), storyText({ ...claimFor(id), status: 'in-review', verifier: `PASS ${code}` }));
  gitIn(p, ['commit', '-qam', `chore(${id}): record`]);
  gitIn(p, ['checkout', '-q', 'main']);
}

test('git gate: pull --rebase=merges over a local-only verified story merge is allowed; a linear pull --rebase keeps the replay advice', () => {
  for (const [args, ok] of [[['pull', '--rebase=merges'], true], [['pull', '--rebase'], false]]) {
    const o = verified();
    const c = clonedProject(o);
    localStory(c, 'S1-3-z', (q) => fs.writeFileSync(path.join(q, 'src', 'z.js'), 'z\n'));
    assert.equal(gitRun(c, ['merge', '--no-ff', 'pm/S1-3-z', '-m', 'feat: z']).status, 0);
    commitFile(o, 'src/other.js', 'upstream\n', 'feat: upstream');
    const before = head(c);
    const r = gitRun(c, args);
    if (ok) {
      assert.equal(r.status, 0, `${args.join(' ')}: ${r.stderr}`);
      assert.ok(fs.existsSync(path.join(c, 'src', 'z.js')) && fs.existsSync(path.join(c, 'src', 'other.js')));
    } else {
      assert.notEqual(r.status, 0, r.stderr);
      assert.match(r.stderr, /a rebase is replaying a shipped story merge/);
      gitRun(c, ['rebase', '--abort']);
      assert.equal(head(c), before);
    }
  }
});

test('git gate: an amend that drops a story merge but keeps its code as a plain commit is refused', () => {
  const p = verified();
  assert.equal(gitRun(p, ['merge', '--no-ff', BRANCH, '-m', 'm']).status, 0);
  const before = head(p);
  // Replace the merge, in one update, with one plain commit carrying the story's code.
  const flat = gitIn(p, ['commit-tree', 'HEAD^{tree}', '-p', 'HEAD^1', '-m', 'flattened']).trim();
  const r = gitRun(p, ['reset', '--hard', flat]);
  refused(p, before, r, 'flattening amend');
});

test('git gate: an amend that moves a verified change to another place in the file is refused', () => {
  const p = project([], { install: false });
  const two = 'function a() {\n  return false;\n}\nfunction b() {\n  return false;\n}\n';
  commitFile(p, 'src/f.js', two, 'feat: f');
  assert.equal(installGitHook(p).ok, true);
  localStory(p, 'S1-3-z', (q) => fs.writeFileSync(path.join(q, 'src', 'f.js'), two.replace('return false', 'return true')));
  assert.equal(gitRun(p, ['merge', '--no-ff', 'pm/S1-3-z', '-m', 'feat: z']).status, 0);
  gitIn(p, ['branch', '-D', 'pm/S1-3-z']);
  const before = head(p);
  fs.writeFileSync(path.join(p, 'src', 'f.js'), 'function a() {\n  return false;\n}\nfunction b() {\n  return true;\n}\n');
  const r = gitRun(p, ['commit', '-a', '--amend', '--no-edit']);
  refused(p, before, r, 'moved change');
  assert.match(r.stderr, /rewriting shipped story history changes code/);
});

test('git gate: pull --rebase=merges keeps a story forked from an older main commit as the merge\'s second parent', () => {
  const o = verified();
  commitFile(o, 'docs/stories/S1-3-z.md', storyText(claimFor('S1-3-z')), 'chore(S1-3-z): claim');
  commitFile(o, 'src/older.js', 'older\n', 'feat: older');
  const c = clonedProject(o);
  // The story forks from main^1, older than origin/main.
  gitIn(c, ['checkout', '-qb', 'pm/S1-3-z', 'main^1']);
  fs.writeFileSync(path.join(c, 'src', 'z.js'), 'z\n');
  gitIn(c, ['add', '-A']);
  gitIn(c, ['commit', '-qm', 'build(S1-3-z): code']);
  const code = head(c, 'HEAD');
  fs.mkdirSync(path.join(c, 'docs', 'stories'), { recursive: true });
  fs.writeFileSync(path.join(c, 'docs', 'stories', 'S1-3-z.md'), storyText({ ...claimFor('S1-3-z'), status: 'in-review', verifier: `PASS ${code}` }));
  gitIn(c, ['add', '-A']);
  gitIn(c, ['commit', '-qm', 'chore(S1-3-z): record']);
  const tip = head(c, 'HEAD');
  gitIn(c, ['checkout', '-q', 'main']);
  const m = gitRun(c, ['merge', '--no-ff', 'pm/S1-3-z', '-m', 'feat: z']);
  assert.equal(m.status, 0, m.stderr);
  commitFile(o, 'src/other.js', 'upstream\n', 'feat: upstream');
  const r = gitRun(c, ['pull', '--rebase=merges']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(head(c, 'main^2'), tip, 'the story tip is still the merge\'s second parent');
});

test('git gate: a merge-preserving rebase over an upstream rename, or an edit two lines from the story, is allowed', () => {
  for (const [label, upstream] of [
    ['rename', (o) => { commitFile(o, 'docs/notes.md', 'n\n', 'docs: notes'); gitIn(o, ['mv', 'docs/notes.md', 'docs/renamed.md']); gitIn(o, ['commit', '-qm', 'docs: rename']); }],
    ['edit two lines away', (o) => commitFile(o, 'src/fix.js', lines('base').replace('line 3 base', 'line 3 upstream').replace('line 5 base', 'line 5 upstream'), 'fix: upstream around')],
  ]) {
    const o = verified();
    const c = clonedProject(o);
    assert.equal(gitRun(c, ['merge', '--no-ff', `origin/${BRANCH}`, '-m', 'feat: ship']).status, 0);
    upstream(o);
    const r = gitRun(c, ['pull', '--rebase=merges']);
    assert.equal(r.status, 0, `${label}: ${r.stderr}`);
  }
});

test('git gate: a story on a remote whose name holds a slash is still a story', () => {
  const p = project();
  gitIn(p, ['remote', 'add', 'team/origin', 'https://example.invalid/repo.git']);
  gitIn(p, ['update-ref', `refs/remotes/team/origin/${BRANCH}`, BRANCH]);
  gitIn(p, ['branch', '-D', BRANCH]);
  const before = head(p);
  refused(p, before, gitRun(p, ['merge', '--no-ff', `team/origin/${BRANCH}`, '-m', 'm']), 'slash remote story');
});

test('git gate: the tracking ref a fetch refspec maps the integration branch to is trusted', () => {
  const p = project();
  gitIn(p, ['checkout', '-qb', 'stage', 'main']);
  gitIn(p, ['merge', '-q', '--no-ff', BRANCH, '-m', 'shipped elsewhere']);
  gitIn(p, ['checkout', '-q', 'main']);
  gitIn(p, ['config', 'remote.up.url', 'https://example.invalid/repo.git']);
  gitIn(p, ['config', 'remote.up.fetch', '+refs/heads/*:refs/remotes/mirror/*']);
  gitIn(p, ['update-ref', 'refs/remotes/mirror/main', 'stage']);
  gitIn(p, ['config', 'branch.main.remote', 'up']);
  gitIn(p, ['config', 'branch.main.merge', 'refs/heads/main']);
  const r = gitRun(p, ['merge', '--ff-only', 'mirror/main']);
  assert.equal(r.status, 0, r.stderr);
});

test('git gate: a linear pull --rebase of a local commit over an upstream squash of a story is allowed', () => {
  const o = verified();
  const c = clonedProject(o);
  commitFile(c, 'src/local.js', 'local\n', 'feat: local');
  // upstream squash-merges the story, past its own gate.
  assert.equal(gitRun(o, ['merge', '--squash', BRANCH]).status, 0);
  assert.equal(gitRun(o, ['commit', '-m', 'feat: squashed'], { DELIVER_NO_ENFORCE: '1' }).status, 0);
  const r = gitRun(c, ['pull', '--rebase']);
  assert.equal(r.status, 0, r.stderr);
});

test('git gate: a rewrite that brings in a copy of an unshipped story gets the copy reason; a copy old already held is not re-judged', () => {
  // An amend that turns a local commit into a copy of the story's code commit.
  {
    const p = project();
    commitFile(p, 'src/h.js', 'h\n', 'feat: h');
    const before = head(p);
    gitIn(p, ['rm', '-q', 'src/h.js']);
    fs.writeFileSync(path.join(p, 'src', 'fix.js'), lines('base').replace('line 1 base', 'line 1 fixed'));
    gitIn(p, ['add', '-A']);
    const r = gitRun(p, ['commit', '--amend', '-m', 'feat: h, now the story']);
    refused(p, before, r, 'amend into a copy');
    assert.match(r.stderr, /as a copy/);
    assert.doesNotMatch(r.stderr, /replaying a shipped story merge/);
  }
  // A copy that reached main past the gate earlier is old's own history: a rebase carrying it on
  // does not bring it in, so it is not judged again.
  const o = verified();
  const c = clonedProject(o);
  assert.equal(gitRun(c, ['cherry-pick', `origin/${BRANCH}~1`], { DELIVER_NO_ENFORCE: '1' }).status, 0);
  commitFile(o, 'src/other.js', 'upstream\n', 'feat: upstream');
  const r = gitRun(c, ['pull', '--rebase']);
  assert.equal(r.status, 0, r.stderr);
});

// storyB(c): an unverified story B branched from main, with a code commit of its own.
function storyB(c) {
  gitIn(c, ['checkout', '-qb', 'pm/S1-4-b', 'main']);
  commitFile(c, 'src/b.js', 'b\n', 'build(S1-4-b): code');
  gitIn(c, ['checkout', '-q', 'main']);
}

test('git gate: syncing main past story work old already holds is allowed', () => {
  // (a) story A merged locally, story B branched from main after it, then pull --rebase=merges.
  {
    const o = verified();
    const c = clonedProject(o);
    localStory(c, 'S1-3-z', (q) => fs.writeFileSync(path.join(q, 'src', 'z.js'), 'z\n'));
    assert.equal(gitRun(c, ['merge', '--no-ff', 'pm/S1-3-z', '-m', 'feat: z']).status, 0);
    storyB(c);
    commitFile(o, 'src/other.js', 'upstream\n', 'feat: upstream');
    const r = gitRun(c, ['pull', '--rebase=merges']);
    assert.equal(r.status, 0, `(a): ${r.stderr}`);
  }
  // (b) a code commit on local main, story B branched from main, then pull --rebase; (c) a reword.
  for (const label of ['(b)', '(c)']) {
    const o = verified();
    const c = clonedProject(o);
    commitFile(c, 'src/h.js', 'h\n', 'feat: h');
    storyB(c);
    let r;
    if (label === '(b)') {
      commitFile(o, 'src/other.js', 'upstream\n', 'feat: upstream');
      r = gitRun(c, ['pull', '--rebase']);
    } else {
      r = gitRun(c, ['commit', '--amend', '-m', 'feat: h, reworded']);
    }
    assert.equal(r.status, 0, `${label}: ${r.stderr}`);
  }
});

test('git gate: pull --rebase=merges with no tracking config, naming origin main, is allowed', () => {
  const o = verified();
  const c = clonedProject(o);
  gitIn(c, ['config', '--unset', 'branch.main.remote']);
  gitIn(c, ['config', '--unset', 'branch.main.merge']);
  localStory(c, 'S1-3-z', (q) => fs.writeFileSync(path.join(q, 'src', 'z.js'), 'z\n'));
  assert.equal(gitRun(c, ['merge', '--no-ff', 'pm/S1-3-z', '-m', 'feat: z']).status, 0);
  gitIn(c, ['branch', '-D', 'pm/S1-3-z']);
  commitFile(o, 'src/other.js', 'upstream\n', 'feat: upstream');
  const r = gitRun(c, ['pull', '--rebase=merges', 'origin', 'main']);
  assert.equal(r.status, 0, r.stderr);
});

test('git gate: a rebase that resolves a record-only conflict is allowed; one that changes code while resolving a conflict is refused', () => {
  // Record-only: the story is claimed upstream, recorded locally, and upstream then changes the
  // claim, so recreating the merge conflicts in the story file alone; it is resolved to the record.
  {
    const o = verified();
    const z = 'docs/stories/S1-3-z.md';
    commitFile(o, z, storyText(claimFor('S1-3-z')), 'chore(S1-3-z): claim');
    const c = clonedProject(o);
    gitIn(c, ['checkout', '-qb', 'pm/S1-3-z', 'main']);
    commitFile(c, 'src/z.js', 'z\n', 'build(S1-3-z): code');
    const record = storyText({ ...claimFor('S1-3-z'), status: 'in-review', verifier: `PASS ${head(c, 'HEAD')}` });
    commitFile(c, z, record, 'chore(S1-3-z): record');
    gitIn(c, ['checkout', '-q', 'main']);
    assert.equal(gitRun(c, ['merge', '--no-ff', 'pm/S1-3-z', '-m', 'feat: z']).status, 0);
    gitIn(c, ['branch', '-D', 'pm/S1-3-z']);
    commitFile(o, z, storyText({ ...claimFor('S1-3-z'), updated: '2026-10-26 09:00' }), 'chore(S1-3-z): note');
    let r = gitRun(c, ['pull', '--rebase=merges']);
    assert.ok(r.status !== 0 && fs.existsSync(path.join(c, '.git', 'rebase-merge')), `the record conflict stops the rebase: ${r.stderr}`);
    for (let i = 0; i < 5 && r.status !== 0 && fs.existsSync(path.join(c, '.git', 'rebase-merge')); i++) {
      fs.writeFileSync(path.join(c, z), record);
      gitIn(c, ['add', z]);
      r = gitRun(c, ['rebase', '--continue']);
    }
    assert.equal(r.status, 0, r.stdout + r.stderr);
  }
  // Code: upstream edits the line the local story changed; the conflict is resolved by hand.
  const o = verified();
  const c = clonedProject(o);
  localStory(c, 'S1-3-z', (q) => fs.writeFileSync(path.join(q, 'src', 'fix.js'), lines('base').replace('line 7 base', 'line 7 story')));
  assert.equal(gitRun(c, ['merge', '--no-ff', 'pm/S1-3-z', '-m', 'feat: z']).status, 0);
  gitIn(c, ['branch', '-D', 'pm/S1-3-z']);
  commitFile(o, 'src/fix.js', lines('base').replace('line 7 base', 'line 7 upstream'), 'fix: upstream line 7');
  const before = head(c);
  let r = gitRun(c, ['pull', '--rebase=merges']);
  assert.ok(r.status !== 0 && fs.existsSync(path.join(c, '.git', 'rebase-merge')) && !/deliver blocked/.test(r.stderr), `the expected conflict stops the rebase: ${r.stderr}`);
  for (let i = 0; i < 5 && r.status !== 0 && /CONFLICT|could not apply|Resolve all conflicts/i.test(r.stdout + r.stderr); i++) {
    fs.writeFileSync(path.join(c, 'src', 'fix.js'), lines('base').replace('line 7 base', 'line 7 story and upstream'));
    gitIn(c, ['add', 'src/fix.js']);
    r = gitRun(c, ['rebase', '--continue']);
  }
  assert.notEqual(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stderr, /the rebase changed code while resolving a conflict, which cannot be compared with the verified code; use git pull --no-rebase \(a merge keeps both sides comparable\), or ship the resolution as a story/);
  gitRun(c, ['rebase', '--abort']);
  assert.equal(head(c), before);
});

test('git gate: a local story kept on its branch survives two successive pull --rebase=merges', () => {
  const o = verified();
  const c = clonedProject(o);
  localStory(c, 'S1-3-z', (q) => fs.writeFileSync(path.join(q, 'src', 'z.js'), 'z\n'));
  assert.equal(gitRun(c, ['merge', '--no-ff', 'pm/S1-3-z', '-m', 'feat: z']).status, 0);
  for (const n of [1, 2]) {
    commitFile(o, `src/up${n}.js`, `up ${n}\n`, `feat: upstream ${n}`);
    const r = gitRun(c, ['pull', '--rebase=merges']);
    assert.equal(r.status, 0, `pull ${n}: ${r.stderr}`);
  }
});

test('git gate: a verified change moved to another function while resolving a record conflict in a rebase is refused', () => {
  const o = verified();
  const two = 'function a() {\n  return false;\n}\nfunction b() {\n  return false;\n}\n';
  commitFile(o, 'src/f.js', two, 'feat: f');
  const z = 'docs/stories/S1-3-z.md';
  commitFile(o, z, storyText(claimFor('S1-3-z')), 'chore(S1-3-z): claim');
  const c = clonedProject(o);
  gitIn(c, ['checkout', '-qb', 'pm/S1-3-z', 'main']);
  commitFile(c, 'src/f.js', two.replace('return false', 'return true'), 'build(S1-3-z): code');
  const record = storyText({ ...claimFor('S1-3-z'), status: 'in-review', verifier: `PASS ${head(c, 'HEAD')}` });
  commitFile(c, z, record, 'chore(S1-3-z): record');
  gitIn(c, ['checkout', '-q', 'main']);
  assert.equal(gitRun(c, ['merge', '--no-ff', 'pm/S1-3-z', '-m', 'feat: z']).status, 0);
  gitIn(c, ['branch', '-D', 'pm/S1-3-z']);
  commitFile(o, z, storyText({ ...claimFor('S1-3-z'), updated: '2026-10-26 09:00' }), 'chore(S1-3-z): note');
  const before = head(c);
  let r = gitRun(c, ['pull', '--rebase=merges']);
  assert.ok(r.status !== 0 && fs.existsSync(path.join(c, '.git', 'rebase-merge')) && !/deliver blocked/.test(r.stderr), `the expected conflict stops the rebase: ${r.stderr}`);
  for (let i = 0; i < 5 && r.status !== 0 && fs.existsSync(path.join(c, '.git', 'rebase-merge')) && !/deliver blocked/.test(r.stderr); i++) {
    fs.writeFileSync(path.join(c, z), record);
    fs.writeFileSync(path.join(c, 'src', 'f.js'), 'function a() {\n  return false;\n}\nfunction b() {\n  return true;\n}\n');
    gitIn(c, ['add', '-A']);
    r = gitRun(c, ['rebase', '--continue']);
  }
  assert.notEqual(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stderr, /rewriting shipped story history changes code/);
  gitRun(c, ['rebase', '--abort']);
  assert.equal(head(c), before);
});

test('git gate: merging a hotfix that an unfinished story only cherry-picked is allowed', () => {
  const p = project();
  gitIn(p, ['checkout', '-qb', 'hotfix', 'main']);
  commitFile(p, 'src/hot.js', 'hot\n', 'fix: hot');
  gitIn(p, ['checkout', '-q', 'main']);
  commitFile(p, 'docs/stories/S1-4-b.md', storyText(claimFor('S1-4-b')), 'chore(S1-4-b): claim');
  gitIn(p, ['checkout', '-qb', 'pm/S1-4-b', 'main']);
  gitIn(p, ['cherry-pick', 'hotfix']);
  commitFile(p, 'docs/stories/S1-4-b.md', storyText({ ...claimFor('S1-4-b'), status: 'in-progress' }), 'chore(S1-4-b): status');
  gitIn(p, ['checkout', '-q', 'main']);
  const r = gitRun(p, ['merge', '--no-ff', 'hotfix', '-m', 'm']);
  assert.equal(r.status, 0, r.stderr);
});

test('git gate: a linear rebase replaying a story merge whose branch moved past the merged commit keeps the replay advice', () => {
  const o = verified();
  const c = clonedProject(o);
  localStory(c, 'S1-3-z', (q) => fs.writeFileSync(path.join(q, 'src', 'z.js'), 'z\n'));
  assert.equal(gitRun(c, ['merge', '--no-ff', 'pm/S1-3-z', '-m', 'feat: z']).status, 0);
  gitIn(c, ['checkout', '-q', 'pm/S1-3-z']);
  commitFile(c, 'docs/handoff/casey.md', 'later\n', 'docs: handoff');
  gitIn(c, ['checkout', '-q', 'main']);
  commitFile(o, 'src/other.js', 'upstream\n', 'feat: upstream');
  const r = gitRun(c, ['pull', '--rebase']);
  assert.notEqual(r.status, 0, r.stderr);
  assert.match(r.stderr, /a rebase is replaying a shipped story merge/);
  gitRun(c, ['rebase', '--abort']);
});

test('git gate: pull --rebase=merges origin main with no tracking config works when the remote URL ends in .git', () => {
  const o = verified();
  const bare = `${tmpDir('pmbare-')}/origin.git`;
  gitIn(o, ['clone', '-q', '--bare', o, bare]);
  const c = tmpDir('pmclone-');
  gitIn(c, ['clone', '-q', bare, '.']);
  gitIn(c, ['config', 'user.email', 'casey@example.com']);
  gitIn(c, ['config', 'user.name', 'Casey Example']);
  assert.equal(installGitHook(c).ok, true);
  gitIn(c, ['config', '--unset', 'branch.main.remote']);
  gitIn(c, ['config', '--unset', 'branch.main.merge']);
  localStory(c, 'S1-3-z', (q) => fs.writeFileSync(path.join(q, 'src', 'z.js'), 'z\n'));
  assert.equal(gitRun(c, ['merge', '--no-ff', 'pm/S1-3-z', '-m', 'feat: z']).status, 0);
  gitIn(c, ['branch', '-D', 'pm/S1-3-z']);
  // Upstream moves on in the bare origin.
  const u = tmpDir('pmup-');
  gitIn(u, ['clone', '-q', bare, '.']);
  gitIn(u, ['config', 'user.email', 'casey@example.com']);
  gitIn(u, ['config', 'user.name', 'Casey Example']);
  commitFile(u, 'src/other.js', 'upstream\n', 'feat: upstream');
  gitIn(u, ['push', '-q', 'origin', 'main']);
  const r = gitRun(c, ['pull', '--rebase=merges', 'origin', 'main']);
  assert.equal(r.status, 0, r.stderr);
});

test('git gate: amending a verified story merge to change a gitlink is refused even with diff.ignoreSubmodules=all', () => {
  const p = verified();
  assert.equal(gitRun(p, ['merge', '--no-ff', BRANCH, '-m', 'm']).status, 0);
  gitIn(p, ['branch', '-D', BRANCH]);
  gitIn(p, ['config', 'diff.ignoreSubmodules', 'all']);
  const before = head(p);
  gitIn(p, ['update-index', '--add', '--cacheinfo', `160000,${head(p, 'HEAD^1')},vendor/lib`]);
  const r = gitRun(p, ['commit', '--amend', '--no-edit']);
  refused(p, before, r, 'gitlink amend');
});

test('git gate: a story under overlapping remote names is a story under any reading', () => {
  const p = project();
  gitIn(p, ['remote', 'add', 'a', 'https://example.invalid/a.git']);
  // git remote add refuses a name nested under another remote's refs; config allows it.
  gitIn(p, ['config', 'remote.a/pm.url', 'https://example.invalid/apm.git']);
  gitIn(p, ['config', 'remote.a/pm.fetch', '+refs/heads/*:refs/remotes/a/pm/*']);
  // Read with remote a it is pm/S1-1-fix; read with remote a/pm it is S1-1-fix.
  gitIn(p, ['update-ref', `refs/remotes/a/${BRANCH}`, BRANCH]);
  gitIn(p, ['branch', '-D', BRANCH]);
  const before = head(p);
  refused(p, before, gitRun(p, ['merge', '--no-ff', `refs/remotes/a/${BRANCH}`, '-m', 'm']), 'overlapping remotes');
});

test('git gate: a leftover story ref of a removed slash-named remote is still a story', () => {
  const p = project();
  gitIn(p, ['update-ref', `refs/remotes/old/team/${BRANCH}`, BRANCH]);
  gitIn(p, ['branch', '-D', BRANCH]);
  const before = head(p);
  refused(p, before, gitRun(p, ['merge', '--no-ff', `refs/remotes/old/team/${BRANCH}`, '-m', 'm']), 'leftover remote story');
});

test('git gate: FETCH_HEAD urls match configured remotes the way git writes them', () => {
  assert.equal(fetchUrl('https://user:secret@example.com/team/repo.git/'), 'https://example.com/team/repo');
  assert.equal(fetchUrl('ssh://git@example.com/team/repo.git'), 'ssh://example.com/team/repo');
  // An scp-style url: git drops everything up to the first @ when a : follows it.
  assert.equal(fetchUrl('git@example.com:team/repo.git'), 'example.com:team/repo');
  assert.equal(fetchUrl('example.com:team/repo.git'), 'example.com:team/repo');
  assert.equal(fetchUrl('/srv/git/origin.git'), '/srv/git/origin');
  // A / before the first : is a local path, not scp-style: nothing is dropped.
  assert.equal(fetchUrl('/srv/a@b:c/repo.git'), '/srv/a@b:c/repo');
  // A Windows drive path is local too.
  assert.equal(fetchUrl('C:/git/a@b:c/repo.git'), 'C:/git/a@b:c/repo');
  assert.equal(fetchUrl('C:\\git\\a@b:c.git'), 'C:\\git\\a@b:c');
});

test('git gate: a plain pull --rebase flattening a non-story merge that a story forked from is not taken for that story', () => {
  const o = verified();
  const c = clonedProject(o);
  gitIn(c, ['checkout', '-qb', 'feat', 'main']);
  commitFile(c, 'src/feat.js', 'feat\n', 'feat: feature');
  gitIn(c, ['checkout', '-q', 'main']);
  assert.equal(gitRun(c, ['merge', '--no-ff', 'feat', '-m', 'merge feat']).status, 0);
  gitIn(c, ['branch', 'pm/S1-5-x', 'feat']);
  commitFile(o, 'src/other.js', 'upstream\n', 'feat: upstream');
  const r = gitRun(c, ['pull', '--rebase']);
  assert.doesNotMatch(r.stderr, /pm\/S1-5-x/);
  assert.equal(r.status, 0, r.stderr);
});

test('git gate: a refusal still exits with the refusal status when its message cannot be written', () => {
  const p = project();
  const ro = path.join(tmpDir('rofd-'), 'stderr');
  fs.writeFileSync(ro, '');
  const fd = fs.openSync(ro, 'r');
  try {
    const g = spawnSync(process.execPath, [GATE, RT_HOOK], { cwd: p, env: env(), input: `${head(p)} ${head(p, BRANCH)} refs/heads/main\n`, stdio: ['pipe', 'pipe', fd] });
    assert.equal(g.status, 86);
  } finally {
    fs.closeSync(fd);
  }
});

test('git gate: pull --rebase=merges origin main through an insteadOf-rewritten scp or ssh url, with no tracking config', () => {
  for (const url of ['git@example.com:org/repo.git', 'ssh://casey@example.com/org/repo.git/']) {
    const o = verified();
    const bare = `${tmpDir('pmbare-')}/origin.git`;
    gitIn(o, ['clone', '-q', '--bare', o, bare]);
    const c = tmpDir('pmclone-');
    gitIn(c, ['init', '-q', '-b', 'main']);
    gitIn(c, ['config', 'user.email', 'casey@example.com']);
    gitIn(c, ['config', 'user.name', 'Casey Example']);
    gitIn(c, ['config', `url.${bare}.insteadOf`, url]);
    gitIn(c, ['remote', 'add', 'origin', url]);
    gitIn(c, ['pull', '-q', 'origin', 'main']);
    // What git actually writes: the rewritten url, with .git stripped.
    assert.match(fs.readFileSync(path.join(c, '.git', 'FETCH_HEAD'), 'utf8'), new RegExp(`branch 'main' of ${bare.replace(/\.git$/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\n`));
    assert.equal(installGitHook(c).ok, true);
    localStory(c, 'S1-3-z', (q) => fs.writeFileSync(path.join(q, 'src', 'z.js'), 'z\n'));
    assert.equal(gitRun(c, ['merge', '--no-ff', 'pm/S1-3-z', '-m', 'feat: z']).status, 0);
    gitIn(c, ['branch', '-D', 'pm/S1-3-z']);
    const u = tmpDir('pmup-');
    gitIn(u, ['clone', '-q', bare, '.']);
    gitIn(u, ['config', 'user.email', 'casey@example.com']);
    gitIn(u, ['config', 'user.name', 'Casey Example']);
    commitFile(u, 'src/other.js', 'upstream\n', 'feat: upstream');
    gitIn(u, ['push', '-q', 'origin', 'main']);
    const r = gitRun(c, ['pull', '--rebase=merges', 'origin', 'main']);
    assert.equal(r.status, 0, `${url}: ${r.stderr}`);
  }
});

test('git gate: a gitlink staged into a --no-commit story merge is refused under diff.ignoreSubmodules=all, on both paths', () => {
  for (const version of [undefined, [2, 27, 0]]) {
    const p = verified({ install: false });
    installGitHook(p, version ? { version } : {});
    gitIn(p, ['config', 'diff.ignoreSubmodules', 'all']);
    const before = head(p);
    assert.equal(gitRun(p, ['merge', '--no-commit', '--no-ff', BRANCH]).status, 0);
    gitIn(p, ['update-index', '--add', '--cacheinfo', `160000,${head(p, 'HEAD')},vendor/lib`]);
    const r = gitRun(p, ['commit', '-m', 'm']);
    refused(p, before, r, version ? 'fallback gitlink' : 'reference-transaction gitlink');
  }
});

test('git gate: replay detection fails open when a non-story ref holds the story commit; the unchanged code then passes rewriteCheck', () => {
  const o = verified();
  const c = clonedProject(o);
  assert.equal(gitRun(c, ['merge', '--no-ff', `origin/${BRANCH}`, '-m', 'feat: ship']).status, 0);
  gitIn(c, ['branch', 'backup', `origin/${BRANCH}`]);
  commitFile(o, 'src/other.js', 'upstream\n', 'feat: upstream');
  const r = gitRun(c, ['pull', '--rebase']);
  assert.equal(r.status, 0, r.stderr);
});

test('git gate: pull --no-rebase origin main with no tracking config takes in shipped upstream story history', () => {
  const o = verified();
  const c = clonedProject(o);
  gitIn(c, ['config', '--unset', 'branch.main.remote']);
  gitIn(c, ['config', '--unset', 'branch.main.merge']);
  commitFile(c, 'src/local.js', 'local\n', 'feat: local');
  // Upstream ships the verified story, then a normal code commit on top.
  assert.equal(gitRun(o, ['merge', '--no-ff', BRANCH, '-m', 'feat: ship']).status, 0);
  commitFile(o, 'src/after.js', 'after\n', 'feat: after');
  const r = gitRun(c, ['pull', '--no-rebase', '--no-edit', 'origin', 'main']);
  assert.equal(r.status, 0, r.stderr);
});

test('git gate: an upstream ref that also reads as a story branch is not trusted as shipped history', () => {
  const p = project();
  gitIn(p, ['checkout', '-qb', 'stage', 'main']);
  gitIn(p, ['merge', '-q', '--no-ff', BRANCH, '-m', 'unverified story']);
  gitIn(p, ['checkout', '-q', 'main']);
  gitIn(p, ['remote', 'add', 'a', 'https://example.invalid/a.git']);
  gitIn(p, ['config', 'remote.a/pm.url', 'https://example.invalid/apm.git']);
  gitIn(p, ['config', 'remote.a/pm.fetch', '+refs/heads/*:refs/remotes/a/pm/*']);
  gitIn(p, ['config', 'branch.main.remote', 'a/pm']);
  gitIn(p, ['config', 'branch.main.merge', 'refs/heads/main']);
  gitIn(p, ['update-ref', 'refs/remotes/a/pm/main', 'stage']);
  const before = head(p);
  refused(p, before, gitRun(p, ['merge', '--ff-only', 'refs/remotes/a/pm/main']), 'story-readable upstream');
  const check = spawnSync(process.execPath, [INSTALL, '--check', p], { encoding: 'utf8', env: env() });
  assert.match(check.stdout, /refs\/remotes\/a\/pm\/main also reads as a story branch, so it is not trusted as shipped history/);
});

test('git gate: amending a shipped merge whose story recorded its PASS in a merge commit is refused', () => {
  const p = project([], { install: false });
  assert.equal(installGitHook(p).ok, true);
  const z = 'docs/stories/S1-3-z.md';
  commitFile(p, z, storyText(claimFor('S1-3-z')), 'chore(S1-3-z): claim');
  gitIn(p, ['checkout', '-qb', 'pm/S1-3-z', 'main']);
  commitFile(p, 'src/z.js', 'z\n', 'build(S1-3-z): code');
  const code = head(p, 'HEAD');
  gitIn(p, ['checkout', '-q', 'main']);
  commitFile(p, 'src/other.js', 'other\n', 'feat: other');
  gitIn(p, ['checkout', '-q', 'pm/S1-3-z']);
  // The PASS is recorded while committing an automatic merge of main into the story.
  assert.equal(gitRun(p, ['merge', '--no-commit', '--no-ff', 'main']).status, 0);
  fs.writeFileSync(path.join(p, z), storyText({ ...claimFor('S1-3-z'), status: 'in-review', verifier: `PASS ${code}` }));
  gitIn(p, ['add', z]);
  gitIn(p, ['commit', '-qm', 'merge main; record']);
  gitIn(p, ['checkout', '-q', 'main']);
  const m = gitRun(p, ['merge', '--no-ff', 'pm/S1-3-z', '-m', 'feat: z']);
  assert.equal(m.status, 0, m.stderr);
  gitIn(p, ['branch', '-D', 'pm/S1-3-z']);
  const before = head(p);
  fs.writeFileSync(path.join(p, 'src', 'z.js'), 'unverified\n');
  const r = gitRun(p, ['commit', '-a', '--amend', '--no-edit']);
  refused(p, before, r, 'amend after a PASS recorded in a merge');
});

// forkWithStory(o): a clone of o whose main merged the unverified story past any gate.
function forkWithStory(o) {
  const f = tmpDir('pmfork-');
  gitIn(f, ['clone', '-q', o, '.']);
  gitIn(f, ['config', 'user.email', 'casey@example.com']);
  gitIn(f, ['config', 'user.name', 'Casey Example']);
  gitIn(f, ['merge', '-q', '--no-ff', `origin/${BRANCH}`, '-m', 'unverified story']);
  return f;
}

test('git gate: FETCH_HEAD is trusted only for the pull now running, from the designated remote', () => {
  // (a) pull --no-rebase from a fork whose main holds an unverified story merge.
  {
    const o = project();
    const c = clonedProject(o);
    gitIn(c, ['remote', 'add', 'fork', forkWithStory(o)]);
    const before = head(c);
    refused(c, before, gitRun(c, ['pull', '--no-rebase', '--no-edit', 'fork', 'main']), '(a) pull from a fork');
  }
  // (b) fetch the fork, then merge the story directly.
  {
    const o = project();
    const c = clonedProject(o);
    gitIn(c, ['remote', 'add', 'fork', forkWithStory(o)]);
    gitIn(c, ['fetch', '-q', 'fork', 'main']);
    const before = head(c);
    refused(c, before, gitRun(c, ['merge', '--no-ff', `origin/${BRANCH}`, '-m', 'm']), '(b) merge after a fork fetch');
  }
  // (c) a FETCH_HEAD from origin, whose main holds the story, then a direct merge of the story.
  {
    const o = project();
    const c = clonedProject(o);
    gitIn(c, ['config', '--unset', 'branch.main.remote']);
    gitIn(c, ['config', '--unset', 'branch.main.merge']);
    gitRun(o, ['merge', '--no-ff', BRANCH, '-m', 'unverified story'], { DELIVER_NO_ENFORCE: '1' });
    gitIn(c, ['fetch', '-q', 'origin', 'main']);
    const before = head(c);
    refused(c, before, gitRun(c, ['merge', '--no-ff', `origin/${BRANCH}`, '-m', 'm']), '(c) merge after an origin fetch');
  }
});

test('git gate: the shipped-work scan uses no option newer than git 2.28', { skip: WIN && 'POSIX git wrapper' }, () => {
  const bin = tmpDir('pmgit228-');
  const real = spawnSync('which', ['git'], { encoding: 'utf8' }).stdout.trim();
  fs.writeFileSync(path.join(bin, 'git'), `#!/bin/sh\nfor a in "$@"; do case "$a" in --diff-merges*) echo "fatal: unrecognized argument: $a" >&2; exit 128;; esac; done\nexec "${real}" "$@"\n`, { mode: 0o755 });
  const p = project([], { install: false });
  const z = 'docs/stories/S1-3-z.md';
  commitFile(p, z, storyText(claimFor('S1-3-z')), 'chore(S1-3-z): claim');
  gitIn(p, ['checkout', '-qb', 'pm/S1-3-z', 'main']);
  commitFile(p, 'src/z.js', 'z\n', 'build(S1-3-z): code');
  const code = head(p, 'HEAD');
  gitIn(p, ['checkout', '-q', 'main']);
  commitFile(p, 'src/other.js', 'other\n', 'feat: other');
  gitIn(p, ['checkout', '-q', 'pm/S1-3-z']);
  gitIn(p, ['merge', '-q', '--no-commit', '--no-ff', 'main']);
  fs.writeFileSync(path.join(p, z), storyText({ ...claimFor('S1-3-z'), status: 'in-review', verifier: `PASS ${code}` }));
  gitIn(p, ['add', z]);
  gitIn(p, ['commit', '-qm', 'merge main; record']);
  gitIn(p, ['checkout', '-q', 'main']);
  gitIn(p, ['merge', '-q', '--no-ff', 'pm/S1-3-z', '-m', 'feat: z']);
  gitIn(p, ['branch', '-D', 'pm/S1-3-z']);
  // The amended merge, built without moving main: same parents, new code.
  fs.writeFileSync(path.join(p, 'src', 'z.js'), 'unverified\n');
  gitIn(p, ['add', 'src/z.js']);
  const tree = gitIn(p, ['write-tree']).trim();
  const amended = gitIn(p, ['commit-tree', tree, '-p', 'HEAD^1', '-p', 'HEAD^2', '-m', 'feat: z']).trim();
  const saved = process.env.PATH;
  process.env.PATH = `${bin}${path.delimiter}${saved}`;
  try {
    const v = judgeRefUpdate(p, { target: 'main', old: head(p), new: amended });
    assert.equal(v.allow, false, v.reason);
  } finally {
    process.env.PATH = saved;
  }
});

test('git gate: a gitlink cherry-pick of a story is a copy under diff.submodule=log', () => {
  const p = project([], { install: false });
  assert.equal(installGitHook(p).ok, true);
  // A story whose only code is a gitlink, built by hand (git add -A would drop a gitlink with no
  // checkout behind it).
  commitFile(p, 'docs/stories/S1-3-z.md', storyText(claimFor('S1-3-z')), 'chore(S1-3-z): claim');
  gitIn(p, ['checkout', '-qb', 'pm/S1-3-z', 'main']);
  gitIn(p, ['update-index', '--add', '--cacheinfo', `160000,${head(p, 'HEAD')},vendor/lib`]);
  gitIn(p, ['commit', '-qm', 'build(S1-3-z): gitlink']);
  commitFile(p, 'docs/stories/S1-3-z.md', storyText({ ...claimFor('S1-3-z'), status: 'in-review' }), 'chore(S1-3-z): record');
  gitIn(p, ['checkout', '-q', '-f', 'main']);
  gitIn(p, ['config', 'diff.submodule', 'log']);
  commitFile(p, 'docs/notes.md', 'n\n', 'docs: notes');
  const before = head(p);
  refused(p, before, gitRun(p, ['cherry-pick', 'pm/S1-3-z~1']), 'gitlink cherry-pick');
});

test('git gate: the remote-PR checks in the docs keep gitlinks visible', () => {
  const root = path.resolve(HOOKS_DIR, '..', '..', '..');
  for (const rel of ['plugins/deliver/skills/project-manager/references/environment.md', 'docs/specs/2026-10-24-v0.29-autonomous-trust.md']) {
    const text = fs.readFileSync(path.join(root, rel), 'utf8');
    assert.match(text, /git log --stat --ignore-submodules=none <sha>\.\.<head>/, rel);
    assert.match(text, /git diff --name-only --ignore-submodules=none </, rel);
  }
});

test('git gate: a gitlink commit on top of a story merge is refused under submodule.<name>.ignore=all', () => {
  const p = verified();
  commitFile(p, '.gitmodules', '[submodule "x"]\n\tpath = vendor/lib\n\turl = https://example.invalid/x.git\n', 'chore: gitmodules');
  gitIn(p, ['config', 'submodule.x.ignore', 'all']);
  gitIn(p, ['checkout', '-qb', 'stage', 'main']);
  gitIn(p, ['merge', '-q', '--no-ff', BRANCH, '-m', 'm']);
  gitIn(p, ['update-index', '--add', '--cacheinfo', `160000,${head(p, 'HEAD^1')},vendor/lib`]);
  gitIn(p, ['commit', '-qm', 'chore: gitlink on top']);
  gitIn(p, ['checkout', '-q', '-f', 'main']);
  const before = head(p);
  refused(p, before, gitRun(p, ['merge', '--ff-only', 'stage']), 'gitlink on top of a story merge');
});

test('git gate: a preset GIT_REFLOG_ACTION does not make an unrelated update a pull; a tool-run pull is trusted only bound to its operation', () => {
  // A tool that presets GIT_REFLOG_ACTION runs git pull with no tracking config. A rebasing or
  // merging pull is still bound to its operation (the rebase state's onto, or MERGE_HEAD), and
  // passes; a fast-forward pull leaves no such state, so FETCH_HEAD is not trusted and the upstream
  // code above the shipped story is refused. --check says to set an upstream, which makes it pass.
  for (const mode of ['--rebase=merges', '--no-rebase', '--ff-only']) {
    const o = verified();
    const c = clonedProject(o);
    gitIn(c, ['config', '--unset', 'branch.main.remote']);
    gitIn(c, ['config', '--unset', 'branch.main.merge']);
    if (mode !== '--ff-only') commitFile(c, 'src/local.js', 'local\n', 'feat: local');
    assert.equal(gitRun(o, ['merge', '--no-ff', BRANCH, '-m', 'feat: ship']).status, 0);
    commitFile(o, 'src/after.js', 'after\n', 'feat: after');
    const r = gitRun(c, ['pull', mode, '--no-edit', 'origin', 'main'], { GIT_REFLOG_ACTION: 'ide' });
    if (mode !== '--ff-only') {
      assert.equal(r.status, 0, `${mode}: ${r.stderr}`);
      continue;
    }
    assert.notEqual(r.status, 0, r.stderr);
    assert.match(r.stderr, /deliver blocked/);
    gitIn(c, ['reset', '-q', '--merge']);
    const check = spawnSync(process.execPath, [INSTALL, '--check', c], { encoding: 'utf8', env: env() });
    assert.match(check.stdout, /main has no upstream; .*set one with git branch --set-upstream-to "origin\/main" "main"/);
    gitIn(c, ['branch', '--set-upstream-to', 'origin/main', 'main']);
    const t = gitRun(c, ['pull', mode, '--no-edit', 'origin', 'main'], { GIT_REFLOG_ACTION: 'ide' });
    assert.equal(t.status, 0, t.stderr);
  }
  // GIT_REFLOG_ACTION=pull on a direct story merge after a fetch: still refused.
  const o = project();
  const c = clonedProject(o);
  gitIn(c, ['config', '--unset', 'branch.main.remote']);
  gitIn(c, ['config', '--unset', 'branch.main.merge']);
  gitRun(o, ['merge', '--no-ff', BRANCH, '-m', 'unverified story'], { DELIVER_NO_ENFORCE: '1' });
  gitIn(c, ['fetch', '-q', 'origin', 'main']);
  const before = head(c);
  refused(c, before, gitRun(c, ['merge', '--no-ff', `origin/${BRANCH}`, '-m', 'm'], { GIT_REFLOG_ACTION: 'pull' }), 'merge dressed as a pull');
});

test('git gate: with a narrowed fetch refspec, a pull of the integration branch skips the stale tracking-ref comparison', () => {
  const o = verified();
  const c = clonedProject(o);
  gitIn(c, ['config', '--unset', 'branch.main.remote']);
  gitIn(c, ['config', '--unset', 'branch.main.merge']);
  gitIn(c, ['config', 'remote.origin.fetch', '+refs/heads/pm/*:refs/remotes/origin/pm/*']);
  localStory(c, 'S1-3-z', (q) => fs.writeFileSync(path.join(q, 'src', 'z.js'), 'z\n'));
  assert.equal(gitRun(c, ['merge', '--no-ff', 'pm/S1-3-z', '-m', 'feat: z']).status, 0);
  gitIn(c, ['branch', '-D', 'pm/S1-3-z']);
  commitFile(o, 'src/other.js', 'upstream\n', 'feat: upstream');
  const r = gitRun(c, ['pull', '--rebase=merges', 'origin', 'main']);
  assert.equal(r.status, 0, r.stderr);
});

test('git gate: a pull with no tracking config that stops on a record conflict, concluded by commit or rebase --continue, is allowed', () => {
  // [mode, rebase backend, the side the story record is resolved to]
  for (const [mode, backend, side] of [['--no-rebase', null, '--theirs'], ['--no-rebase', null, '--ours'], ['--rebase', 'merge', '--theirs'], ['--rebase', 'merge', '--ours'], ['--rebase', 'apply', '--theirs']]) {
    const o = verified();
    const c = clonedProject(o);
    gitIn(c, ['config', '--unset', 'branch.main.remote']);
    gitIn(c, ['config', '--unset', 'branch.main.merge']);
    if (backend) gitIn(c, ['config', 'rebase.backend', backend]);
    // Local main records something else in the story file; upstream ships the story, then code.
    commitFile(c, STORY, storyText({ ...claimFor('S1-1-fix'), updated: '2026-10-26 07:00' }), 'chore(S1-1-fix): note');
    assert.equal(gitRun(o, ['merge', '--no-ff', BRANCH, '-m', 'feat: ship']).status, 0);
    commitFile(o, 'src/after.js', 'after\n', 'feat: after');
    const r = gitRun(c, ['pull', mode, '--no-edit', 'origin', 'main']);
    assert.notEqual(r.status, 0, `${mode}: the record conflict stops the pull: ${r.stdout}${r.stderr}`);
    assert.doesNotMatch(r.stderr, /deliver blocked/);
    // In a merge, --theirs is upstream's record and --ours the local one; in a rebase, --theirs is
    // the local commit being replayed and --ours upstream's. Either resolution changes no code.
    gitIn(c, ['checkout', side, STORY]);
    gitIn(c, ['add', STORY]);
    const done = mode === '--rebase' ? gitRun(c, ['rebase', '--continue']) : gitRun(c, ['commit', '--no-edit']);
    assert.doesNotMatch(done.stderr, /deliver blocked/, `${mode} ${backend ?? ''} ${side}`);
    assert.equal(done.status, 0, `${mode}: ${done.stdout}${done.stderr}`);
  }
});

test('git gate: an integration branch name is parsed whole: release+fix is guarded exactly; an invalid name is reported, not cut', () => {
  const p = project();
  fs.writeFileSync(path.join(p, 'docs', 'plan.md'), '# Plan\n- Integration branch: `release+fix`  <!-- note -->\n');
  gitIn(p, ['add', 'docs/plan.md']);
  gitIn(p, ['commit', '-qm', 'plan: release+fix']);
  gitIn(p, ['branch', 'release+fix', 'main']);
  const r = installGitHook(p);
  assert.deepEqual(r.branches, ['release+fix']);
  assert.match(fs.readFileSync(path.join(p, '.git', 'hooks', RT_HOOK), 'utf8'), /"refs\/heads\/release\+fix"\)/);
  gitIn(p, ['checkout', '-q', 'release+fix']);
  const before = head(p, 'release+fix');
  const m = gitRun(p, ['merge', '--no-ff', BRANCH, '-m', 'm']);
  assert.notEqual(m.status, 0, m.stderr);
  assert.equal(head(p, 'release+fix'), before);
  gitIn(p, ['checkout', '-q', '-f', 'main']);
  // An invalid name.
  fs.writeFileSync(path.join(p, 'docs', 'plan.md'), '# Plan\n- Integration branch: `rel~ease`\n');
  gitIn(p, ['commit', '-qam', 'plan: invalid']);
  const bad = installGitHook(p);
  assert.equal(bad.ok, false);
  assert.match(bad.notes.join('\n'), /integration branch rel~ease is not a valid branch name; the git-level gate cannot watch it, and story merges through Claude are refused until the plan names a valid branch/);
  assert.ok(!bad.branches.includes('rel'), 'never cut down to a valid prefix');
});

test('git gate: planName reads the whole delimited value and refuses invalid names', () => {
  assert.equal(planName('- Integration branch: <main>  <!-- the branch every story is cut from -->'), 'main');
  assert.equal(planName('- Integration branch: `release+fix` (since S3)'), 'release+fix');
  assert.equal(planName('- Integration branch: develop'), 'develop');
  assert.equal(planEntry('- Integration branch: `rel~ease`'), 'rel~ease');
  for (const bad of ['rel~ease', 'a..b', '-x', 'x.lock', 'a//b', 'x.', 'HEAD', 'a@{b']) assert.equal(planName(`- Integration branch: \`${bad}\``), null, bad);
});

test('git gate: FETCH_HEAD trust is bound to the operation: no matching pull, MERGE_HEAD, or rebase state, no trust', () => {
  // Upstream ships a verified story, then code; the clone has no tracking config and fetches.
  const setup = () => {
    const o = verified();
    const c = clonedProject(o);
    gitIn(c, ['config', '--unset', 'branch.main.remote']);
    gitIn(c, ['config', '--unset', 'branch.main.merge']);
    assert.equal(gitRun(o, ['merge', '--no-ff', BRANCH, '-m', 'feat: ship']).status, 0);
    commitFile(o, 'src/after.js', 'after\n', 'feat: after');
    gitIn(c, ['fetch', '-q', 'origin', 'main']);
    return { c, fetched: gitIn(c, ['rev-parse', 'FETCH_HEAD']).trim() };
  };
  const gitDir = (c, rel) => path.resolve(c, gitIn(c, ['rev-parse', '--git-path', rel]).trim());
  const cases = [
    ['a fast-forward run by a tool (GIT_REFLOG_ACTION=ide)', () => {}],
    ['a leftover MERGE_HEAD of another commit', (c) => fs.writeFileSync(gitDir(c, 'MERGE_HEAD'), `${head(c)}\n`)],
    ['rebase state onto another commit', (c) => { fs.mkdirSync(gitDir(c, 'rebase-merge'), { recursive: true }); fs.writeFileSync(path.join(gitDir(c, 'rebase-merge'), 'onto'), `${head(c)}\n`); fs.writeFileSync(path.join(gitDir(c, 'rebase-merge'), 'head-name'), 'refs/heads/main\n'); }],
    ['rebase state for another branch', (c, fetched) => { fs.mkdirSync(gitDir(c, 'rebase-merge'), { recursive: true }); fs.writeFileSync(path.join(gitDir(c, 'rebase-merge'), 'onto'), `${fetched}\n`); fs.writeFileSync(path.join(gitDir(c, 'rebase-merge'), 'head-name'), 'refs/heads/other\n'); }],
  ];
  for (const [label, leave] of cases) {
    const { c, fetched } = setup();
    leave(c, fetched);
    const before = head(c);
    const r = gitRun(c, ['update-ref', 'refs/heads/main', fetched, before], { GIT_REFLOG_ACTION: 'ide' });
    refused(c, before, r, label);
  }
  // With the pull's own state, the same update is trusted.
  const { c, fetched } = setup();
  fs.writeFileSync(gitDir(c, 'MERGE_HEAD'), `${fetched}\n`);
  const merged = gitIn(c, ['commit-tree', `${fetched}^{tree}`, '-p', 'HEAD', '-p', fetched, '-m', 'merge']).trim();
  const ok = gitRun(c, ['update-ref', 'refs/heads/main', merged, head(c)], { GIT_REFLOG_ACTION: 'ide' });
  assert.equal(ok.status, 0, ok.stderr);
});

test('git gate: the plan line `main, as agreed` guards main; a plan naming a branch that does not exist is reported; HEAD is invalid, @ valid as git says', () => {
  const p = project();
  fs.writeFileSync(path.join(p, 'docs', 'plan.md'), '# Plan\n- Integration branch: main, as agreed\n');
  gitIn(p, ['add', 'docs/plan.md']);
  gitIn(p, ['commit', '-qm', 'plan: main, as agreed']);
  const r = installGitHook(p);
  assert.deepEqual(r.branches, ['main']);
  assert.equal(r.ok, true, JSON.stringify(r.notes));
  const before = head(p);
  refused(p, before, gitRun(p, ['merge', '--no-ff', BRANCH, '-m', 'm']), 'main guarded');
  clean(p);
  fs.writeFileSync(path.join(p, 'docs', 'plan.md'), '# Plan\n- Integration branch: `trunk`\n');
  gitIn(p, ['commit', '-qam', 'plan: trunk'], { DELIVER_NO_ENFORCE: '1' });
  const t = installGitHook(p);
  assert.equal(t.ok, false);
  assert.match(t.notes.join('\n'), /integration branch trunk does not exist \(no refs\/heads\/trunk or refs\/remotes\/origin\/trunk\); check the plan's Integration branch line/);
  fs.writeFileSync(path.join(p, 'docs', 'plan.md'), '# Plan\n- Integration branch: `HEAD`\n');
  gitRun(p, ['commit', '-qam', 'plan: HEAD'], { DELIVER_NO_ENFORCE: '1' });
  const h = installGitHook(p);
  assert.equal(h.ok, false);
  assert.match(h.notes.join('\n'), /integration branch HEAD is not a valid branch name/);
  assert.doesNotMatch(fs.existsSync(path.join(p, '.git', 'hooks', RT_HOOK)) ? fs.readFileSync(path.join(p, '.git', 'hooks', RT_HOOK), 'utf8') : '', /refs\/heads\/HEAD/);
  assert.equal(planName('- Integration branch: `@`'), '@', 'git check-ref-format --branch accepts @');
  assert.equal(planName('- Integration branch: `HEAD`'), null);
});

test('git gate: mapsBranch honours a negative refspec: the excluded branch is not compared with its stale tracking ref', () => {
  const o = verified();
  const c = clonedProject(o);
  gitIn(c, ['config', '--unset', 'branch.main.remote']);
  gitIn(c, ['config', '--unset', 'branch.main.merge']);
  gitIn(c, ['config', '--add', 'remote.origin.fetch', '^refs/heads/main']);
  localStory(c, 'S1-3-z', (q) => fs.writeFileSync(path.join(q, 'src', 'z.js'), 'z\n'));
  assert.equal(gitRun(c, ['merge', '--no-ff', 'pm/S1-3-z', '-m', 'feat: z']).status, 0);
  gitIn(c, ['branch', '-D', 'pm/S1-3-z']);
  commitFile(o, 'src/other.js', 'upstream\n', 'feat: upstream');
  const r = gitRun(c, ['pull', '--rebase=merges', 'origin', 'main']);
  assert.equal(r.status, 0, r.stderr);
});

test('git gate: branchNameOk falls back to the JS rule when git times out, and refuses HEAD even if git accepts it', { skip: WIN && 'POSIX git stub' }, async () => {
  const lib = await import(path.join(HOOKS_DIR, 'lib.mjs'));
  const bin = tmpDir('pmslowgit-');
  fs.writeFileSync(path.join(bin, 'git'), '#!/bin/sh\nsleep 3\necho "$4"\n', { mode: 0o755 });
  const saved = process.env.PATH;
  process.env.PATH = `${bin}${path.delimiter}${saved}`;
  try {
    assert.equal(lib.branchNameOk(tmpDir('pmrepo-'), 'slow-but-valid', { timeout: 200 }), true, 'a timeout falls back to validBranchName');
    assert.equal(lib.branchNameOk(tmpDir('pmrepo-'), 'slow~invalid', { timeout: 200 }), false);
  } finally {
    process.env.PATH = saved;
  }
  // An older git that accepts HEAD: a stub that prints the name back.
  fs.writeFileSync(path.join(bin, 'git'), '#!/bin/sh\necho "$5"\n', { mode: 0o755 });
  process.env.PATH = `${bin}${path.delimiter}${saved}`;
  try {
    assert.equal(lib.branchNameOk(tmpDir('pmrepo-'), 'HEAD'), false);
  } finally {
    process.env.PATH = saved;
  }
});

test('git gate: plan names keep their parentheses where they belong', () => {
  assert.equal(planName('- Integration branch: <main>,'), 'main');
  assert.equal(planName('- Integration branch: (main)'), 'main');
  assert.equal(planName('- Integration branch: feature(x)'), 'feature(x)');
  assert.equal(planName('- Integration branch: "main".'), 'main');
  assert.equal(planName('- Integration branch: (feature(x))'), 'feature(x)');
});

test('git gate: the missing-branch check asks for the exact refs, and spares an unborn current branch', () => {
  // A remote branch whose name only ends in /main is not main.
  const p = project();
  fs.writeFileSync(path.join(p, 'docs', 'plan.md'), '# Plan\n- Integration branch: `trunk`\n');
  gitIn(p, ['add', 'docs/plan.md']);
  gitIn(p, ['commit', '-qm', 'plan: trunk']);
  gitIn(p, ['remote', 'add', 'origin', 'https://example.invalid/repo.git']);
  gitIn(p, ['update-ref', 'refs/remotes/origin/team/trunk', 'main']);
  gitIn(p, ['update-ref', 'refs/remotes/origin/archive/trunk', 'main']);
  assert.match(installGitHook(p).notes.join('\n'), /integration branch trunk does not exist/);
  gitIn(p, ['update-ref', 'refs/remotes/origin/trunk', 'main']);
  assert.doesNotMatch(installGitHook(p).notes.join('\n'), /does not exist/);
  // An empty repository on its unborn integration branch.
  const e = tmpDir('pmempty-');
  gitIn(e, ['init', '-q', '-b', 'main']);
  fs.mkdirSync(path.join(e, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(e, 'docs', 'approval.json'), '{"status":"approved"}\n');
  assert.doesNotMatch(installGitHook(e).notes.join('\n'), /does not exist/);
});

test('git gate: with an invalid plan, the Bash hook still finds a story merged by SHA, and lets a non-story merge through', () => {
  const p = project();
  fs.writeFileSync(path.join(p, 'docs', 'plan.md'), '# Plan\n- Integration branch: `main~1`\n');
  gitIn(p, ['add', 'docs/plan.md']);
  gitIn(p, ['commit', '-qm', 'plan: invalid'], { DELIVER_NO_ENFORCE: '1' });
  const tip = head(p, BRANCH);
  const byName = bash(p, `git merge --no-ff ${BRANCH} -m m`);
  assert.equal(byName.status, 2, byName.stderr);
  const bySha = bash(p, `git merge --no-ff ${tip} -m m`);
  assert.equal(bySha.status, 2, bySha.stderr);
  assert.match(bySha.stderr, /is not a valid branch name; story merges are refused until the plan names a valid branch/);
  gitIn(p, ['checkout', '-qb', 'feature', 'main']);
  commitFile(p, 'src/feature.js', 'f\n', 'feature');
  gitIn(p, ['checkout', '-q', 'main']);
  const plain = bash(p, 'git merge --no-ff feature -m m');
  assert.equal(plain.status, 0, plain.stderr);
});

test('git gate: a tag that shares the integration branch name does not hide the project', () => {
  // The plan naming release lives on release alone, so release is found as a local branch whose
  // committed plan names itself; main's plan names no integration branch.
  const p = project();
  fs.writeFileSync(path.join(p, 'docs', 'plan.md'), '# Plan\n');
  gitIn(p, ['add', 'docs/plan.md']);
  gitIn(p, ['commit', '-qm', 'plan: none']);
  gitIn(p, ['checkout', '-qb', 'release', 'main']);
  fs.writeFileSync(path.join(p, 'docs', 'plan.md'), '# Plan\n- Integration branch: `release`\n');
  gitIn(p, ['commit', '-qam', 'plan: release']);
  gitIn(p, ['checkout', '-q', 'main']);
  gitIn(p, ['tag', 'release', 'main']);
  const r = installGitHook(p);
  assert.deepEqual(r.branches, ['release']);
  gitIn(p, ['checkout', '-q', 'release']);
  const before = head(p, 'refs/heads/release');
  const m = gitRun(p, ['merge', '--no-ff', BRANCH, '-m', 'm']);
  assert.notEqual(m.status, 0, m.stderr);
  assert.equal(head(p, 'refs/heads/release'), before);
  const b = bash(p, `git merge --no-ff ${BRANCH} -m m`);
  assert.equal(b.status, 2, b.stderr);
});

test('git gate: clustered short options consume their values: -qm, -qmmsg, -nm', () => {
  const ok = verified();
  for (const cmd of [`git merge --no-ff -qm "Ship story" ${BRANCH}`, `git merge --no-ff -qmShip ${BRANCH}`, `git merge --no-ff -nm msg ${BRANCH}`, `git merge --no-ff -S -qm msg ${BRANCH}`]) {
    const r = bash(ok, cmd);
    assert.equal(r.status, 0, `${cmd}: ${r.stderr}`);
  }
  const bad = project();
  const r = bash(bad, `git merge --no-ff -qm "Ship story" ${BRANCH}`);
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /no verifier verdict/);
  // commit -qnm: the n in the cluster skips hooks.
  gitRun(bad, ['merge', '--no-commit', '--no-ff', BRANCH]);
  assert.equal(bash(bad, 'git commit -qnm msg').status, 2);
  gitIn(bad, ['merge', '--abort']);
});

test('git gate: under an invalid plan, a merge into a story branch goes on, and an earlier ref write is SEPARATE', () => {
  const p = project();
  fs.writeFileSync(path.join(p, 'docs', 'plan.md'), '# Plan\n- Integration branch: `main~1`\n');
  gitIn(p, ['add', 'docs/plan.md']);
  gitIn(p, ['commit', '-qm', 'plan: invalid'], { DELIVER_NO_ENFORCE: '1' });
  gitIn(p, ['checkout', '-qb', 'develop', BRANCH]);
  gitIn(p, ['checkout', '-q', BRANCH]);
  const r = bash(p, 'git merge develop');
  assert.equal(r.status, 0, r.stderr);
  gitIn(p, ['checkout', '-q', 'main']);
  const s = bash(p, `git fetch . ${BRANCH}:refs/heads/tmp && git merge tmp`);
  assert.equal(s.status, 2, s.stderr);
  assert.match(s.stderr, /run the merge as its own command/);
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
  assert.match(r.notes.join('\n'), /git < 2\.28 .*fast-forward updates, squash merges, and cherry-picks are not gated/);
  const before = head(p);
  const m = gitRun(p, ['merge', '--no-ff', BRANCH, '-m', 'm']);
  refused(p, before, m, 'fallback merge commit');
  assert.match(m.stderr, /Run git merge --abort, fix the cause, and merge again/);
});

// --- installer safety ---

test('git gate: the chaining lines keep a foreign reference-transaction hook working and stop on a refusal', { skip: NO_SH }, () => {
  const p = project([{ id: 'S1-1-fix' }], { install: false });
  const f = path.join(p, '.git', 'hooks', RT_HOOK);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const body = '[ "$1" = prepared ] || exit 0\nwhile read -r old new ref; do\n  [ "$ref" = refs/heads/release ] && { echo "no release updates" >&2; exit 1; }\ndone\nexit 0\n';
  fs.writeFileSync(f, `#!/bin/sh\n${body}`, { mode: 0o755 });
  const r = installGitHook(p);
  assert.equal(r.hooks[RT_HOOK], 'foreign');
  const note = r.notes.find((n) => n.includes('right after its #! line'));
  const add = note.split('right after its #! line: ')[1];
  fs.writeFileSync(f, `#!/bin/sh\n${add}\n${body}`, { mode: 0o755 });
  const chained = installGitHook(p);
  assert.equal(chained.hooks[RT_HOOK], 'chained', 'a hook that calls the copy counts as in place');
  assert.equal(chained.ok, true);
  const before = head(p);
  refused(p, before, gitRun(p, ['merge', '--no-ff', BRANCH, '-m', 'm']), 'chained gate');
  clean(p);
  const rel = gitRun(p, ['branch', 'release']);
  assert.notEqual(rel.status, 0);
  assert.match(rel.stderr, /no release updates/);
  assert.equal(gitRun(p, ['branch', 'other']).status, 0, 'an unrelated update passes both');
});

test('git gate: after --uninstall, the chaining lines in a foreign hook fail open', { skip: NO_SH }, () => {
  const p = project([{ id: 'S1-1-fix' }], { install: false });
  const f = path.join(p, '.git', 'hooks', RT_HOOK);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  const note = installGitHook(p).notes.find((n) => n.includes('right after its #! line'));
  const add = note.split('right after its #! line: ')[1];
  fs.writeFileSync(f, `#!/bin/sh\n${add}\nexit 0\n`, { mode: 0o755 });
  const u = spawnSync(process.execPath, [INSTALL, '--uninstall', p], { encoding: 'utf8', env: env() });
  assert.equal(u.status, 0, u.stdout);
  assert.match(u.stdout, /remove the deliver lines you added/);
  const r = gitRun(p, ['branch', 'x']);
  assert.equal(r.status, 0, r.stderr);
});

test('git gate: session start points to the installer for chaining lines, whole, even on a long path', () => {
  const p = project([{ id: 'S1-1-fix' }], { install: false });
  const long = path.join(tmpDir('pmlong-'), 'a'.repeat(120), 'b'.repeat(120));
  fs.mkdirSync(path.dirname(long), { recursive: true });
  fs.renameSync(p, long);
  fs.writeFileSync(path.join(long, '.git', 'hooks', RT_HOOK), '#!/bin/sh\necho mine\n', { mode: 0o755 });
  const s = runHook('session-context.mjs', { cwd: long });
  const line = s.stdout.split('\n').find((l) => l.includes("reference-transaction is not deliver's"));
  assert.ok(line, s.stdout);
  assert.doesNotMatch(line, /deliver_in/);
  assert.ok(line.includes(`node "${INSTALL.replace(/\\/g, '/')}" --check "${long.replace(/\\/g, '/')}"`), line);
});

test('git gate: installGitHook with check and uninstall together writes nothing', () => {
  const p = project();
  const r = installGitHook(p, { check: true, uninstall: true });
  assert.equal(r.ok, false);
  assert.equal(gitRun(p, ['config', '--local', '--get', 'deliver.mergeGate']).status, 1);
  assert.ok(fs.existsSync(path.join(p, '.git', 'hooks', RT_HOOK)));
});

test('git gate: a husky-style in-tree core.hooksPath that runs the printed lines is chained; check needs the copy current', { skip: NO_SH }, () => {
  const p = project([{ id: 'S1-1-fix' }], { install: false });
  gitIn(p, ['config', 'core.hooksPath', '.husky']);
  const first = installGitHook(p);
  assert.equal(first.hooks[RT_HOOK], 'skipped');
  const note = first.notes.find((n) => n.includes('right after its #! line'));
  const add = note.split('right after its #! line: ')[1];
  fs.mkdirSync(path.join(p, '.husky'), { recursive: true });
  fs.writeFileSync(path.join(p, '.husky', RT_HOOK), `#!/bin/sh\n${add}\nexit 0\n`, { mode: 0o755 });
  const r = installGitHook(p);
  assert.equal(r.hooks[RT_HOOK], 'chained', JSON.stringify(r));
  assert.equal(r.ok, true);
  assert.doesNotMatch(r.notes.join('\n'), /add these as the lines/);
  const before = head(p);
  refused(p, before, gitRun(p, ['merge', '--no-ff', BRANCH, '-m', 'm']), 'husky chained');
  clean(p);
  assert.equal(installGitHook(p, { check: true }).hooks[RT_HOOK], 'chained');
  const copy = path.join(p, '.git', 'deliver', RT_HOOK);
  fs.appendFileSync(copy, '# edited\n');
  const stale = installGitHook(p, { check: true });
  assert.equal(stale.hooks[RT_HOOK], 'copy-stale');
  assert.equal(stale.ok, false);
  fs.rmSync(copy);
  const gone = installGitHook(p, { check: true });
  assert.equal(gone.hooks[RT_HOOK], 'copy-missing');
  assert.equal(gone.ok, false);
});

const HAS_PY = spawnSync('python3', ['-c', 'pass'], { windowsHide: true }).status === 0;

test('git gate: a Python reference-transaction hook gets an sh wrapper; following it keeps both working', { skip: (NO_SH || !HAS_PY) && 'needs sh and python3' }, () => {
  const p = project([{ id: 'S1-1-fix' }], { install: false });
  const f = path.join(p, '.git', 'hooks', RT_HOOK);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const py = '#!/usr/bin/env python3\nimport sys\nif sys.argv[1] == "prepared":\n    for line in sys.stdin:\n        if line.split()[2] == "refs/heads/release":\n            sys.stderr.write("no release updates\\n")\n            sys.exit(1)\nsys.exit(0)\n';
  fs.writeFileSync(f, py, { mode: 0o755 });
  const r = installGitHook(p);
  assert.equal(r.hooks[RT_HOOK], 'foreign');
  const note = r.notes.find((n) => n.includes('its interpreter is not sh'));
  assert.ok(note, r.notes.join('\n'));
  assert.doesNotMatch(note, /right after its #! line/);
  const script = note.split('executable:\n')[1];
  fs.renameSync(f, `${f}.local`);
  fs.writeFileSync(f, script, { mode: 0o755 });
  const after = installGitHook(p);
  assert.equal(after.hooks[RT_HOOK], 'chained', JSON.stringify(after));
  assert.equal(installGitHook(p, { check: true }).hooks[RT_HOOK], 'chained');
  const before = head(p);
  refused(p, before, gitRun(p, ['merge', '--no-ff', BRANCH, '-m', 'm']), 'wrapped gate');
  clean(p);
  const rel = gitRun(p, ['branch', 'release']);
  assert.notEqual(rel.status, 0);
  assert.match(rel.stderr, /no release updates/);
  assert.equal(gitRun(p, ['branch', 'other']).status, 0);
  // Pasting the sh lines into the Python hook instead is not taken as chained.
  fs.writeFileSync(f, `${py.split('\n')[0]}\n# ${path.join(p, '.git', 'deliver', RT_HOOK).replace(/\\/g, '/')}\n${py.split('\n').slice(1).join('\n')}`, { mode: 0o755 });
  assert.equal(installGitHook(p).hooks[RT_HOOK], 'foreign');
});

test('git gate: a chained hook that is not executable is chained-inactive, and check fails', { skip: (NO_SH || WIN) && 'POSIX modes' }, () => {
  const p = project([{ id: 'S1-1-fix' }], { install: false });
  const f = path.join(p, '.git', 'hooks', RT_HOOK);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  const add = installGitHook(p).notes.find((n) => n.includes('right after its #! line')).split('right after its #! line: ')[1];
  fs.writeFileSync(f, `#!/bin/sh\n${add}\nexit 0\n`);
  fs.chmodSync(f, 0o644);
  const c = installGitHook(p, { check: true });
  assert.equal(c.hooks[RT_HOOK], 'chained-inactive');
  assert.equal(c.ok, false);
  assert.match(c.notes.join('\n'), /is not executable, so git skips it; run chmod \+x/);
});

test('git gate: a symlinked hook, Python, sh, or dangling, gets the wrapper, and its target is never written', { skip: WIN && 'symlinks' }, () => {
  const p = project([{ id: 'S1-1-fix' }], { install: false });
  const target = path.join(tmpDir('pyhook-'), 'policy.py');
  const py = '#!/usr/bin/env python3\nimport sys\nsys.exit(0)\n';
  fs.writeFileSync(target, py, { mode: 0o755 });
  const f = path.join(p, '.git', 'hooks', RT_HOOK);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.symlinkSync(target, f);
  const r = installGitHook(p);
  assert.equal(r.hooks[RT_HOOK], 'foreign');
  const note = r.notes.find((n) => n.includes(RT_HOOK) && n.includes('is a symlink'));
  const symlinked = /it is a symlink, whose target may be shared and is never to be edited, so deliver's lines cannot go inside it; rename it to reference-transaction\.local/;
  assert.match(note, symlinked);
  assert.doesNotMatch(note, /right after its #! line/);
  assert.equal(fs.readFileSync(target, 'utf8'), py);
  assert.ok(fs.lstatSync(f).isSymbolicLink());
  // An sh target is shared all the same: the wrapper again, never inline lines.
  fs.writeFileSync(target, '#!/bin/sh\nexit 0\n');
  assert.match(installGitHook(p).notes.find((n) => n.includes('is a symlink')), symlinked);
  // A dangling symlink: the same advice.
  fs.rmSync(target);
  assert.match(installGitHook(p).notes.find((n) => n.includes('is a symlink')), symlinked);
});

test('git gate: the wrapper skips a missing or non-executable .local hook instead of wedging updates', { skip: NO_SH }, () => {
  const p = project([{ id: 'S1-1-fix' }], { install: false });
  const f = path.join(p, '.git', 'hooks', RT_HOOK);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, wrapper(RT_HOOK, path.join(p, '.git', 'deliver', RT_HOOK)), { mode: 0o755 });
  const r = gitRun(p, ['branch', 'x']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /deliver: .*reference-transaction\.local missing or not executable; restore it or remove this wrapper/);
});

test('git gate: shCompatible knows the POSIX shells, through env or busybox', () => {
  for (const line of ['#!/bin/sh', '#!/bin/mksh', '#!/usr/bin/env ash', '#!/bin/busybox sh', '#!/usr/bin/yash', '#!/bin/posh', 'echo no shebang']) assert.equal(shCompatible(`${line}\nexit 0\n`), true, line);
  for (const line of ['#!/usr/bin/env python3', '#!/usr/bin/env -S node --x', '#!/usr/bin/perl', '#!/bin/busybox awk']) assert.equal(shCompatible(`${line}\n`), false, line);
});

test('git gate: a hook that is a directory gets the wrapper, worded from why it cannot be read', () => {
  const p = project([{ id: 'S1-1-fix' }], { install: false });
  fs.mkdirSync(path.join(p, '.git', 'hooks', RT_HOOK), { recursive: true });
  const note = installGitHook(p).notes.find((n) => n.includes('is not a regular file'));
  assert.match(note, /it is not a regular file, so deliver's lines cannot go inside it/);
  assert.doesNotMatch(note, /interpreter/);
});

test('git gate: chaining lines from an earlier version are chained-stale until replaced', { skip: NO_SH }, () => {
  const p = project([{ id: 'S1-1-fix' }], { install: false });
  const f = path.join(p, '.git', 'hooks', RT_HOOK);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const copy = path.join(p, '.git', 'deliver', RT_HOOK).replace(/\\/g, '/');
  fs.writeFileSync(f, `#!/bin/sh\nif [ -f "${copy}" ]; then sh "${copy}" "$@"; [ $? = 1 ] && exit 1; fi\nexit 0\n`, { mode: 0o755 });
  const r = installGitHook(p);
  assert.equal(r.hooks[RT_HOOK], 'chained-stale');
  assert.equal(r.ok, false);
  assert.match(r.notes.join('\n'), /runs an earlier version of deliver's lines; replace them/);
});

test('git gate: a pinned node that cannot start lets an unrelated commit through with a warning; a refusal still blocks', { skip: NO_SH }, () => {
  for (const code of [1, 127]) {
    const p = project([{ id: 'S1-1-fix' }], { install: false });
    const fake = path.join(tmpDir('fakenode-'), 'node');
    fs.writeFileSync(fake, `#!/bin/sh\nexit ${code}\n`, { mode: 0o755 });
    installGitHook(p, { node: fake });
    const r = gitRun(p, ['commit', '--allow-empty', '-m', 'chore: empty']);
    assert.equal(r.status, 0, `${code}: ${r.stderr}`);
    assert.match(r.stderr, new RegExp(`deliver: merge gate failed to run \\(${code}\\); not enforced`));
  }
  const p = project();
  const before = head(p);
  const m = gitRun(p, ['merge', '--no-ff', BRANCH, '-m', 'm']);
  refused(p, before, m, 'real refusal');
  assert.doesNotMatch(m.stderr, /failed to run/);
});

// writePrintedLines(p, r): for each hook the install result r prints lines for, write an
// executable hook in .githooks made of the #! line and those lines alone.
function writePrintedLines(p, r, shebang = '#!/bin/sh') {
  fs.mkdirSync(path.join(p, '.githooks'), { recursive: true });
  for (const note of r.notes.filter((n) => n.includes('right after its #! line: '))) {
    const name = note.match(/your hook manager's ([a-z-]+) hook/)[1];
    fs.writeFileSync(path.join(p, '.githooks', name), `${shebang}\n${note.split('right after its #! line: ')[1]}\n`, { mode: 0o755 });
  }
}

test('git gate: hooks made only of the printed lines exit 0 when the gate allows, fallback and reference-transaction alike', { skip: NO_SH }, () => {
  for (const version of [[2, 27, 0], undefined]) {
    const p = verified({ install: false });
    gitIn(p, ['config', 'core.hooksPath', '.githooks']);
    writePrintedLines(p, installGitHook(p, version ? { version } : {}));
    const label = version ? 'fallback' : 'reference-transaction';
    const again = installGitHook(p, version ? { version } : {});
    assert.equal(again.ok, true, `${label}: ${JSON.stringify(again.hooks)}`);
    const c = gitRun(p, ['commit', '--allow-empty', '-m', 'chore: empty']);
    assert.equal(c.status, 0, `${label} commit: ${c.stderr}`);
    const m = gitRun(p, ['merge', '--no-ff', BRANCH, '-m', 'm']);
    assert.equal(m.status, 0, `${label} verified merge: ${m.stderr}`);
  }
  const q = project([{ id: 'S1-1-fix' }], { install: false });
  gitIn(q, ['config', 'core.hooksPath', '.githooks']);
  writePrintedLines(q, installGitHook(q, { version: [2, 27, 0] }));
  const before = head(q);
  refused(q, before, gitRun(q, ['merge', '--no-ff', BRANCH, '-m', 'm']), 'fallback chained refusal');
});

test('git gate: under sh -e the printed lines refuse without leaking their temp file, and allow with exit 0', { skip: NO_SH }, () => {
  for (const verifiedStory of [false, true]) {
    const p = project([{ id: 'S1-1-fix', verified: verifiedStory }], { install: false });
    gitIn(p, ['config', 'core.hooksPath', '.githooks']);
    writePrintedLines(p, installGitHook(p), '#!/bin/sh -e');
    assert.equal(installGitHook(p).ok, true);
    const tmp = tmpDir('pmtmp-');
    const before = head(p);
    const m = gitRun(p, ['merge', '--no-ff', BRANCH, '-m', 'm'], { TMPDIR: tmp });
    if (verifiedStory) assert.equal(m.status, 0, m.stderr);
    else refused(p, before, m, 'sh -e refusal');
    assert.deepEqual(fs.readdirSync(tmp), [], 'no temp file left behind');
  }
});

test('git gate: a chained hook with CRLF line endings is chained-crlf, not in place', { skip: NO_SH }, () => {
  const p = project([{ id: 'S1-1-fix' }], { install: false });
  gitIn(p, ['config', 'core.hooksPath', '.githooks']);
  writePrintedLines(p, installGitHook(p));
  const f = path.join(p, '.githooks', RT_HOOK);
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(/\n/g, '\r\n'));
  const r = installGitHook(p);
  assert.equal(r.hooks[RT_HOOK], 'chained-crlf');
  assert.equal(r.ok, false);
  assert.match(r.notes.join('\n'), /convert it to LF line endings/);
});

test('git gate: lines chained in the earlier reference-transaction form keep refusing after an install', { skip: NO_SH }, () => {
  const p = project([{ id: 'S1-1-fix' }], { install: false });
  const f = path.join(p, '.git', 'hooks', RT_HOOK);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const c = `"${path.join(p, '.git', 'deliver', RT_HOOK).replace(/\\/g, '/')}"`;
  const earlier = `if [ -f ${c} ] && deliver_in=$(mktemp 2>/dev/null); then cat > "$deliver_in"; sh ${c} "$@" < "$deliver_in"; [ $? = 1 ] && { rm -f "$deliver_in"; exit 1; }; exec < "$deliver_in"; rm -f "$deliver_in"; fi`;
  // With CRLF line endings (a checkout on Windows) it is recognised, but sh cannot run it.
  fs.writeFileSync(f, `#!/bin/sh\r\n${earlier}\r\nexit 0\r\n`, { mode: 0o755 });
  assert.equal(installGitHook(p).hooks[RT_HOOK], 'chained-crlf');
  fs.writeFileSync(f, `#!/bin/sh\n${earlier}\nexit 0\n`, { mode: 0o755 });
  const r = installGitHook(p);
  assert.equal(r.hooks[RT_HOOK], 'chained', JSON.stringify(r.hooks));
  const before = head(p);
  refused(p, before, gitRun(p, ['merge', '--no-ff', BRANCH, '-m', 'm']), 'earlier lines');
  clean(p);
  assert.equal(gitRun(p, ['branch', 'other']).status, 0);
});

test('git gate: a plan naming a pm/* integration branch writes no broken shim, says so, and commits still work', { skip: NO_SH }, () => {
  const p = project([{ id: 'S1-1-fix' }], { install: false });
  fs.writeFileSync(path.join(p, 'docs', 'plan.md'), '# Plan\n- Integration branch: pm/main\n');
  gitIn(p, ['add', 'docs/plan.md']);
  gitIn(p, ['commit', '-qm', 'plan: pm/main by mistake']);
  const r = installGitHook(p);
  assert.equal(r.ok, false);
  assert.match(r.notes.join('\n'), /integration branch pm\/main is a story branch name; the gate is not enforced/);
  assert.equal(r.mode, 'none');
  for (const name of [RT_HOOK, 'pre-commit', 'pre-merge-commit']) assert.equal(fs.existsSync(path.join(p, '.git', 'hooks', name)), false, `no ${name} written`);
  const c = gitRun(p, ['commit', '--allow-empty', '-m', 'chore: empty']);
  assert.equal(c.status, 0, c.stderr);
});

test('git gate: branch names with shell or glob characters stay literal in the shim', { skip: NO_SH }, () => {
  const text = shim({ branches: ['ma*in', 'a)b', 'x"y$z'] });
  assert.equal(shSyntaxOk(text), true);
  // The shim's filtering part, up to where it would start node, then print what it kept.
  const filter = text.slice(0, text.indexOf('[ -n "$lines" ] || exit 0'));
  const run = (ref) => spawnSync('sh', ['-c', `${filter}\necho "$lines"`, 'shim', 'prepared'], { input: `0 1 ${ref}\n`, encoding: 'utf8', env: env() });
  assert.match(run('refs/heads/ma*in').stdout, /refs\/heads\/ma\*in/);
  assert.doesNotMatch(run('refs/heads/maXin').stdout, /maXin/, 'a * matches only itself');
  assert.match(run('refs/heads/a)b').stdout, /refs\/heads\/a\)b/);
});

test('git gate: notes are one per state: a CRLF hook gets only the CRLF note; -e with the r7 form is stale', { skip: NO_SH }, () => {
  const p = project([{ id: 'S1-1-fix' }], { install: false });
  gitIn(p, ['config', 'core.hooksPath', '.githooks']);
  writePrintedLines(p, installGitHook(p));
  const f = path.join(p, '.githooks', RT_HOOK);
  const lf = fs.readFileSync(f, 'utf8');
  fs.writeFileSync(f, lf.replace(/\n/g, '\r\n'));
  const crlf = installGitHook(p, { check: true });
  assert.equal(crlf.hooks[RT_HOOK], 'chained-crlf');
  assert.doesNotMatch(crlf.notes.join('\n'), /is chained-crlf/);
  const c = `"${path.join(p, '.git', 'deliver', RT_HOOK).replace(/\\/g, '/')}"`;
  const r7 = `if [ -f ${c} ] && deliver_in=$(mktemp 2>/dev/null); then cat > "$deliver_in"; sh ${c} "$@" < "$deliver_in"; if [ $? = 1 ]; then rm -f "$deliver_in"; exit 1; fi; exec < "$deliver_in"; rm -f "$deliver_in"; fi`;
  fs.writeFileSync(f, `#!/bin/sh\n${r7}\n`);
  assert.equal(installGitHook(p).hooks[RT_HOOK], 'chained');
  fs.writeFileSync(f, `#!/bin/sh -e\n${r7}\n`);
  assert.equal(installGitHook(p).hooks[RT_HOOK], 'chained-stale');
  // set -e, or set -eu, in the body is the same.
  for (const form of ['#!/bin/sh\nset -eu', '#!/bin/sh -Ee', '#!/bin/sh\nset -o errexit', '#!/bin/sh\nset -x -e']) {
    fs.writeFileSync(f, `${form}\n${r7}\n`);
    assert.equal(installGitHook(p).hooks[RT_HOOK], 'chained-stale', form);
  }
  fs.writeFileSync(f, `#!/bin/sh\nset +e\n${r7}\n`);
  assert.equal(installGitHook(p).hooks[RT_HOOK], 'chained', 'set +e is no errexit');
});

test('git gate: an upstream set to a pm/* branch does not get the overlapping-remote advice', () => {
  const p = project();
  gitIn(p, ['remote', 'add', 'origin', 'https://example.invalid/repo.git']);
  gitIn(p, ['config', 'branch.main.remote', 'origin']);
  gitIn(p, ['config', 'branch.main.merge', `refs/heads/${BRANCH}`]);
  gitIn(p, ['update-ref', `refs/remotes/origin/${BRANCH}`, BRANCH]);
  const check = spawnSync(process.execPath, [INSTALL, '--check', p], { encoding: 'utf8', env: env() });
  assert.doesNotMatch(check.stdout, /also reads as a story branch/);
});

test('git gate: a missing integration branch names the refs checked and the remedy; the upstream advice names <remote> when no remote is designated', () => {
  const p = project();
  fs.writeFileSync(path.join(p, 'docs', 'plan.md'), '# Plan\n- Integration branch: `develop`\n');
  gitIn(p, ['add', 'docs/plan.md']);
  gitIn(p, ['commit', '-qm', 'plan: develop']);
  gitIn(p, ['remote', 'add', 'upstream', 'https://example.invalid/u.git']);
  gitIn(p, ['update-ref', 'refs/remotes/upstream/develop', 'main']);
  assert.match(installGitHook(p).notes.join('\n'), /integration branch develop does not exist \(no refs\/heads\/develop or refs\/remotes\/origin\/develop\); create it locally with git branch "develop" "upstream\/develop"/);
  // Two remotes, neither origin: no designated remote, so the advice says <remote>.
  const q = project();
  gitIn(q, ['remote', 'add', 'a', 'https://example.invalid/a.git']);
  gitIn(q, ['remote', 'add', 'b', 'https://example.invalid/b.git']);
  const check = spawnSync(process.execPath, [INSTALL, '--check', q], { encoding: 'utf8', env: env() });
  assert.match(check.stdout, /set one with git branch --set-upstream-to <remote>\/"main" "main"/);
});

test('git gate: a set line that only mentions -e later in the line is no errexit', { skip: NO_SH }, () => {
  const p = project([{ id: 'S1-1-fix' }], { install: false });
  const f = path.join(p, '.git', 'hooks', RT_HOOK);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const c = `"${path.join(p, '.git', 'deliver', RT_HOOK).replace(/\\/g, '/')}"`;
  const r7 = `if [ -f ${c} ] && deliver_in=$(mktemp 2>/dev/null); then cat > "$deliver_in"; sh ${c} "$@" < "$deliver_in"; if [ $? = 1 ]; then rm -f "$deliver_in"; exit 1; fi; exec < "$deliver_in"; rm -f "$deliver_in"; fi`;
  fs.writeFileSync(f, `#!/bin/sh\nset -u; foo -e\n${r7}\n`, { mode: 0o755 });
  assert.equal(installGitHook(p).hooks[RT_HOOK], 'chained');
});

test('git gate: a symlinked hooks directory outside the git directory is not written', { skip: WIN && 'symlinks' }, () => {
  const p = project([{ id: 'S1-1-fix' }], { install: false });
  const shared = tmpDir('shared-hooks-');
  fs.rmSync(path.join(p, '.git', 'hooks'), { recursive: true, force: true });
  fs.symlinkSync(shared, path.join(p, '.git', 'hooks'));
  const r = installGitHook(p);
  assert.equal(r.ok, false);
  assert.equal(r.hooks[RT_HOOK], 'skipped');
  assert.equal(fs.existsSync(path.join(shared, RT_HOOK)), false);
  assert.match(r.notes.join('\n'), /outside this repository's git directory/);
  fs.writeFileSync(path.join(shared, RT_HOOK), shim({ branches: ['main'] }), { mode: 0o755 });
  const u = installGitHook(p, { uninstall: true });
  assert.equal(u.ok, false);
  assert.equal(u.hooks[RT_HOOK], 'not-removed');
  assert.ok(fs.existsSync(path.join(shared, RT_HOOK)), 'the shared hook is untouched');
});

test('git gate: --uninstall persists across session start until an explicit install', () => {
  const p = project();
  const cli = (...args) => spawnSync(process.execPath, [INSTALL, ...args, p], { encoding: 'utf8', env: env() });
  assert.equal(cli('--uninstall').status, 0);
  assert.equal(gitIn(p, ['config', '--local', '--get', 'deliver.mergeGate']).trim(), 'off');
  const s = runHook('session-context.mjs', { cwd: p });
  assert.equal(s.status, 0);
  assert.equal(fs.existsSync(path.join(p, '.git', 'hooks', RT_HOOK)), false, 'session start did not reinstall');
  assert.match(s.stdout, /merge gate: disabled/);
  const c = cli('--check');
  assert.equal(c.status, 1);
  assert.match(c.stdout, /^merge gate: disabled$/m);
  const i = cli();
  assert.equal(i.status, 0, i.stdout);
  assert.equal(gitRun(p, ['config', '--local', '--get', 'deliver.mergeGate']).status, 1);
  assert.equal(fs.readFileSync(path.join(p, '.git', 'hooks', RT_HOOK), 'utf8').split('\n')[1], MARKER);
});

test('git gate: --check with --uninstall is refused, and an uninstall that cannot remove a shim fails', () => {
  const p = project();
  const both = spawnSync(process.execPath, [INSTALL, '--check', '--uninstall', p], { encoding: 'utf8', env: env() });
  assert.equal(both.status, 2);
  assert.match(both.stderr, /cannot be combined/);
  assert.ok(fs.existsSync(path.join(p, '.git', 'hooks', RT_HOOK)));
  if (!WIN && process.getuid?.() !== 0) {
    const dir = path.join(p, '.git', 'hooks');
    fs.chmodSync(dir, 0o555);
    try {
      const u = spawnSync(process.execPath, [INSTALL, '--uninstall', p], { encoding: 'utf8', env: env() });
      assert.equal(u.status, 1, u.stdout);
      assert.match(u.stdout, /hook reference-transaction: error/);
    } finally {
      fs.chmodSync(dir, 0o755);
    }
  }
});

test('git gate: a v1 shim left in an in-tree core.hooksPath is reported by install, --check, and session start', () => {
  const p = project([{ id: 'S1-1-fix' }], { install: false });
  gitIn(p, ['config', 'core.hooksPath', '.githooks']);
  fs.mkdirSync(path.join(p, '.githooks'));
  const v1 = path.join(p, '.githooks', 'pre-merge-commit');
  fs.writeFileSync(v1, '#!/bin/sh\n# deliver-merge-gate v1\nexec node "/x/git-merge-gate.mjs" "$@"\n', { mode: 0o755 });
  const want = /\.githooks\/pre-merge-commit is an earlier deliver install's pre-merge-commit shim/;
  assert.match(installGitHook(p).notes.join('\n'), want);
  assert.ok(fs.existsSync(v1), 'not removed from the working tree');
  assert.match(spawnSync(process.execPath, [INSTALL, '--check', p], { encoding: 'utf8', env: env() }).stdout, want);
  assert.match(runHook('session-context.mjs', { cwd: p }).stdout, want);
});

test('git gate: writeAtomic removes its temporary file when the rename fails', () => {
  const d = tmpDir('atomic-');
  const target = path.join(d, 'hook');
  fs.mkdirSync(path.join(target, 'inside'), { recursive: true });
  assert.equal(typeof writeAtomic, 'function');
  assert.throws(() => writeAtomic(target, 'x'));
  assert.deepEqual(fs.readdirSync(d), ['hook']);
});

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
