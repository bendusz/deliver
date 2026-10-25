import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { newProj, runHook, gitIn, tmpDir } from './helpers.mjs';

const BRANCH = 'pm/S1-1-fix';
const STORY = path.join('docs', 'stories', 'S1-1-fix.md');

const storyText = (exec, meta = { builder: 'expert-builder', touches: ['src'] }) => [
  '# S1-1: fix',
  `<!-- pm-meta: ${JSON.stringify(meta)} -->`,
  '',
  '## Goal',
  'x',
  '',
  '## Execution',
  `<!-- pm-exec: ${JSON.stringify(exec)} -->`,
  '',
].join('\n');

// The protect commit's fields, which a 0.29 T1 or T2 claim must carry.
const PROT = { protected: ['tests/acceptance'], protected_base: 'a'.repeat(40) };

const CLAIM = { owner: 'casey', builder: 'expert-builder', branch: BRANCH, status: 'claimed', tier: 'T0', rounds: 0, retries: 0, deliver: '0.29.0', updated: '2026-10-24 10:00' };

// project(claim): an approved project whose `main` holds the claim, and a story branch with one
// code commit to src/fix.js. Returns { p, code } with that commit's SHA, checked out on the branch.
function project(claim = {}, { meta, storyRel = STORY } = {}) {
  const p = newProj(true);
  gitIn(p, ['branch', '-M', 'main']);
  fs.writeFileSync(path.join(p, storyRel), storyText({ ...CLAIM, ...claim }, meta));
  fs.writeFileSync(path.join(p, 'src', 'fix.js'), lines('base'));
  gitIn(p, ['add', storyRel, 'src/fix.js']);
  gitIn(p, ['commit', '-qm', 'chore(S1-1): claim']);
  gitIn(p, ['checkout', '-qb', BRANCH]);
  fs.writeFileSync(path.join(p, 'src', 'fix.js'), lines('base').replace('line 1 base', 'line 1 fixed'));
  gitIn(p, ['commit', '-qam', 'build(S1-1): fix']);
  return { p, code: gitIn(p, ['rev-parse', 'HEAD']).trim() };
}

// Ten lines, so independent edits at either end merge cleanly.
const lines = (tag) => Array.from({ length: 10 }, (_, i) => `line ${i + 1} ${tag}`).join('\n') + '\n';

// record(p, fields): the PM commits Execution fields on the story branch, on top of the claim.
function record(p, fields, { meta, storyRel = STORY, claim = {} } = {}) {
  fs.writeFileSync(path.join(p, storyRel), storyText({ ...CLAIM, ...claim, status: 'in-review', ...fields }, meta));
  gitIn(p, ['add', storyRel]);
  gitIn(p, ['commit', '-qm', 'chore(S1-1): record']);
}

const toMain = (p) => gitIn(p, ['checkout', '-q', 'main']);
const toBranch = (p) => gitIn(p, ['checkout', '-q', BRANCH]);
const onMain = (p, fn) => { toMain(p); fn(); toBranch(p); };
const commitOn = (p, rel, text, msg) => { fs.mkdirSync(path.dirname(path.join(p, rel)), { recursive: true }); fs.writeFileSync(path.join(p, rel), text); gitIn(p, ['add', rel]); gitIn(p, ['commit', '-qm', msg]); };
const hook = (cwd, command, env = {}) => runHook('require-verified.mjs', { tool_name: 'Bash', cwd, tool_input: { command } }, env);
const merge = (p, command = `git merge --no-ff ${BRANCH} -m "feat(S1-1): fix"`, env = {}) => hook(p, command, env);

// --- the verdict ---

test('verified: blocks a pm/* merge whose story records no verifier PASS', () => {
  const { p } = project();
  record(p, {});
  toMain(p);
  const r = merge(p);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /^deliver blocked git merge pm\/S1-1-fix: .*no verifier verdict/);
  assert.match(r.stderr, /DELIVER_NO_ENFORCE=1/);
});

test('verified: blocks a FAIL or UNKNOWN verdict even at the head SHA', () => {
  const { p, code } = project();
  for (const verdict of ['FAIL', 'UNKNOWN']) {
    record(p, { verifier: `${verdict} ${code}` });
    toMain(p);
    assert.equal(merge(p).status, 2, verdict);
    toBranch(p);
  }
});

test('verified: allows a PASS at the verified commit when only the story file changed since', () => {
  const { p, code } = project();
  record(p, { verifier: `PASS ${code}` });
  toMain(p);
  const r = merge(p);
  assert.equal(r.status, 0, r.stderr);
});

test('verified: a seven-character SHA prefix is enough', () => {
  const { p, code } = project();
  record(p, { verifier: `PASS ${code.slice(0, 7)}` });
  toMain(p);
  assert.equal(merge(p).status, 0);
});

test('verified: blocks a stale SHA once code changed after the verdict', () => {
  const { p, code } = project();
  record(p, { verifier: `PASS ${code}` });
  commitOn(p, 'src/fix.js', 'changed after the verdict\n', 'fix(S1-1): round 1');
  toMain(p);
  const r = merge(p);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /re-verify/);
});

test('verified: a SHA that names no commit on the branch is stale', () => {
  const { p } = project();
  record(p, { verifier: 'PASS deadbeefdeadbeef' });
  toMain(p);
  assert.equal(merge(p).status, 2);
});

test('verified: a T1 or T2 claim needs integrity pass on the branch', () => {
  const t1 = project({ tier: 'T1', ...PROT });
  record(t1.p, { verifier: `PASS ${t1.code}` }, { claim: { tier: 'T1', ...PROT } });
  toMain(t1.p);
  const r = merge(t1.p);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /tier T1 and records integrity unset/);
  const t2 = project({ tier: 'T2', ...PROT });
  record(t2.p, { verifier: `PASS ${t2.code}`, integrity: 'fail' }, { claim: { tier: 'T2', ...PROT } });
  toMain(t2.p);
  assert.equal(merge(t2.p).status, 2);
  toBranch(t2.p);
  record(t2.p, { verifier: `PASS ${t2.code}`, integrity: 'pass' }, { claim: { tier: 'T2', ...PROT } });
  toMain(t2.p);
  assert.equal(merge(t2.p).status, 2, 'integrity pass names no commit');
  toBranch(t2.p);
  record(t2.p, { verifier: `PASS ${t2.code}`, integrity: `pass ${t2.code}` }, { claim: { tier: 'T2', ...PROT } });
  toMain(t2.p);
  assert.equal(merge(t2.p).status, 0, merge(t2.p).stderr);
});

test('verified: an integrity pass for an older commit is stale like the verdict', () => {
  const { p, code } = project({ tier: 'T1', ...PROT });
  commitOn(p, 'src/fix.js', 'second build\n', 'fix(S1-1): round 1');
  const later = gitIn(p, ['rev-parse', 'HEAD']).trim();
  record(p, { verifier: `PASS ${later}`, integrity: `pass ${code}` }, { claim: { tier: 'T1', ...PROT } });
  toMain(p);
  const r = merge(p);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /integrity/);
});

// --- ruling 1: the integration branch, never HEAD ---

test('verified: a chained checkout-and-merge from the story branch still sees the stale verdict', () => {
  const { p, code } = project();
  record(p, { verifier: `PASS ${code}` });
  commitOn(p, 'src/fix.js', 'changed after the verdict\n', 'fix(S1-1): round 1');
  // HEAD is the story branch while the hook runs.
  const r = merge(p, `git checkout main && git merge --no-ff ${BRANCH}`);
  assert.equal(r.status, 2, r.stderr);
});

test('verified: the integration branch comes from docs/plan.md; an unresolvable one blocks', () => {
  const { p, code } = project();
  record(p, { verifier: `PASS ${code}` });
  toMain(p);
  gitIn(p, ['branch', 'trunk']);
  commitOn(p, 'docs/plan.md', '# Plan\n\n## Delivery mode\n- Integration branch: `trunk`\n', 'plan names trunk');
  gitIn(p, ['checkout', '-q', 'trunk']);
  assert.equal(merge(p).status, 0, merge(p).stderr);
  toMain(p);
  commitOn(p, 'docs/plan.md', '# Plan\n\n## Delivery mode\n- Integration branch: release\n', 'plan names release');
  const r = merge(p);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /integration branch release/);
});

// --- ruling 2: merges after the verdict match the automatic merge ---

test('verified: a clean merge of the integration tip after PASS keeps the verdict', () => {
  const { p, code } = project();
  record(p, { verifier: `PASS ${code}` });
  onMain(p, () => commitOn(p, 'src/other.js', 'export const other = 1;\n', 'another story merged'));
  gitIn(p, ['merge', '-q', '--no-ff', '--no-edit', 'main']);
  toMain(p);
  const r = merge(p);
  assert.equal(r.status, 0, r.stderr);
});

test('verified: a clean merge of independent edits to the same file keeps the verdict', () => {
  const { p, code } = project();
  record(p, { verifier: `PASS ${code}` });
  onMain(p, () => commitOn(p, 'src/fix.js', lines('base').replace('line 10 base', 'line 10 other story'), 'another story merged'));
  gitIn(p, ['merge', '-q', '--no-ff', '--no-edit', 'main']);
  toMain(p);
  const r = merge(p);
  assert.equal(r.status, 0, r.stderr);
});

test('verified: a merge that resolves a code conflict against the verified change needs a fresh verdict', () => {
  const { p, code } = project();
  record(p, { verifier: `PASS ${code}` });
  onMain(p, () => commitOn(p, 'src/fix.js', lines('base').replace('line 1 base', 'line 1 other'), 'another story merged'));
  gitIn(p, ['merge', '-q', '--no-ff', '--no-edit', '-X', 'theirs', 'main']);
  toMain(p);
  const r = merge(p);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /re-verify/);
});

test('verified: a merge that restores old contents beyond the automatic merge needs a fresh verdict', () => {
  const { p, code } = project();
  record(p, { verifier: `PASS ${code}` });
  onMain(p, () => commitOn(p, 'src/other.js', 'x\n', 'another story merged'));
  gitIn(p, ['merge', '-q', '--no-ff', '--no-commit', 'main']);
  gitIn(p, ['checkout', 'main', '--', 'src/fix.js']);
  gitIn(p, ['commit', '-qm', 'merge main']);
  toMain(p);
  const r = merge(p);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /re-verify/);
});

test('verified: a conflict confined to the story file, as after a protect commit, keeps the verdict', () => {
  const prot = { protected: ['tests/acceptance'], protected_base: 'a'.repeat(40) };
  const { p, code } = project();
  record(p, { ...prot, verifier: `PASS ${code}` });
  onMain(p, () => commitOn(p, STORY, storyText({ ...CLAIM, ...prot }), 'chore(S1-1): protect'));
  const branchCopy = fs.readFileSync(path.join(p, STORY), 'utf8');
  assert.throws(() => gitIn(p, ['merge', '-q', '--no-ff', '--no-edit', 'main']));
  fs.writeFileSync(path.join(p, STORY), branchCopy);
  gitIn(p, ['add', STORY]);
  gitIn(p, ['commit', '-qm', 'merge main']);
  toMain(p);
  const r = merge(p);
  assert.equal(r.status, 0, r.stderr);
});

// --- ruling 3: claim fields come from the integration branch ---

test('verified: a branch that rewrites deliver to a pre-0.29 version is blocked', () => {
  const { p } = project();
  record(p, {}, { claim: { deliver: '0.28.1' } });
  toMain(p);
  const r = merge(p);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /deliver/);
});

test('verified: a branch that lowers the claimed tier is blocked', () => {
  const { p, code } = project({ tier: 'T2', ...PROT });
  record(p, { verifier: `PASS ${code}` }, { claim: { tier: 'T0' } });
  toMain(p);
  const r = merge(p);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /tier/);
});

test('verified: a branch that adds integrity_allow to pm-meta is blocked', () => {
  const { p, code } = project({ tier: 'T1', ...PROT });
  record(p, { verifier: `PASS ${code}`, integrity: 'pass' }, { claim: { tier: 'T1', ...PROT }, meta: { builder: 'expert-builder', touches: ['src'], integrity_allow: ['test-deleted'] } });
  toMain(p);
  const r = merge(p);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /integrity_allow/);
});

test('verified: a claim made before 0.29 on the integration branch passes through; an unparseable one blocks', () => {
  const old = project({ deliver: '0.28.1' });
  record(old.p, {}, { claim: { deliver: '0.28.1' } });
  toMain(old.p);
  assert.equal(merge(old.p).status, 0);
  const bad = project({ deliver: 'latest' });
  record(bad.p, {}, { claim: { deliver: 'latest' } });
  toMain(bad.p);
  assert.equal(merge(bad.p).status, 2);
});

test('verified: a claim with no deliver key predates the field and passes through', () => {
  const { p } = project({ deliver: undefined, tier: undefined });
  record(p, {}, { claim: { deliver: undefined, tier: undefined } });
  toMain(p);
  assert.equal(merge(p).status, 0, merge(p).stderr);
});

test('verified: a 0.29 claim needs a tier of exactly T0, T1, or T2', () => {
  for (const tier of [undefined, 'T3', 't1']) {
    const { p, code } = project({ tier });
    record(p, { verifier: `PASS ${code}`, integrity: `pass ${code}` }, { claim: { tier } });
    toMain(p);
    const r = merge(p);
    assert.equal(r.status, 2, String(tier));
    assert.match(r.stderr, /tier/);
  }
});

test('verified: a story file named otherwise is still found by its claimed branch', () => {
  const rel = path.join('docs', 'stories', 'S1-1-renamed.md');
  const { p } = project({}, { storyRel: rel });
  record(p, {}, { storyRel: rel });
  toMain(p);
  assert.equal(merge(p).status, 2);
});

test('verified: a pm/* branch that no story on the integration branch claims is blocked', () => {
  const { p } = project({ branch: 'pm/S9-9-other' });
  record(p, {}, { claim: { branch: 'pm/S9-9-other' } });
  toMain(p);
  const r = merge(p);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /no story/);
});

// --- ruling 5: every way to name the branch ---

test('verified: remote-tracking names, FETCH_HEAD, raw SHAs, and revision suffixes reach the gate', () => {
  const { p } = project();
  record(p, {});
  const tip = gitIn(p, ['rev-parse', 'HEAD']).trim();
  toMain(p);
  gitIn(p, ['update-ref', 'refs/remotes/origin/pm/S1-1-fix', tip]);
  fs.writeFileSync(path.join(gitIn(p, ['rev-parse', '--absolute-git-dir']).trim(), 'FETCH_HEAD'), `${tip}\t\tbranch 'pm/S1-1-fix' of example\n`);
  for (const op of ['origin/pm/S1-1-fix', 'refs/remotes/origin/pm/S1-1-fix', 'refs/heads/pm/S1-1-fix', 'FETCH_HEAD', tip, tip.slice(0, 10), `${BRANCH}~0`, `${BRANCH}^0`]) {
    assert.equal(merge(p, `git merge --no-ff ${op}`).status, 2, op);
  }
});

test('verified: git pull of a story branch is blocked', () => {
  const { p } = project();
  record(p, {});
  toMain(p);
  const r = merge(p, `git pull --no-rebase origin ${BRANCH}`);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /fetch.*separate command/);
});

test('verified: git path forms, attached and repeated -C, and cd chains reach the right repository', () => {
  const { p } = project();
  record(p, {});
  toMain(p);
  const out = tmpDir('pmelsewhere-');
  const parent = path.dirname(p);
  const base = path.basename(p);
  const cases = [
    [p, `/usr/bin/git merge ${BRANCH}`],
    [p, `"C:\\Program Files\\Git\\bin\\git.exe" merge ${BRANCH}`],
    [p, `git.exe merge ${BRANCH}`],
    [out, `git -C '${p}' merge ${BRANCH}`],
    [out, `git -C'${p}' merge ${BRANCH}`],
    [parent, `git -C . -C ${base} merge ${BRANCH}`],
    [out, `cd '${p}' && git merge ${BRANCH}`],
    [out, `cd '${p}/src' && cd .. && git merge ${BRANCH}`],
    [out, `cd "$PROJECT" && git merge ${BRANCH}`],
  ];
  for (const [cwd, command] of cases) assert.equal(hook(cwd, command).status, 2, command);
});

// --- scope and fail-open ---

test('verified: a non-pm merge, a merge --abort, and other git commands are ignored', () => {
  const { p } = project();
  record(p, {});
  toMain(p);
  for (const command of ['git merge --no-ff feature/x', 'git merge --abort', `git log ${BRANCH}`, `echo "git merge ${BRANCH}"`, `echo git merge ${BRANCH}`]) {
    assert.equal(merge(p, command).status, 0, command);
  }
});

test('verified: outside a deliver project it allows', () => {
  const { p } = project();
  record(p, {});
  toMain(p);
  gitIn(p, ['rm', '-q', 'docs/approval.json']);
  gitIn(p, ['commit', '-qm', 'not managed any more']);
  assert.equal(merge(p).status, 0);
});

// --- round 2 ---

test('verified: dynamic merge operands are blocked in a deliver project', () => {
  const { p, code } = project();
  record(p, { verifier: `PASS ${code}` });
  toMain(p);
  assert.equal(merge(p).status, 0, 'the literal merge is allowed');
  for (const command of [`B=${BRANCH} && git merge --no-ff "$B"`, `git merge --no-ff $B`, `git merge $(git rev-parse ${BRANCH})`, `git merge \`git rev-parse ${BRANCH}\``, 'git pull origin "$B"']) {
    const r = merge(p, command);
    assert.equal(r.status, 2, command);
    assert.match(r.stderr, /name the branch literally/, command);
  }
});

test('verified: a plan.md in the story checkout cannot redirect the integration branch', () => {
  const { p, code } = project();
  record(p, { verifier: `PASS ${code}` });
  commitOn(p, 'src/fix.js', 'changed after the verdict\n', 'fix(S1-1): round 1');
  gitIn(p, ['branch', 'evil']);
  for (const name of [BRANCH, 'evil']) {
    fs.writeFileSync(path.join(p, 'docs', 'plan.md'), `# Plan\n- Integration branch: ${name}\n`);
    assert.equal(merge(p, `git checkout main && git merge --no-ff ${BRANCH}`).status, 2, name);
  }
});

test('verified: the integration branch may not be a pm/* branch or contain the story tip', () => {
  const { p, code } = project();
  record(p, { verifier: `PASS ${code}` });
  gitIn(p, ['branch', 'evil']);
  toMain(p);
  for (const name of [BRANCH, 'evil']) {
    commitOn(p, 'docs/plan.md', `# Plan\n- Integration branch: ${name}\n`, `plan names ${name}`);
    assert.equal(merge(p).status, 2, name);
  }
});

test('verified: deleting approval.json in the story checkout does not switch the gate off', () => {
  const { p, code } = project();
  record(p, { verifier: `PASS ${code}` });
  commitOn(p, 'src/fix.js', 'changed after the verdict\n', 'fix(S1-1): round 1');
  fs.rmSync(path.join(p, 'docs', 'approval.json'));
  assert.equal(merge(p, `git checkout main && git merge --no-ff ${BRANCH}`).status, 2);
});

test('verified: wrappers, their options, and -- still reach the gate', () => {
  const { p } = project();
  record(p, {});
  toMain(p);
  for (const command of [`env -i PATH=/usr/bin git merge ${BRANCH}`, `env -u HOME git merge ${BRANCH}`, `nice -n 5 git merge ${BRANCH}`, `command -p git merge ${BRANCH}`, `exec git merge ${BRANCH}`, `git merge --no-ff -- ${BRANCH}`, `env -- git merge ${BRANCH}`]) {
    assert.equal(merge(p, command).status, 2, command);
  }
});

test('verified: a cd inside a subshell leaves the directory unknown, and a non-repository directory blocks', () => {
  const { p } = project();
  record(p, {});
  toMain(p);
  const out = tmpDir('pmnotrepo-');
  assert.equal(merge(p, `(cd '${out}') && git merge ${BRANCH}`).status, 2);
  assert.equal(merge(p, `cd '${out}' && git merge ${BRANCH}`).status, 2);
  assert.equal(merge(p, `cd '${out}' && git merge feature/x`).status, 0, 'a non-story merge outside a repository is not ours');
});

test('verified: an operand inside a story branch but short of its tip is blocked', () => {
  const { p } = project();
  record(p, {});
  toMain(p);
  const r = merge(p, `git merge --no-ff ${BRANCH}~1`);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /part of/);
});

test('verified: a tag shadowing a pm/* branch name is blocked', () => {
  const { p } = project();
  record(p, {});
  toMain(p);
  gitIn(p, ['tag', BRANCH, 'main']);
  const r = merge(p);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /ambiguous|tag/);
});

test('verified: the documented T1 flow, protect commit merged in before building, ships without a conflict', () => {
  const p = newProj(true);
  gitIn(p, ['branch', '-M', 'main']);
  const claim = { ...CLAIM, tier: 'T1' };
  commitOn(p, STORY, storyText(claim), 'chore(S1-1): claim');
  gitIn(p, ['checkout', '-qb', BRANCH]);
  commitOn(p, 'tests/acceptance/fix.test.js', "test('fixed', () => {});\n", 'test(S1-1): acceptance');
  const base = gitIn(p, ['rev-parse', 'HEAD']).trim();
  const prot = { protected: ['tests/acceptance/fix.test.js'], protected_base: base };
  onMain(p, () => commitOn(p, STORY, storyText({ ...claim, ...prot }), 'chore(S1-1): protect'));
  gitIn(p, ['merge', '-q', '--no-ff', '--no-edit', 'main']);
  commitOn(p, STORY, storyText({ ...claim, ...prot, status: 'building' }), 'chore(S1-1): building');
  commitOn(p, 'src/fix.js', 'export const fixed = true;\n', 'build(S1-1): fix');
  const built = gitIn(p, ['rev-parse', 'HEAD']).trim();
  commitOn(p, STORY, storyText({ ...claim, ...prot, status: 'built', integrity: `pass ${built}` }), 'chore(S1-1): integrity');
  commitOn(p, STORY, storyText({ ...claim, ...prot, status: 'in-review', integrity: `pass ${built}`, verifier: `PASS ${built}` }), 'chore(S1-1): verified');
  toMain(p);
  const command = `git merge --no-ff ${BRANCH} -m "feat(S1-1): fix"`;
  const r = merge(p, command);
  assert.equal(r.status, 0, r.stderr);
  gitIn(p, ['merge', '--no-ff', BRANCH, '-m', 'feat(S1-1): fix']);
  assert.equal(gitIn(p, ['status', '--porcelain']), '');
});

test('verified: garbage input fails open', () => {
  for (const input of ['not json {', '', '[]', '{"tool_input":{"command":42}}', JSON.stringify({ tool_input: { command: `git merge "${BRANCH}` } })]) {
    assert.equal(runHook('require-verified.mjs', input).status, 0, input);
  }
});

test('verified: the kill switch allows a merge that would otherwise block', () => {
  const { p } = project();
  record(p, {});
  toMain(p);
  assert.equal(merge(p, undefined, { DELIVER_NO_ENFORCE: '1' }).status, 0);
});

// --- round 3 ---

const BODY = [
  'fix(S1-1): handle "quoted" input',
  '',
  '## Why',
  "The `parse()` call broke on $HOME and \"quotes\" (it's fine now).",
  '',
  '## Verification',
  '- `node --test` passed; cost $0, see (notes)',
].join('\n');
const HEREDOC = (op) => `git checkout main && git merge --no-ff ${op} -m "$(cat <<'EOF'\n${BODY}\nEOF\n)"`;

test('verified: the documented heredoc merge message passes when verified and is gated when not', () => {
  const ok = project();
  record(ok.p, { verifier: `PASS ${ok.code}` });
  const r = merge(ok.p, HEREDOC(BRANCH));
  assert.equal(r.status, 0, r.stderr);
  assert.equal(merge(ok.p, `git merge --no-ff ${BRANCH} --message "body with $X and \`ticks\`"`).status, 0);
  assert.equal(merge(ok.p, `git merge --no-ff ${BRANCH} --message="body $X"`).status, 0);
  assert.equal(merge(ok.p, `git merge --no-ff ${BRANCH} -m"body $X"`).status, 0);
  const bad = project();
  record(bad.p, {});
  assert.equal(merge(bad.p, HEREDOC(BRANCH)).status, 2);
});

test('verified: an integration branch other than main is found from its own committed plan', () => {
  const { p, code } = project();
  record(p, {});
  toMain(p);
  gitIn(p, ['branch', '-m', 'main', 'develop']);
  commitOn(p, 'docs/plan.md', '# Plan\n- Integration branch: develop\n', 'plan names develop');
  assert.equal(merge(p).status, 2, 'unverified');
  toBranch(p);
  record(p, { verifier: `PASS ${code}` });
  gitIn(p, ['checkout', '-q', 'develop']);
  const r = merge(p);
  assert.equal(r.status, 0, r.stderr);
});

test('verified: candidates that disagree on the integration branch block', () => {
  const { p, code } = project();
  record(p, { verifier: `PASS ${code}` });
  toMain(p);
  gitIn(p, ['checkout', '-qb', 'develop']);
  commitOn(p, 'docs/plan.md', '# Plan\n- Integration branch: develop\n', 'plan names develop');
  toMain(p);
  commitOn(p, 'docs/plan.md', '# Plan\n- Integration branch: main\n', 'plan names main');
  const r = merge(p);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /disagree/);
});

test('verified: a story merge after another ref-changing git command in the same call is blocked', () => {
  const { p, code } = project();
  record(p, { verifier: `PASS ${code}` });
  toMain(p);
  for (const command of [`git fetch origin ${BRANCH} && git merge --no-ff FETCH_HEAD`, `git fetch origin && git merge --no-ff origin/${BRANCH}`, `git commit --allow-empty -qm x && git checkout main && git merge --no-ff ${BRANCH}`, `git checkout -B main && git merge --no-ff ${BRANCH}`]) {
    const r = merge(p, command);
    assert.equal(r.status, 2, command);
    assert.match(r.stderr, /own command/, command);
  }
  assert.equal(merge(p, `git checkout main && git merge --no-ff ${BRANCH}`).status, 0, 'checkout then merge is the happy path');
  assert.equal(merge(p, `git switch main && git merge --no-ff ${BRANCH}`).status, 0);
});

test('verified: git merge - and @{-N} count as computed operands', () => {
  const { p, code } = project();
  record(p, { verifier: `PASS ${code}` });
  toMain(p);
  for (const op of ['-', '@{-1}']) {
    const r = merge(p, `git merge --no-ff ${op}`);
    assert.equal(r.status, 2, op);
    assert.match(r.stderr, /name the branch literally/);
  }
});

test('verified: merging the integration branch into a story branch is not a ship', () => {
  const { p } = project();
  record(p, {});
  gitIn(p, ['branch', 'pm/S1-2-fresh', 'main']);
  assert.equal(merge(p, 'git merge --no-ff main').status, 0, merge(p, 'git merge --no-ff main').stderr);
  assert.equal(merge(p, 'git merge --no-ff pm/S1-2-fresh').status, 0, 'a fresh story branch at main brings nothing');
});

test('verified: merging another story branch in after the verdict makes it stale', () => {
  const { p, code } = project();
  record(p, { verifier: `PASS ${code}` });
  gitIn(p, ['checkout', '-qb', 'pm/S1-2-other', 'main']);
  commitOn(p, 'src/other.js', 'unverified\n', 'build(S1-2): other');
  toBranch(p);
  gitIn(p, ['merge', '-q', '--no-ff', '--no-edit', 'pm/S1-2-other']);
  toMain(p);
  const r = merge(p);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /re-verify/);
});

test('verified: a claim is legacy only without both deliver and tier; T1 and T2 need the protect fields', () => {
  const tierOnly = project({ deliver: undefined });
  record(tierOnly.p, {}, { claim: { deliver: undefined } });
  toMain(tierOnly.p);
  assert.equal(merge(tierOnly.p).status, 2, 'tier without deliver is not legacy');
  for (const prot of [{}, { protected: [], protected_base: 'a'.repeat(40) }, { protected: ['tests/acceptance'] }]) {
    const { p, code } = project({ tier: 'T1', ...prot });
    record(p, { verifier: `PASS ${code}`, integrity: `pass ${code}` }, { claim: { tier: 'T1', ...prot } });
    toMain(p);
    const r = merge(p);
    assert.equal(r.status, 2, JSON.stringify(prot));
    assert.match(r.stderr, /protect/);
  }
});

test('verified: shell control words before git still reach the gate', () => {
  const { p } = project();
  record(p, {});
  toMain(p);
  for (const command of [`if true; then git merge --no-ff ${BRANCH}; fi`, `true && { git merge --no-ff ${BRANCH}; }`, `! git merge --no-ff ${BRANCH}`, `while false; do :; done; until true; do :; done; git merge ${BRANCH}`]) {
    assert.equal(merge(p, command).status, 2, command);
  }
});

test('verified: without git 2.38 merge-tree the deny says so', { skip: process.platform === 'win32' && 'POSIX stub' }, () => {
  const { p, code } = project();
  record(p, { verifier: `PASS ${code}` });
  onMain(p, () => commitOn(p, 'src/other.js', 'x\n', 'another story merged'));
  gitIn(p, ['merge', '-q', '--no-ff', '--no-edit', 'main']);
  toMain(p);
  const bin = tmpDir('pmoldgit-');
  const real = spawnSync('which', ['git'], { encoding: 'utf8' }).stdout.trim();
  fs.writeFileSync(path.join(bin, 'git'), `#!/bin/sh\nfor a in "$@"; do\n  case "$a" in merge-tree) echo "usage: git merge-tree" >&2; exit 129;; version) echo "git version 2.30.0"; exit 0;; esac\ndone\nexec "${real}" "$@"\n`, { mode: 0o755 });
  const r = merge(p, undefined, { PATH: `${bin}${path.delimiter}${process.env.PATH}` });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /2\.38/);
});

// --- WP-D follow-ups ---

test('verified: a backslash-newline continuation joins the lines, so the chained merge is gated', () => {
  const command = `git checkout main && \\\n  git merge --no-ff ${BRANCH} -m "feat(S1-1): fix"`;
  const bad = project();
  record(bad.p, {});
  const r = merge(bad.p, command);
  assert.equal(r.status, 2, 'unverified');
  assert.match(r.stderr, /no verifier verdict/);
  const ok = project();
  record(ok.p, { verifier: `PASS ${ok.code}` });
  const g = merge(ok.p, command);
  assert.equal(g.status, 0, g.stderr);
});

test('verified: a checkout to a computed branch leaves the target unknown, so a pm merge after it is a ship', () => {
  const bad = project();
  record(bad.p, {});
  // HEAD is the story branch; the checkout's target cannot be read.
  for (const co of ['git checkout "$INTEGRATION"', 'git switch $INTEGRATION', 'git checkout no-such-branch']) {
    const r = merge(bad.p, `${co} && git merge --no-ff ${BRANCH}`);
    assert.equal(r.status, 2, co);
    assert.match(r.stderr, /no verifier verdict/, co);
  }
  const ok = project();
  record(ok.p, { verifier: `PASS ${ok.code}` });
  const g = merge(ok.p, `git checkout "$INTEGRATION" && git merge --no-ff ${BRANCH}`);
  assert.equal(g.status, 0, g.stderr);
});

test('verified: handoff notes committed after the verdict, alone or with the story file, keep it', () => {
  const { p, code } = project();
  record(p, { verifier: `PASS ${code}` });
  commitOn(p, 'docs/handoff/2026-10-25.md', '# Handoff\n', 'docs: handoff');
  fs.writeFileSync(path.join(p, 'docs', 'handoff', '2026-10-25.md'), '# Handoff\n\nmore\n');
  fs.writeFileSync(path.join(p, STORY), storyText({ ...CLAIM, status: 'in-review', verifier: `PASS ${code}`, updated: '2026-10-25 09:00' }));
  gitIn(p, ['add', '-A']);
  gitIn(p, ['commit', '-qm', 'chore(S1-1): handoff and record']);
  toMain(p);
  const r = merge(p);
  assert.equal(r.status, 0, r.stderr);
  toBranch(p);
  commitOn(p, 'docs/handoff/nested/x.md', 'x\n', 'not a handoff note');
  toMain(p);
  assert.equal(merge(p).status, 2, 'only docs/handoff/*.md counts');
});

test('verified: an absent protected equals [] and an absent protected_base equals an empty one', () => {
  for (const [onMain, onBranch] of [[{ protected: [] }, {}], [{}, { protected: [], protected_base: '' }], [{ protected_base: '' }, {}]]) {
    const { p, code } = project({ tier: 'T0', ...onMain });
    record(p, { verifier: `PASS ${code}` }, { claim: { tier: 'T0', ...onBranch } });
    toMain(p);
    const r = merge(p);
    assert.equal(r.status, 0, `${JSON.stringify(onMain)} vs ${JSON.stringify(onBranch)}: ${r.stderr}`);
  }
});

test('verified: a named story branch the integration branch already holds is a no-op', () => {
  const { p } = project();
  record(p, {});
  toMain(p);
  gitIn(p, ['merge', '-q', '--no-ff', '--no-edit', BRANCH]);
  const r = merge(p);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(merge(p, `git merge --ff-only ${BRANCH}`).status, 0);
});

test('verified: an operand the integration branch\'s upstream holds is skipped', () => {
  const { p, code } = project();
  record(p, { verifier: `PASS ${code}` });
  gitIn(p, ['config', 'branch.main.remote', 'origin']);
  gitIn(p, ['config', 'branch.main.merge', 'refs/heads/main']);
  gitIn(p, ['checkout', '-qb', 'upstream', 'main']);
  commitOn(p, 'src/other.js', 'pushed by someone\n', 'another story pushed');
  gitIn(p, ['update-ref', 'refs/remotes/origin/main', 'HEAD']);
  toBranch(p);
  gitIn(p, ['branch', '-D', 'upstream']);
  gitIn(p, ['merge', '-q', '--no-ff', '--no-edit', 'origin/main']);
  toMain(p);
  const r = merge(p, 'git merge --ff-only origin/main');
  assert.equal(r.status, 0, r.stderr);
});

// --- WP-D fix round 1 ---

test('verified: a no-op story merge after a ref-changing command in the same call is blocked', () => {
  const { p } = project();
  record(p, {});
  const old = gitIn(p, ['rev-parse', 'HEAD']).trim();
  toMain(p);
  gitIn(p, ['merge', '-q', '--no-ff', '--no-edit', BRANCH]);
  gitIn(p, ['update-ref', `refs/remotes/origin/${BRANCH}`, old]);
  assert.equal(merge(p).status, 0, 'alone, the merge is a no-op');
  for (const command of [`git fetch origin ${BRANCH}:${BRANCH} && git merge ${BRANCH}`, `git fetch origin && git merge origin/${BRANCH}`, `git branch -f ${BRANCH} ${old} && git merge ${BRANCH}`]) {
    const r = merge(p, command);
    assert.equal(r.status, 2, command);
    assert.match(r.stderr, /run the merge as its own command/, command);
  }
});

test('verified: a story the integration branch holds is still gated when the target is another branch', () => {
  const { p } = project();
  record(p, {});
  toMain(p);
  gitIn(p, ['branch', 'release']);
  gitIn(p, ['merge', '-q', '--no-ff', '--no-edit', BRANCH]);
  const r = merge(p, `git checkout release && git merge --no-ff ${BRANCH}`);
  assert.equal(r.status, 2, r.stderr);
});

test('verified: a same-named branch on an untrusted remote does not exempt an operand', () => {
  const { p } = project();
  record(p, {});
  const tip = gitIn(p, ['rev-parse', 'HEAD']).trim();
  toMain(p);
  gitIn(p, ['update-ref', 'refs/remotes/fork/main', tip]);
  const r = merge(p, `git merge --no-ff ${tip}`);
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /no verifier verdict/);
});

test('verified: a computed start point does not hide a literal new branch name', () => {
  const { p } = project();
  record(p, {});
  gitIn(p, ['branch', 'pm/S1-2-existing']);
  toMain(p);
  for (const command of ['git checkout -b pm/S1-3-new "$BASE" && git merge --no-ff pm/S1-2-existing', 'git switch -c pm/S1-3-new $BASE && git merge --no-ff pm/S1-2-existing']) {
    const r = merge(p, command);
    assert.equal(r.status, 0, `${command}: ${r.stderr}`);
  }
  assert.equal(merge(p, 'git checkout -b "$NEW" main && git merge --no-ff pm/S1-2-existing').status, 2, 'a computed new name is still unknown');
});
