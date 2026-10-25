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
  // The block never advertises the kill switch; the PM must not use it to get past a block.
  assert.doesNotMatch(r.stderr, /DELIVER_NO_ENFORCE/);
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
    [p, `cd "$PROJECT" && git merge ${BRANCH}`],
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
  // The last case names a cwd outside any repository, so the result does not depend on the
  // checkout the tests run from (this one holds a deliver project under examples/).
  for (const input of ['not json {', '', '[]', '{"tool_input":{"command":42}}', JSON.stringify({ cwd: tmpDir('pmgarbage-'), tool_input: { command: `git merge "${BRANCH}` } })]) {
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

// --- release integration (WP-E1) ---

// subProject(): a deliver project under packages/foo of a larger repository, with the claim on
// main and a story branch carrying one code commit. Returns { top, proj, code }.
function subProject(claim = {}, name = 'foo') {
  const top = tmpDir('pmmono-');
  const proj = path.join(top, 'packages', name);
  for (const sub of ['docs/stories', 'src']) fs.mkdirSync(path.join(proj, sub), { recursive: true });
  gitIn(top, ['init', '-q']);
  gitIn(top, ['config', 'user.email', 'casey@example.com']);
  gitIn(top, ['config', 'user.name', 'Casey Example']);
  fs.writeFileSync(path.join(top, 'README.md'), 'monorepo\n');
  fs.writeFileSync(path.join(proj, 'docs', 'approval.json'), JSON.stringify({ status: 'approved', approver: 'Casey', approved_date: '2026-09-01', plan_digest: null, updated: '2026-09-01 10:00' }) + '\n');
  fs.writeFileSync(path.join(proj, 'docs', 'plan.md'), '# Plan\n- Integration branch: main\n');
  fs.writeFileSync(path.join(proj, STORY), storyText({ ...CLAIM, ...claim }));
  fs.writeFileSync(path.join(proj, 'src', 'fix.js'), lines('base'));
  gitIn(top, ['add', '.']);
  gitIn(top, ['commit', '-qm', 'chore(S1-1): claim']);
  gitIn(top, ['branch', '-M', 'main']);
  gitIn(top, ['checkout', '-qb', BRANCH]);
  fs.writeFileSync(path.join(proj, 'src', 'fix.js'), lines('base').replace('line 1 base', 'line 1 fixed'));
  gitIn(top, ['commit', '-qam', 'build(S1-1): fix']);
  return { top, proj, code: gitIn(top, ['rev-parse', 'HEAD']).trim() };
}

const recordSub = (proj, fields) => {
  fs.writeFileSync(path.join(proj, STORY), storyText({ ...CLAIM, status: 'in-review', ...fields }));
  gitIn(proj, ['add', STORY]);
  gitIn(proj, ['commit', '-qm', 'chore(S1-1): record']);
};

test('verified: a deliver project below the git top level is gated: unverified blocks, verified ships', () => {
  const un = subProject();
  recordSub(un.proj, {});
  gitIn(un.top, ['checkout', '-q', 'main']);
  const r = hook(un.proj, `git merge --no-ff ${BRANCH}`);
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /no verifier verdict/);
  // From the repository root, with the session's project named by CLAUDE_PROJECT_DIR.
  assert.equal(hook(un.top, `git merge --no-ff ${BRANCH}`, { CLAUDE_PROJECT_DIR: un.proj }).status, 2);
  const ok = subProject();
  recordSub(ok.proj, { verifier: `PASS ${ok.code}` });
  gitIn(ok.top, ['checkout', '-q', 'main']);
  const v = hook(ok.proj, `git merge --no-ff ${BRANCH}`);
  assert.equal(v.status, 0, v.stderr);
});

test('verified: a claim with neither deliver nor tier is legacy only while no story on the integration branch records 0.29+', () => {
  const legacy = { deliver: undefined, tier: undefined };
  const other = (deliver) => storyText({ ...CLAIM, branch: 'pm/S1-2-other', deliver }).replace('S1-1: fix', 'S1-2: other');
  const { p } = project(legacy);
  onMain(p, () => commitOn(p, 'docs/stories/S1-2-other.md', other('0.28.1'), 'chore(S1-2): claim'));
  record(p, {}, { claim: legacy });
  toMain(p);
  assert.equal(merge(p).status, 0, 'every other story predates 0.29');
  toBranch(p);
  onMain(p, () => commitOn(p, 'docs/stories/S1-2-other.md', other('0.29.0'), 'chore(S1-2): claim at 0.29'));
  toMain(p);
  const r = merge(p);
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /claim records no tier/);
});

test('verified: a pm-looking operand under an unknown directory blocks only when the session project is a deliver project', () => {
  const { p } = project();
  record(p, {});
  toMain(p);
  const out = tmpDir('pmplain-');
  assert.equal(hook(p, `cd "$DIR" && git merge ${BRANCH}`).status, 2, 'the session is a deliver project');
  assert.equal(hook(out, `cd "$DIR" && git merge ${BRANCH}`).status, 0, 'the session is not a deliver project');
  const plain = tmpDir('pmplainrepo-');
  gitIn(plain, ['init', '-q']);
  assert.equal(hook(plain, `cd "$DIR" && git merge ${BRANCH}`).status, 0, 'a git repository that is not a deliver project');
});

// --- fix round 1 ---

test('verified: the merge directory\'s project wins over the session project in a sibling layout; the root blocks', () => {
  // packages/bar holds the claim and the verified story; packages/foo is the session's project.
  const { top, proj: bar, code } = subProject({}, 'bar');
  const foo = path.join(top, 'packages', 'foo');
  gitIn(top, ['checkout', '-q', 'main']);
  fs.mkdirSync(path.join(foo, 'docs', 'stories'), { recursive: true });
  fs.writeFileSync(path.join(foo, 'docs', 'approval.json'), fs.readFileSync(path.join(bar, 'docs', 'approval.json')));
  fs.writeFileSync(path.join(foo, 'docs', 'plan.md'), '# Plan\n- Integration branch: main\n');
  gitIn(top, ['add', 'packages/foo']);
  gitIn(top, ['commit', '-qm', 'foo is a deliver project too']);
  gitIn(top, ['checkout', '-q', BRANCH]);
  gitIn(top, ['merge', '-q', '--no-edit', 'main']);
  recordSub(bar, { verifier: `PASS ${code}` });
  gitIn(top, ['checkout', '-q', 'main']);
  const env = { CLAUDE_PROJECT_DIR: foo };
  const viaC = hook(top, `git -C packages/bar merge --no-ff ${BRANCH}`, env);
  assert.equal(viaC.status, 0, viaC.stderr);
  const viaCd = hook(top, `cd packages/bar && git merge --no-ff ${BRANCH}`, env);
  assert.equal(viaCd.status, 0, viaCd.stderr);
  // From the root, in no project, the gate does not guess the owner (WP-F directory rule).
  const viaRoot = hook(top, `git merge --no-ff ${BRANCH}`, env);
  assert.equal(viaRoot.status, 2, viaRoot.stderr);
  assert.match(viaRoot.stderr, /git -C <project> \(found deliver projects: packages\/bar, packages\/foo\)/);
});

test('verified: block messages name the project plan path below the top level', () => {
  const { top, proj } = subProject();
  recordSub(proj, {});
  gitIn(top, ['checkout', '-q', 'main']);
  fs.writeFileSync(path.join(proj, 'docs', 'plan.md'), '# Plan\n- Integration branch: nowhere\n');
  gitIn(top, ['commit', '-qam', 'plan names a missing branch']);
  const r = hook(proj, `git merge --no-ff ${BRANCH}`);
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /packages\/foo\/docs\/plan\.md/);
});

// --- fix round 2 ---

// siblings({ barStory, fooClaims }): deliver projects at packages/foo and packages/bar on main.
// bar (at packages/<barName>) holds its claim of BRANCH at barStory (renamed when it differs from the branch); fooClaims adds
// a claim of the same branch to foo. The story branch changes bar's code. Returns { top, foo, bar,
// code }, checked out on the story branch.
function siblings({ barStory = path.join('docs', 'stories', 'S1-1-renamed.md'), fooClaims = false, barName = 'bar' } = {}) {
  const top = tmpDir('pmsib-');
  const foo = path.join(top, 'packages', 'foo');
  const bar = path.join(top, 'packages', barName);
  gitIn(top, ['init', '-q']);
  gitIn(top, ['config', 'user.email', 'casey@example.com']);
  gitIn(top, ['config', 'user.name', 'Casey Example']);
  for (const p of [foo, bar]) {
    fs.mkdirSync(path.join(p, 'docs', 'stories'), { recursive: true });
    fs.mkdirSync(path.join(p, 'src'), { recursive: true });
    fs.writeFileSync(path.join(p, 'docs', 'approval.json'), JSON.stringify({ status: 'approved', approver: 'Casey', approved_date: '2026-09-01', plan_digest: null, updated: '2026-09-01 10:00' }) + '\n');
    fs.writeFileSync(path.join(p, 'docs', 'plan.md'), '# Plan\n- Integration branch: main\n');
    fs.writeFileSync(path.join(p, 'src', 'fix.js'), lines('base'));
  }
  fs.writeFileSync(path.join(bar, barStory), storyText(CLAIM));
  if (fooClaims) fs.writeFileSync(path.join(foo, STORY), storyText(CLAIM));
  gitIn(top, ['add', '.']);
  gitIn(top, ['commit', '-qm', 'chore(S1-1): claim']);
  gitIn(top, ['branch', '-M', 'main']);
  gitIn(top, ['checkout', '-qb', BRANCH]);
  fs.writeFileSync(path.join(bar, 'src', 'fix.js'), lines('base').replace('line 1 base', 'line 1 fixed'));
  gitIn(top, ['commit', '-qam', 'build(S1-1): fix']);
  return { top, foo, bar, barStory, code: gitIn(top, ['rev-parse', 'HEAD']).trim() };
}
const recordAt = (dir, rel, fields) => {
  fs.writeFileSync(path.join(dir, rel), storyText({ ...CLAIM, status: 'in-review', ...fields }));
  gitIn(dir, ['add', rel]);
  gitIn(dir, ['commit', '-qm', 'chore(S1-1): record']);
};

test('verified: a renamed story in a sibling project is judged with -C; from the root it blocks', () => {
  const un = siblings();
  recordAt(un.bar, un.barStory, {});
  gitIn(un.top, ['checkout', '-q', 'main']);
  assert.match(hook(un.top, `git merge --no-ff ${BRANCH}`, { CLAUDE_PROJECT_DIR: un.foo }).stderr, /found deliver projects/);
  const r = hook(un.top, `git -C packages/bar merge --no-ff ${BRANCH}`, { CLAUDE_PROJECT_DIR: un.foo });
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /packages\/bar\/docs\/stories\/S1-1-renamed\.md.*no verifier verdict/);
  const ok = siblings();
  recordAt(ok.bar, ok.barStory, { verifier: `PASS ${ok.code}` });
  gitIn(ok.top, ['checkout', '-q', 'main']);
  const v = hook(ok.top, `git -C packages/bar merge --no-ff ${BRANCH}`, { CLAUDE_PROJECT_DIR: ok.foo });
  assert.equal(v.status, 0, v.stderr);
});

test('verified: a story tip SHA is judged in the merge directory\'s project; from the root it blocks', () => {
  const ok = siblings();
  recordAt(ok.bar, ok.barStory, { verifier: `PASS ${ok.code}` });
  const tip = gitIn(ok.top, ['rev-parse', 'HEAD']).trim();
  gitIn(ok.top, ['checkout', '-q', 'main']);
  assert.match(hook(ok.top, `git merge --no-ff ${tip}`, { CLAUDE_PROJECT_DIR: ok.foo }).stderr, /found deliver projects/);
  const v = hook(ok.top, `git -C packages/bar merge --no-ff ${tip}`);
  assert.equal(v.status, 0, v.stderr);
  const un = siblings();
  recordAt(un.bar, un.barStory, {});
  const unTip = gitIn(un.top, ['rev-parse', 'HEAD']).trim();
  gitIn(un.top, ['checkout', '-q', 'main']);
  assert.match(hook(un.top, `git -C packages/bar merge --no-ff ${unTip}`).stderr, /no verifier verdict/);
});

test('verified: a story branch two projects claim blocks from the root, and is judged by -C', () => {
  const s = siblings({ barStory: STORY, fooClaims: true });
  recordAt(s.bar, STORY, { verifier: `PASS ${s.code}` });
  gitIn(s.top, ['checkout', '-q', 'main']);
  const r = hook(s.top, `git merge --no-ff ${BRANCH}`);
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /run the merge from the project directory, or with git -C <project>/);
  const c = hook(s.top, `git -C packages/bar merge --no-ff ${BRANCH}`);
  assert.equal(c.status, 0, c.stderr);
});

// --- fix round 3 ---

test('verified: a deliver project at the top level owns a root merge, even when a nested project claims the same branch', () => {
  const { p, code } = project();
  const foo = path.join(p, 'packages', 'foo');
  onMain(p, () => {
    fs.mkdirSync(path.join(foo, 'docs', 'stories'), { recursive: true });
    fs.writeFileSync(path.join(foo, 'docs', 'approval.json'), fs.readFileSync(path.join(p, 'docs', 'approval.json')));
    fs.writeFileSync(path.join(foo, STORY), storyText(CLAIM));
    gitIn(p, ['add', 'packages/foo']);
    gitIn(p, ['commit', '-qm', 'a nested project claims the same branch name']);
  });
  gitIn(p, ['merge', '-q', '--no-edit', 'main']);
  record(p, { verifier: `PASS ${code}` });
  toMain(p);
  const r = merge(p);
  assert.equal(r.status, 0, r.stderr);
});

test('verified: a story merge from the repository root of nested projects blocks and names them', () => {
  const s = siblings();
  gitIn(s.top, ['checkout', '-q', 'main']);
  gitIn(s.top, ['rm', '-q', path.join('packages', 'bar', s.barStory)]);
  gitIn(s.top, ['commit', '-qm', 'no claim in bar']);
  const r = hook(s.top, `git merge --no-ff ${BRANCH}`);
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /run the merge from the project directory, or with git -C <project> \(found deliver projects: packages\/bar, packages\/foo\)/);
});

test('verified: a project whose plans disagree across trusted branches blocks with -C, and from the root', () => {
  const s = siblings();
  recordAt(s.bar, s.barStory, { verifier: `PASS ${s.code}` });
  gitIn(s.top, ['checkout', '-q', 'main']);
  gitIn(s.top, ['checkout', '-qb', 'master']);
  fs.writeFileSync(path.join(s.bar, 'docs', 'plan.md'), '# Plan\n- Integration branch: master\n');
  gitIn(s.top, ['commit', '-qam', 'bar on master names master']);
  gitIn(s.top, ['checkout', '-q', 'main']);
  assert.match(hook(s.top, `git merge --no-ff ${BRANCH}`).stderr, /found deliver projects/);
  const r = hook(s.top, `git -C packages/bar merge --no-ff ${BRANCH}`);
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /disagree/);
});

test('verified: a story tip known only on a non-origin remote is still gated', () => {
  const tipOnUpstream = (fields) => {
    const s = siblings();
    recordAt(s.bar, s.barStory, fields(s));
    const tip = gitIn(s.top, ['rev-parse', 'HEAD']).trim();
    gitIn(s.top, ['update-ref', `refs/remotes/upstream/${BRANCH}`, tip]);
    gitIn(s.top, ['checkout', '-q', 'main']);
    gitIn(s.top, ['branch', '-qD', BRANCH]);
    return { ...s, tip };
  };
  const un = tipOnUpstream(() => ({}));
  assert.match(hook(un.top, `git merge --no-ff ${un.tip}`).stderr, /found deliver projects/);
  const r = hook(un.top, `git -C packages/bar merge --no-ff ${un.tip}`);
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /no verifier verdict/);
  const ok = tipOnUpstream((s) => ({ verifier: `PASS ${s.code}` }));
  const v = hook(ok.top, `git -C packages/bar merge --no-ff ${ok.tip}`);
  assert.equal(v.status, 0, v.stderr);
});

// --- WP-F: the directory rule ---
// The project that owns a merge is the one its directory sits in. From a directory in no deliver
// project, in a repository holding any, a story-like operand blocks and names the projects.

const atRoot = (where = 'packages/bar') => new RegExp(`run the merge from the project directory, or with git -C <project> \\(found deliver projects: [^)]*${where}`);
const verifiedSiblings = (opts) => {
  const s = siblings(opts);
  recordAt(s.bar, s.barStory, { verifier: `PASS ${s.code}` });
  gitIn(s.top, ['checkout', '-q', 'main']);
  return s;
};

test('directory rule: a computed pm/ operand blocks from a monorepo root; the branch ships with -C', () => {
  const s = verifiedSiblings();
  const r = hook(s.top, 'git merge --no-ff pm/"$STORY_ID"');
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, atRoot());
  const c = hook(s.top, `git -C packages/bar merge --no-ff ${BRANCH}`);
  assert.equal(c.status, 0, c.stderr);
  // Inside the project a computed operand still blocks, as before.
  assert.equal(hook(s.top, 'git -C packages/bar merge --no-ff pm/"$STORY_ID"').status, 2);
});

test('directory rule: a story-ancestor SHA blocks from a monorepo root; the branch ships with -C', () => {
  const s = verifiedSiblings();
  const r = hook(s.top, `git merge --no-ff ${s.code}`);
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, atRoot());
  const c = hook(s.top, `git -C packages/bar merge --no-ff ${BRANCH}`);
  assert.equal(c.status, 0, c.stderr);
  // Inside the project the ancestor is short of the tip, as before.
  assert.match(hook(s.top, `git -C packages/bar merge --no-ff ${s.code}`).stderr, /short of its tip/);
});

test('directory rule: a second claimant with disagreeing plans blocks from the root; -C picks the healthy project', () => {
  const s = siblings({ fooClaims: true });
  recordAt(s.bar, s.barStory, { verifier: `PASS ${s.code}` });
  gitIn(s.top, ['checkout', '-q', 'main']);
  gitIn(s.top, ['checkout', '-qb', 'master']);
  fs.writeFileSync(path.join(s.foo, 'docs', 'plan.md'), '# Plan\n- Integration branch: master\n');
  gitIn(s.top, ['commit', '-qam', 'foo on master names master']);
  gitIn(s.top, ['checkout', '-q', 'main']);
  const r = hook(s.top, `git merge --no-ff ${BRANCH}`);
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, atRoot('packages/bar, packages/foo'));
  const c = hook(s.top, `git -C packages/bar merge --no-ff ${BRANCH}`);
  assert.equal(c.status, 0, c.stderr);
  assert.match(hook(s.top, `git -C packages/foo merge --no-ff ${BRANCH}`).stderr, /disagree/);
});

test('directory rule: a project at a non-ASCII path (core.quotePath) is found from the root, and ships with -C', () => {
  const s = verifiedSiblings({ barName: 'café' });
  const r = hook(s.top, `git merge --no-ff ${BRANCH}`);
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, atRoot('packages/café'));
  const c = hook(s.top, `git -C packages/café merge --no-ff ${BRANCH}`);
  assert.equal(c.status, 0, c.stderr);
  const un = siblings({ barName: 'café' });
  recordAt(un.bar, un.barStory, {});
  gitIn(un.top, ['checkout', '-q', 'main']);
  assert.match(hook(un.top, `git -C packages/café merge --no-ff ${BRANCH}`).stderr, /no verifier verdict/);
});

test('directory rule: an unclaimed story blocks from the root; once claimed and verified it ships with -C', () => {
  const s = verifiedSiblings();
  gitIn(s.top, ['rm', '-q', path.join('packages', 'bar', s.barStory)]);
  gitIn(s.top, ['commit', '-qm', 'no claim in bar']);
  const r = hook(s.top, `git merge --no-ff ${BRANCH}`);
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, atRoot());
  assert.match(hook(s.top, `git -C packages/bar merge --no-ff ${BRANCH}`).stderr, /no story on main claims/);
  gitIn(s.top, ['revert', '--no-edit', 'HEAD']);
  const c = hook(s.top, `git -C packages/bar merge --no-ff ${BRANCH}`);
  assert.equal(c.status, 0, c.stderr);
});

test('directory rule: a renamed story blocks from the root, even with a deliver session elsewhere; ships with -C', () => {
  const s = verifiedSiblings();
  for (const env of [{}, { CLAUDE_PROJECT_DIR: s.foo }]) {
    const r = hook(s.top, `git merge --no-ff ${BRANCH}`, env);
    assert.equal(r.status, 2, r.stderr);
    assert.match(r.stderr, atRoot());
  }
  const c = hook(s.top, `git -C packages/bar merge --no-ff ${BRANCH}`);
  assert.equal(c.status, 0, c.stderr);
  const viaCd = hook(s.top, `cd packages/bar && git merge --no-ff ${BRANCH}`);
  assert.equal(viaCd.status, 0, viaCd.stderr);
});

test('directory rule: merging main or origin/main at a monorepo root right after a story branch is cut is allowed', () => {
  const s = verifiedSiblings();
  const origin = tmpDir('pmorigin-');
  gitIn(origin, ['init', '-q', '--bare']);
  gitIn(s.top, ['remote', 'add', 'origin', origin]);
  gitIn(s.top, ['push', '-q', '-u', 'origin', 'main']);
  gitIn(s.top, ['checkout', '-qb', 'feat/x']);
  commitOn(s.top, 'notes.txt', 'x\n', 'feat: x');
  gitIn(s.top, ['branch', 'pm/S1-1', 'main']);
  for (const cmd of ['git merge main', 'git fetch && git merge origin/main', 'git merge --no-ff main -m "sync"']) {
    const r = hook(s.top, cmd);
    assert.equal(r.status, 0, `${cmd}: ${r.stderr}`);
  }
  // A fetched origin/main ahead of local main is still a trusted upstream.
  gitIn(s.top, ['checkout', '-q', 'main']);
  commitOn(s.top, 'more.txt', 'y\n', 'feat: y');
  gitIn(s.top, ['push', '-q', 'origin', 'main']);
  gitIn(s.top, ['reset', '-q', '--hard', 'HEAD~1']);
  gitIn(s.top, ['checkout', '-q', 'feat/x']);
  const r = hook(s.top, 'git merge origin/main');
  assert.equal(r.status, 0, r.stderr);
});

test('directory rule: a repository with no deliver project is never blocked', () => {
  const plain = tmpDir('pmplainrepo-');
  gitIn(plain, ['init', '-q']);
  gitIn(plain, ['config', 'user.email', 'casey@example.com']);
  gitIn(plain, ['config', 'user.name', 'Casey Example']);
  commitOn(plain, 'a.txt', 'a\n', 'init');
  gitIn(plain, ['branch', '-M', 'main']);
  gitIn(plain, ['checkout', '-qb', BRANCH]);
  commitOn(plain, 'b.txt', 'b\n', 'one');
  const mid = gitIn(plain, ['rev-parse', 'HEAD']).trim();
  commitOn(plain, 'c.txt', 'c\n', 'two');
  gitIn(plain, ['checkout', '-q', 'main']);
  for (const cmd of [`git merge ${BRANCH}`, 'git merge pm/"$ID"', `git merge ${mid}`, 'git merge -', `git pull origin ${BRANCH}`, `cd sub && git merge ${BRANCH}`]) {
    const r = hook(plain, cmd);
    assert.equal(r.status, 0, `${cmd}: ${r.stderr}`);
  }
});

// --- WP-F fix round 1 ---

test('directory rule: FETCH_HEAD after a fetch of a story branch blocks at a monorepo root', () => {
  const s = verifiedSiblings();
  const r = hook(s.top, `git fetch origin ${BRANCH} && git merge --no-ff FETCH_HEAD`);
  assert.equal(r.status, 2, r.stderr);
  assert.equal(hook(s.top, 'git merge --no-ff FETCH_HEAD').status, 2, 'FETCH_HEAD alone is story-like too');
});

test('directory rule: after a ref-changing command, a merge of anything but a base branch at the root is SEPARATE', () => {
  const s = verifiedSiblings();
  gitIn(s.top, ['branch', 'feature', 'main']);
  const r = hook(s.top, 'git fetch && git merge --no-ff feature');
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /run the merge as its own command/);
  assert.equal(hook(s.top, 'git merge --no-ff feature').status, 0, 'on its own, a non-story branch merges');
  for (const cmd of ['git fetch && git merge origin/main', 'git fetch && git merge main']) assert.equal(hook(s.top, cmd).status, 0, cmd);
});

// developProject(): main holds no deliver project; develop adds packages/bar, whose plan names
// develop, and a story branch cut from develop changes bar's code. Checked out on main.
function developProject() {
  const top = tmpDir('pmdev-');
  const bar = path.join(top, 'packages', 'bar');
  gitIn(top, ['init', '-q']);
  gitIn(top, ['config', 'user.email', 'casey@example.com']);
  gitIn(top, ['config', 'user.name', 'Casey Example']);
  commitOn(top, 'README.md', 'monorepo\n', 'init');
  gitIn(top, ['branch', '-M', 'main']);
  gitIn(top, ['checkout', '-qb', 'develop']);
  fs.mkdirSync(path.join(bar, 'docs', 'stories'), { recursive: true });
  fs.mkdirSync(path.join(bar, 'src'), { recursive: true });
  fs.writeFileSync(path.join(bar, 'docs', 'approval.json'), JSON.stringify({ status: 'approved', approver: 'Casey', approved_date: '2026-09-01', plan_digest: null, updated: '2026-09-01 10:00' }) + '\n');
  fs.writeFileSync(path.join(bar, 'docs', 'plan.md'), '# Plan\n- Integration branch: develop\n');
  fs.writeFileSync(path.join(bar, STORY), storyText(CLAIM));
  fs.writeFileSync(path.join(bar, 'src', 'fix.js'), lines('base'));
  gitIn(top, ['add', '.']);
  gitIn(top, ['commit', '-qm', 'bar integrates on develop']);
  gitIn(top, ['checkout', '-qb', BRANCH]);
  fs.writeFileSync(path.join(bar, 'src', 'fix.js'), lines('base').replace('line 1 base', 'line 1 fixed'));
  gitIn(top, ['commit', '-qam', 'build(S1-1): fix']);
  gitIn(top, ['checkout', '-q', 'main']);
  return { top, bar };
}

test('directory rule: a project integrating on develop is found from the root though main lacks it', () => {
  const d = developProject();
  const r = hook(d.top, `git merge --no-ff ${BRANCH}`);
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /found deliver projects: packages\/bar/);
  assert.equal(hook(d.top, 'git merge --no-ff develop').status, 2, 'develop carries story-free work into main, a base branch, but holds bar');
});

test('directory rule: a listing that fails while a story-like operand is present blocks', () => {
  const s = verifiedSiblings();
  // Drop a subtree object main needs, so the recursive listing of main fails.
  const oid = gitIn(s.top, ['rev-parse', 'main:packages/foo/src']).trim();
  fs.rmSync(path.join(s.top, '.git', 'objects', oid.slice(0, 2), oid.slice(2)));
  const r = hook(s.top, `git merge --no-ff ${BRANCH}`);
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /cannot list the repository to look for deliver projects/);
});

test('directory rule: the root rule skips a target no project integrates on, and keeps any that could be one', () => {
  const s = verifiedSiblings();
  gitIn(s.top, ['checkout', '-qb', 'feat/x']);
  const r = hook(s.top, 'git merge -');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(hook(s.top, `git merge --no-ff ${BRANCH}`).status, 0, 'feat/x is not an integration branch');
  // A checkout earlier in the call sets the target: main is a base branch.
  assert.equal(hook(s.top, `git checkout main && git merge --no-ff ${BRANCH}`).status, 2);
  const d = developProject();
  gitIn(d.top, ['checkout', '-q', 'develop']);
  assert.equal(hook(d.top, 'git merge -').status, 2, 'develop is bar\'s integration branch, though a working-tree project resolves only below');
});

// --- WP-F fix round 2 ---

// gitLog(): a PATH whose git records each invocation's arguments, one line each, then runs git.
function gitLog() {
  const bin = tmpDir('pmgitlog-');
  const log = path.join(bin, 'calls.log');
  const real = spawnSync('which', ['git'], { encoding: 'utf8' }).stdout.trim();
  fs.writeFileSync(path.join(bin, 'git'), `#!/bin/sh\necho "$*" >> "${log}"\nexec "${real}" "$@"\n`, { mode: 0o755 });
  return { env: { PATH: `${bin}${path.delimiter}${process.env.PATH}` }, calls: () => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : '') , reset: () => fs.rmSync(log, { force: true }) };
}

test('directory rule: no discovery at the root when nothing can be a story', { skip: process.platform === 'win32' && 'POSIX stub' }, () => {
  const s = siblings();
  gitIn(s.top, ['checkout', '-q', 'main']);
  const g = gitLog();
  const listed = () => /ls-tree -r|ls-files/.test(g.calls());
  for (const cmd of ['git merge --abort', 'git pull']) {
    g.reset();
    assert.equal(hook(s.top, cmd, g.env).status, 0, cmd);
    assert.equal(listed(), false, `${cmd}: nothing to merge, so no discovery`);
  }
  // With no pm/* tips and no named story operand, nothing can block.
  gitIn(s.top, ['branch', '-qD', BRANCH]);
  gitIn(s.top, ['branch', 'feature', 'main']);
  g.reset();
  assert.equal(hook(s.top, 'git merge --no-ff feature', g.env).status, 0);
  assert.equal(listed(), false, 'no pm/* tips and no named story: no discovery');
  // A named story still triggers it.
  g.reset();
  assert.equal(hook(s.top, `git merge --no-ff ${BRANCH}`, g.env).status, 2);
  assert.equal(listed(), true);
});

test('directory rule: a base-named operand is exempt from SEPARATE only after calls that cannot write refs', () => {
  const s = verifiedSiblings();
  for (const cmd of ['git fetch origin main:main && git merge main', 'git update-ref refs/heads/main HEAD && git merge main', 'git branch -f main HEAD && git merge main', 'git reset --hard && git merge main', 'git fetch origin +refs/heads/*:refs/remotes/origin/* && git merge origin/main', 'git checkout -B main && git merge main']) {
    const r = hook(s.top, cmd);
    assert.equal(r.status, 2, `${cmd}: ${r.stderr}`);
    assert.match(r.stderr, /run the merge as its own command/, cmd);
  }
  for (const cmd of ['git fetch && git merge origin/main', 'git fetch origin main && git merge origin/main', 'git status && git log -1 && git diff && git show HEAD && git rev-parse HEAD && git merge main', 'git checkout main && git merge main']) {
    const r = hook(s.top, cmd);
    assert.equal(r.status, 0, `${cmd}: ${r.stderr}`);
  }
});

// --- WP-F fix round 3 ---

test('directory rule: with no pm/* tips, a merge after a ref-writing call still reaches discovery and blocks SEPARATE', { skip: process.platform === 'win32' && 'POSIX stub' }, () => {
  const s = siblings();
  gitIn(s.top, ['checkout', '-q', 'main']);
  gitIn(s.top, ['branch', '-qD', BRANCH]);
  commitOn(s.top, 'notes.txt', 'x\n', 'more work');
  const sha = gitIn(s.top, ['rev-parse', 'HEAD~1']).trim();
  const r = hook(s.top, `git branch pm/S1-9-x HEAD~1 && git merge --no-ff ${sha}`);
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /run the merge as its own command/);
  const g = gitLog();
  for (const cmd of ['git merge --abort', 'git pull', `git status && git merge --no-ff ${sha}`]) {
    g.reset();
    assert.equal(hook(s.top, cmd, g.env).status, 0, cmd);
    assert.equal(/ls-tree -r|ls-files/.test(g.calls()), false, `${cmd}: no discovery`);
  }
});

// --- WP-F final micro-fix ---

test('directory rule: with no pm/* tips known, a merge after a fetch still reaches discovery and blocks', { skip: process.platform === 'win32' && 'POSIX stub' }, () => {
  const s = verifiedSiblings();
  const origin = tmpDir('pmorigin-');
  gitIn(origin, ['init', '-q', '--bare']);
  gitIn(s.top, ['remote', 'add', 'origin', origin]);
  gitIn(s.top, ['push', '-q', 'origin', 'main', BRANCH]);
  const tip = gitIn(s.top, ['rev-parse', BRANCH]).trim();
  // The story exists only on the remote: no local branch, no remote-tracking ref yet.
  gitIn(s.top, ['branch', '-qD', BRANCH]);
  gitIn(s.top, ['update-ref', '-d', `refs/remotes/origin/${BRANCH}`]);
  const r = hook(s.top, `git fetch origin && git merge --no-ff ${tip}`);
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /run the merge as its own command/);
  const g = gitLog();
  for (const cmd of ['git merge --abort', 'git pull']) {
    g.reset();
    assert.equal(hook(s.top, cmd, g.env).status, 0, cmd);
    assert.equal(/ls-tree -r|ls-files/.test(g.calls()), false, `${cmd}: no discovery`);
  }
});

// --- shell comments (WP-H fix round 1) ---

test('verified: an unquoted shell comment is skipped, so a commented-out switch cannot hide the merge', () => {
  const { p } = project();
  record(p, {});
  toMain(p);
  const r = merge(p, `# Resume later (git switch ${BRANCH})\ngit merge --no-ff ${BRANCH}`);
  assert.equal(r.status, 2, r.stderr);
  const trailing = merge(p, `git status # then (git switch ${BRANCH})\ngit merge --no-ff ${BRANCH}`);
  assert.equal(trailing.status, 2, trailing.stderr);
});

test('verified: a # inside quotes or inside a word is not a comment', () => {
  const { p } = project();
  record(p, {});
  toMain(p);
  assert.equal(merge(p, `git merge -m "fix #1" --no-ff ${BRANCH}`).status, 2);
  assert.equal(merge(p, `git merge -m 'fix #1' --no-ff ${BRANCH}`).status, 2);
  assert.equal(merge(p, `echo a#b; git merge --no-ff ${BRANCH}`).status, 2, 'a#b is one word, so the merge still runs');
});

// --- WP-H fix round 2 ---

test('verified: for git switch, -- ends the options and the next word is still the branch', () => {
  const { p } = project();
  record(p, {});
  // From the story checkout: switch reaches main, so the merge ships the story.
  const r = merge(p, `git switch -- main && git merge --no-ff ${BRANCH}`);
  assert.equal(r.status, 2, r.stderr);
});

test('verified: a merge or pull with no operand judges the target branch\'s configured upstream', () => {
  const { p, code } = project();
  record(p, {});
  toMain(p);
  gitIn(p, ['branch', '--set-upstream-to', BRANCH, 'main']);
  for (const command of ['git merge --no-ff', 'git pull --no-rebase', 'git pull']) {
    const r = merge(p, command);
    assert.equal(r.status, 2, `${command}: ${r.stderr}`);
    assert.match(r.stderr, /pm\/S1-1-fix/);
  }
  assert.equal(merge(p, 'git merge --abort').status, 0, 'merge-control forms stay exempt');
  toBranch(p);
  record(p, { verifier: `PASS ${code}` });
  toMain(p);
  for (const command of ['git merge --no-ff', 'git pull --no-rebase']) assert.equal(merge(p, command).status, 0, `${command} once verified`);
});

test('verified: a bare merge on the integration branch with no upstream asks for the branch by name', () => {
  const { p } = project();
  record(p, {});
  toMain(p);
  const r = merge(p, 'git merge --no-ff');
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /name the branch to merge explicitly/);
  assert.equal(merge(p, 'git merge --continue').status, 0);
});

test('verified: a comment inside a command substitution cannot swallow the merge after it', () => {
  const { p } = project();
  record(p, {});
  toMain(p);
  // The ( sits in a comment, so the substitution closes on the next line and the merge runs.
  const r = merge(p, `echo $(true # (\n); git merge --no-ff ${BRANCH}`);
  assert.equal(r.status, 2, r.stderr);
  const quoted = merge(p, `echo "$(true # (\n)"; git merge --no-ff ${BRANCH}`);
  assert.equal(quoted.status, 2, quoted.stderr);
});

// --- WP-H fix round 3 ---

test('verified: checkout <branch> -- with nothing after the -- is a branch switch', () => {
  const { p } = project();
  record(p, {});
  // HEAD is the story branch; the checkout reaches main, so the merge ships the story.
  const r = merge(p, `git checkout main -- && git merge --no-ff ${BRANCH}`);
  assert.equal(r.status, 2, r.stderr);
  // With a path after --, it stays a path checkout and the target stays the story branch.
  assert.equal(merge(p, `git checkout main -- src/fix.js && git merge --no-ff main`).status, 0);
});

test('verified: redirections are not operands, so a bare merge into a log still judges the upstream', () => {
  const { p } = project();
  record(p, {});
  toMain(p);
  gitIn(p, ['branch', '--set-upstream-to', BRANCH, 'main']);
  for (const command of ['git merge > /tmp/merge.log', 'git merge --no-ff 2>&1 >/tmp/merge.log', '2>/dev/null git merge']) {
    const r = merge(p, command);
    assert.equal(r.status, 2, `${command}: ${r.stderr}`);
    assert.match(r.stderr, /pm\/S1-1-fix/);
  }
  gitIn(p, ['branch', '--unset-upstream', 'main']);
  const piped = merge(p, `git merge --no-ff ${BRANCH} 2>&1 | tee log`);
  assert.equal(piped.status, 2, piped.stderr);
  assert.match(piped.stderr, /no verifier verdict/);
});

// fetchHead(p, lines): write FETCH_HEAD as git fetch would, one { sha, merge, desc } a line.
const fetchHead = (p, lines) => {
  const file = path.resolve(p, gitIn(p, ['rev-parse', '--git-path', 'FETCH_HEAD']).trim());
  fs.writeFileSync(file, lines.map(({ sha, merge: m = true, desc }) => `${sha}\t${m ? '' : 'not-for-merge'}\t${desc}\n`).join(''));
};

test('verified: a merge of FETCH_HEAD judges every head marked for merge', () => {
  const { p, code } = project();
  record(p, {});
  toMain(p);
  const main = gitIn(p, ['rev-parse', 'main']).trim();
  const tip = gitIn(p, ['rev-parse', BRANCH]).trim();
  // As left by `git fetch origin main pm/S1-1-fix`: main first, so rev-parse FETCH_HEAD is main.
  fetchHead(p, [{ sha: main, desc: "branch 'main' of ../origin" }, { sha: tip, desc: `branch '${BRANCH}' of ../origin` }]);
  const r = merge(p, 'git merge --no-ff FETCH_HEAD');
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /pm\/S1-1-fix/);
  // A head marked not-for-merge is not merged, so it is not judged.
  fetchHead(p, [{ sha: main, desc: "branch 'main' of ../origin" }, { sha: tip, merge: false, desc: `branch '${BRANCH}' of ../origin` }]);
  assert.equal(merge(p, 'git merge --no-ff FETCH_HEAD').status, 0);
  // Once verified, the story head passes.
  toBranch(p);
  record(p, { verifier: `PASS ${code}` });
  toMain(p);
  fetchHead(p, [{ sha: main, desc: "branch 'main' of ../origin" }, { sha: gitIn(p, ['rev-parse', BRANCH]).trim(), desc: `branch '${BRANCH}' of ../origin` }]);
  assert.equal(merge(p, 'git merge --no-ff FETCH_HEAD').status, 0, merge(p, 'git merge --no-ff FETCH_HEAD').stderr);
  // In one command with the fetch, the separate-command rule still applies.
  assert.match(merge(p, `git fetch origin main ${BRANCH} && git merge --no-ff FETCH_HEAD`).stderr, /separate command|own command/);
});

test('verified: an unreadable FETCH_HEAD blocks while a story could be in it', () => {
  const { p } = project();
  record(p, {});
  toMain(p);
  const file = path.resolve(p, gitIn(p, ['rev-parse', '--git-path', 'FETCH_HEAD']).trim());
  fs.mkdirSync(file, { recursive: true });
  const r = merge(p, 'git merge --no-ff FETCH_HEAD');
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /FETCH_HEAD/);
});

test('verified: a # right after ) or after an escaped space is part of the word, not a comment', () => {
  const { p } = project();
  record(p, {});
  toMain(p);
  assert.equal(merge(p, `echo "$(echo $(date)#)"; git merge --no-ff ${BRANCH}`).status, 2);
  assert.equal(merge(p, `echo $(echo $(date)#\n); git merge --no-ff ${BRANCH}`).status, 2);
  assert.equal(merge(p, `echo a\\ #b; git merge --no-ff ${BRANCH}`).status, 2);
});

test('verified: a bare pull whose upstream is a remote story branch gets the fetch-then-merge block', () => {
  const { p } = project();
  record(p, {});
  toMain(p);
  const tip = gitIn(p, ['rev-parse', BRANCH]).trim();
  gitIn(p, ['update-ref', `refs/remotes/origin/${BRANCH}`, tip]);
  gitIn(p, ['config', 'branch.main.remote', 'origin']);
  gitIn(p, ['config', 'branch.main.merge', `refs/heads/${BRANCH}`]);
  gitIn(p, ['config', 'remote.origin.url', p]);
  gitIn(p, ['config', 'remote.origin.fetch', '+refs/heads/*:refs/remotes/origin/*']);
  const r = merge(p, 'git pull');
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /fetch.*separate command/);
});

test('verified: a bare merge or pull on the integration branch tracking origin/main is allowed', () => {
  const { p } = project();
  record(p, {});
  toMain(p);
  gitIn(p, ['update-ref', 'refs/remotes/origin/main', 'main']);
  gitIn(p, ['config', 'branch.main.remote', 'origin']);
  gitIn(p, ['config', 'branch.main.merge', 'refs/heads/main']);
  gitIn(p, ['config', 'remote.origin.url', p]);
  gitIn(p, ['config', 'remote.origin.fetch', '+refs/heads/*:refs/remotes/origin/*']);
  for (const command of ['git merge --no-ff', 'git merge', 'git pull', 'git pull --no-rebase']) assert.equal(merge(p, command).status, 0, command);
});

// The audit: each shell construct an honest PM writes around a merge, judged for an unverified
// story (blocked) and a verified one (allowed), unless `both` pins one decision for either.
test('verified: audit of shell constructs around a merge, unverified blocked and verified allowed', () => {
  const B = BRANCH;
  const rows = [
    ['&&', () => `echo go && git merge --no-ff ${B}`],
    [';', () => `echo go; git merge --no-ff ${B}`],
    ['||', () => `false || git merge --no-ff ${B}`],
    ['|', () => `git merge --no-ff ${B} | cat`],
    ['newline', () => `echo go\ngit merge --no-ff ${B}`],
    ['backslash-newline', () => `git merge \\\n  --no-ff ${B}`],
    ['git status && merge', () => `git status && git merge --no-ff ${B}`],
    ['VAR=x prefix', () => `GIT_EDITOR=true git merge --no-ff ${B}`],
    ['env prefix', () => `env GIT_EDITOR=true git merge --no-ff ${B}`],
    ['nice prefix', () => `nice -n 5 git merge --no-ff ${B}`],
    ['command prefix', () => `command git merge --no-ff ${B}`],
    ['exec prefix', () => `exec git merge --no-ff ${B}`],
    ['( ... )', () => `(git merge --no-ff ${B})`],
    ['{ ...; }', () => `{ git merge --no-ff ${B}; }`],
    ['double quotes', () => `git merge --no-ff "${B}"`],
    ['single quotes', () => `git merge --no-ff '${B}'`],
    ['backslash escape', () => `git merge --no-ff pm\\/S1-1-fix`],
    ['trailing comment', () => `git merge --no-ff ${B} # ship it`],
    ['comment line', () => `# ship it (git switch ${B})\ngit merge --no-ff ${B}`],
    ['heredoc -F -', () => `git merge --no-ff ${B} -F - <<'EOF'\nfeat(S1-1): fix\nEOF`],
    ['heredoc in -m', () => `git merge --no-ff ${B} -m "$(cat <<'EOF'\nfeat(S1-1): fix (#1)\nEOF\n)"`],
    ['here-string', () => `git merge --no-ff ${B} -F - <<< "feat(S1-1): fix"`],
    ['git -C', (p) => `git -C '${p}' merge --no-ff ${B}`],
    ['git -c key=val', () => `git -c core.editor=true merge --no-ff ${B}`],
    ['--git-dir/--work-tree', (p) => `git --git-dir='${p}/.git' --work-tree='${p}' merge --no-ff ${B}`],
    ['--git-dir=', (p) => `git --git-dir=${p}/.git merge --no-ff ${B}`],
    ['checkout main --', () => `git checkout main -- && git merge --no-ff ${B}`, { from: 'branch' }],
    ['switch -- main', () => `git switch -- main && git merge --no-ff ${B}`, { from: 'branch' }],
    ['merge --', () => `git merge --no-ff -- ${B}`],
    ['> file', () => `git merge --no-ff ${B} > /tmp/merge.log`],
    ['>> and 2>>', () => `git merge --no-ff ${B} >> /tmp/out.log 2>> /tmp/err.log`],
    ['2>&1 | tee', () => `git merge --no-ff ${B} 2>&1 | tee merge.log`],
    ['&> file', () => `git merge --no-ff ${B} &> /tmp/merge.log`],
    ['>| file', () => `git merge --no-ff ${B} >| /tmp/merge.log`],
    ['< /dev/null', () => `git merge --no-ff ${B} < /dev/null`],
    ['redirect mid-args', () => `git merge > /tmp/merge.log --no-ff ${B}`],
    ['redirect first', () => `2>/dev/null git merge --no-ff ${B}`],
    ['N>file no space', () => `git merge --no-ff ${B} 2>/tmp/err.log`],
    ['N<&M', () => `git merge --no-ff ${B} 0<&-`],
    ['operand then options', () => `git merge ${B} --no-ff`],
    ['-m', () => `git merge -m "feat(S1-1): fix" --no-ff ${B}`],
    ['-F file', () => `git merge -F msg.txt --no-ff ${B}`],
    ['--no-edit', () => `git merge --no-edit --no-ff ${B}`],
    ['--ff-only', () => `git merge --ff-only ${B}`],
    ['-s/-X', () => `git merge -s ort -X theirs --no-ff ${B}`],
    ['pull with operand', () => `git pull --no-rebase origin ${B}`, { both: 2 }],
  ];
  const u = project();
  record(u.p, {});
  const v = project();
  record(v.p, { verifier: `PASS ${v.code}` });
  const wrong = [];
  for (const [label, cmd, opts = {}] of rows) {
    for (const [p, want] of [[u.p, opts.both ?? 2], [v.p, opts.both ?? 0]]) {
      if (opts.from === 'branch') toBranch(p); else toMain(p);
      const r = merge(p, cmd(p));
      if (r.status !== want) wrong.push(`${label} (${p === u.p ? 'unverified' : 'verified'}): ${r.status} not ${want}${r.stderr ? `: ${r.stderr.trim()}` : ''}`);
    }
  }
  assert.deepEqual(wrong, []);
});
