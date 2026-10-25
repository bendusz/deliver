import fs from 'node:fs';
import os from 'node:os';
import { spawnSync, execFileSync } from 'node:child_process';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { cksum, pmActorId, pmRoot, pmRelpath, readJson, pmSecretScan, hookFile, inspectState } from '../../hooks/lib.mjs';
import * as lib from '../../hooks/lib.mjs';
import { newProj, gitIn, canSymlink, tmpDir, HOOKS_DIR } from './helpers.mjs';

test('cksum matches POSIX cksum vectors', () => {
  assert.equal(cksum('casey@example.com'), 1486589864);
  // The ':pm-skill' salt is the historical name and never changes; see hooks/lib.mjs.
  assert.equal(cksum('casey@example.com:pm-skill'), 2878558254);
  assert.equal(cksum('alex.foo@example.com'), 2654315630);
  assert.equal(cksum(''), 4294967295);
});

test('pmActorId reproduces the bash id for casey@example.com', () => {
  const p = newProj();
  assert.equal(pmActorId(p), 'casey-example-com-589b8fa8ab93');
});

test('pmActorId: slug homographs get distinct ids', () => {
  const a = newProj(); gitIn(a, ['config', 'user.email', 'alex.foo@example.com']);
  const b = newProj(); gitIn(b, ['config', 'user.email', 'alex-foo@example.com']);
  const ia = pmActorId(a); const ib = pmActorId(b);
  assert.ok(ia && ib);
  assert.notEqual(ia, ib);
  assert.ok(ia.startsWith('alex-foo-example-com-') && ib.startsWith('alex-foo-example-com-'));
});

test('pmActorId falls back to user.name and returns null without identity', () => {
  const p = newProj();
  const saved = { g: process.env.GIT_CONFIG_GLOBAL, s: process.env.GIT_CONFIG_SYSTEM };
  process.env.GIT_CONFIG_GLOBAL = path.join(p, 'no-global');
  process.env.GIT_CONFIG_SYSTEM = path.join(p, 'no-system');
  try {
    gitIn(p, ['config', '--unset', 'user.email']);
    assert.equal(pmActorId(p), 'casey-example-1b81c0186403');
    gitIn(p, ['config', '--unset', 'user.name']);
    assert.equal(pmActorId(p), null);
  } finally {
    if (saved.g === undefined) delete process.env.GIT_CONFIG_GLOBAL; else process.env.GIT_CONFIG_GLOBAL = saved.g;
    if (saved.s === undefined) delete process.env.GIT_CONFIG_SYSTEM; else process.env.GIT_CONFIG_SYSTEM = saved.s;
  }
});

test('pmRoot prefers CLAUDE_PROJECT_DIR, then git top level, then cwd', () => {
  const p = newProj();
  const sub = path.join(p, 'packages', 'foo');
  const saved = process.env.CLAUDE_PROJECT_DIR;
  try {
    delete process.env.CLAUDE_PROJECT_DIR;
    assert.equal(fs.realpathSync.native(pmRoot(sub)), p);
    process.env.CLAUDE_PROJECT_DIR = p;
    assert.equal(pmRoot(sub), p);
    const plain = tmpDir('noroot-');
    delete process.env.CLAUDE_PROJECT_DIR;
    assert.equal(pmRoot(plain), plain);
  } finally {
    if (saved === undefined) delete process.env.CLAUDE_PROJECT_DIR; else process.env.CLAUDE_PROJECT_DIR = saved;
  }
});

test('pmRelpath canonicalises traversal and rejects escapes', () => {
  const p = newProj();
  assert.equal(pmRelpath(p, path.join(p, 'src', 'app.py')), 'src/app.py');
  assert.equal(pmRelpath(p, path.join(p, 'pm', '..', 'src', 'app.py')), 'src/app.py');
  assert.equal(pmRelpath(p, 'src/new/deep/file.txt'), 'src/new/deep/file.txt');
  assert.equal(pmRelpath(p, p), '.');
  assert.equal(pmRelpath(p, path.join(path.dirname(p), 'elsewhere.txt')), null);
  assert.equal(pmRelpath(p, ''), null);
  assert.equal(pmRelpath(p, 'ghost/../../escape.txt'), null);
});

test('pmRelpath resolves a final file symlink to its real target', (t) => {
  const p = newProj();
  fs.writeFileSync(path.join(p, 'src', 'config.py'), '');
  if (!canSymlink(path.join(p, 'src', 'config.py'), path.join(p, 'docs', 'config.md'))) return t.skip('symlinks unavailable');
  assert.equal(pmRelpath(p, path.join(p, 'docs', 'config.md')), 'src/config.py');
});

test('pmRelpath resolves a directory symlink under docs/ pointing at src/', (t) => {
  const p = newProj();
  if (!canSymlink(path.join(p, 'src'), path.join(p, 'docs', 'impl-link'))) return t.skip('symlinks unavailable');
  assert.equal(pmRelpath(p, path.join(p, 'docs', 'impl-link', 'app.py')), 'src/app.py');
});

test('readJson and readHookInput: parse valid input, fail open on bad input', () => {
  const p = newProj();
  fs.writeFileSync(path.join(p, 'ok.json'), '{"a":1}');
  fs.writeFileSync(path.join(p, 'bad.json'), '{ nope');
  assert.deepEqual(readJson(path.join(p, 'ok.json')), { a: 1 });
  assert.equal(readJson(path.join(p, 'bad.json')), null);
  assert.equal(readJson(path.join(p, 'missing.json')), null);
  const lib = pathToFileURL(path.join(HOOKS_DIR, 'lib.mjs')).href;
  const run = (input) => spawnSync(process.execPath, ['--input-type=module', '-e', `import { readHookInput } from ${JSON.stringify(lib)}; process.stdout.write(JSON.stringify(readHookInput()));`], { input, encoding: 'utf8' });
  assert.equal(run('{"cwd":"/x"}').stdout, '{"cwd":"/x"}');
  assert.equal(run('not json').stdout, 'null');
  assert.equal(run('').stdout, 'null');
  assert.equal(run('5').stdout, 'null');
});

test('pmSecretScan: token formats and assignments', () => {
  assert.equal(pmSecretScan('rotate the API key on the box'), null);
  assert.equal(pmSecretScan('class APIClient: pass'), null);
  assert.equal(pmSecretScan('TOKEN=$GITHUB_TOKEN and api_key = "$FROM_ENV_VAR"'), null);
  assert.equal(pmSecretScan('token = "<rotate-me-later>"'), null);
  assert.equal(pmSecretScan('Password: "use a sentence here"'), null);
  assert.match(pmSecretScan('api_key = "zq9x7c2v8b4n6m1k"'), /credential assignment/);
  assert.match(pmSecretScan('API_KEY = "zq9x7c2v8b4n6m1k"'), /credential assignment/);
  assert.match(pmSecretScan('API_KEY=abcdefghijklmno'), /credential assignment/);
  assert.match(pmSecretScan('Password: hunter2hunter2'), /credential assignment/);
  assert.match(pmSecretScan('key AKIAIOSFODNN7EXAMPLE ok'), /token format/);
  assert.match(pmSecretScan('ghp_abcdefghijklmnopqrstuvwxyz012345'), /token format/);
  assert.match(pmSecretScan('-----BEGIN RSA PRIVATE KEY-----'), /token format/);
  assert.equal(pmSecretScan('Stored the deploy token:\nci-secrets-manager-2026'), null);
});

test('lib.mjs CLI: scan and actor-id', () => {
  const lib = path.join(HOOKS_DIR, 'lib.mjs');
  const bad = spawnSync(process.execPath, [lib, 'scan'], { input: 'diff\n+API_KEY=abcdefghijklmno\n', encoding: 'utf8' });
  assert.equal(bad.status, 1);
  const good = spawnSync(process.execPath, [lib, 'scan'], { input: 'diff\n+class APIClient: pass\n', encoding: 'utf8' });
  assert.equal(good.status, 0);
  const p = newProj();
  const id = spawnSync(process.execPath, [lib, 'actor-id', p], { encoding: 'utf8' });
  assert.equal(id.status, 0);
  assert.equal(id.stdout.trim(), 'casey-example-com-589b8fa8ab93');
});

test('lib.mjs CLI: state prints the derived position and the phase moves with the artifacts', () => {
  const lib = path.join(HOOKS_DIR, 'lib.mjs');
  const none = spawnSync(process.execPath, [lib, 'state', tmpDir('nostate-')], { encoding: 'utf8' });
  assert.equal(none.status, 1);
  const p = newProj(true);
  const state = () => { const r = spawnSync(process.execPath, [lib, 'state', p], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout); };
  let st = state();
  assert.equal(st.phase, 'discovery');
  assert.equal(st.next_reference, 'references/discovery.md');
  assert.equal(st.approval.status, 'approved');
  assert.equal(st.actor, 'casey-example-com-589b8fa8ab93');
  fs.writeFileSync(path.join(p, 'docs', 'spec.md'), '# spec\n');
  fs.rmSync(path.join(p, 'docs', 'approval.json'));
  fs.writeFileSync(path.join(p, 'docs', 'approval.json'), JSON.stringify({ status: 'pending' }));
  fs.writeFileSync(path.join(p, 'docs', 'plan.md'), '# plan\n');
  assert.equal(state().phase, 'planning');
  fs.writeFileSync(path.join(p, 'docs', 'approval.json'), JSON.stringify({ status: 'approved' }));
  assert.equal(state().phase, 'decomposition');
  fs.writeFileSync(path.join(p, 'docs', 'stories', 'S1-1-x.md'), '# S1-1\n');
  st = state();
  assert.equal(st.phase, 'implementation');
  assert.deepEqual(st.unmerged, ['S1-1']);
  fs.writeFileSync(path.join(p, 'docs', 'stories', 'S1-1-x.md'), '# S1-1\n\n## Execution\n<!-- pm-exec: {"owner":"x","status":"merged"} -->\n');
  // A completed sprint with no retro record is owed one at standard scale and above.
  fs.writeFileSync(path.join(p, 'docs', 'plan.md'), '# plan\n\n## Delivery mode\n- Scale: standard\n');
  st = state();
  assert.equal(st.phase, 'retrospective');
  assert.deepEqual(st.sprints_without_retro, [1]);
  fs.mkdirSync(path.join(p, 'docs', 'retros'));
  // A directory where the record should be is no record.
  fs.mkdirSync(path.join(p, 'docs', 'retros', 'sprint-1.md'));
  assert.equal(state().phase, 'retrospective');
  fs.rmdirSync(path.join(p, 'docs', 'retros', 'sprint-1.md'));
  fs.writeFileSync(path.join(p, 'docs', 'retros', 'sprint-1.md'), '# retro\n');
  st = state();
  assert.equal(st.phase, 'done');
  assert.deepEqual(st.unmerged, []);
  assert.equal(typeof st.uncommitted, 'number');
  // tiny and small skip the retrospective.
  fs.rmSync(path.join(p, 'docs', 'retros'), { recursive: true });
  fs.writeFileSync(path.join(p, 'docs', 'plan.md'), '# plan\n\n## Delivery mode\n- Scale: tiny\n');
  assert.equal(state().phase, 'done');
  // A revoked marker, or an approved one whose plan changed, is planning whatever else exists.
  fs.writeFileSync(path.join(p, 'docs', 'approval.json'), JSON.stringify({ status: 'revoked' }));
  assert.equal(state().phase, 'planning');
  const digest = gitIn(p, ['hash-object', 'docs/plan.md']).trim();
  fs.writeFileSync(path.join(p, 'docs', 'approval.json'), JSON.stringify({ status: 'approved', plan_digest: digest }));
  assert.equal(state().phase, 'done');
  fs.writeFileSync(path.join(p, 'docs', 'plan.md'), '# plan v2\n\n## Delivery mode\n- Scale: tiny\n');
  st = state();
  assert.equal(st.phase, 'planning');
  assert.equal(st.approval.plan_changed, true);
});

test('lib.mjs CLI: state takes its explicit root over CLAUDE_PROJECT_DIR; an unreadable story counts as unmerged', (t) => {
  const lib = path.join(HOOKS_DIR, 'lib.mjs');
  const a = newProj(true);
  const b = newProj(true);
  fs.writeFileSync(path.join(b, 'docs', 'plan.md'), '# plan\n');
  const r = spawnSync(process.execPath, [lib, 'state', b], { encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: a } });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).phase, 'decomposition');
  const sub = path.join(b, 'packages', 'foo');
  assert.equal(JSON.parse(spawnSync(process.execPath, [lib, 'state', sub], { encoding: 'utf8' }).stdout).phase, 'decomposition');
  if (process.platform === 'win32') return t.skip('no mkfifo on win32');
  fs.writeFileSync(path.join(b, 'docs', 'stories', 'S1-1-x.md'), '# S1-1\n\n## Execution\n<!-- pm-exec: {"owner":"x","status":"merged"} -->\n');
  const mk = spawnSync('mkfifo', [path.join(b, 'docs', 'stories', 'S1-2-pipe.md')]);
  if (mk.status !== 0) return t.skip('mkfifo unavailable');
  const st = JSON.parse(spawnSync(process.execPath, [lib, 'state', b], { encoding: 'utf8' }).stdout);
  assert.deepEqual(st.unreadable, ['S1-2']);
  assert.deepEqual(st.unmerged, ['S1-2']);
  assert.equal(st.phase, 'implementation');
});

test('pmRelpath resolves a symlink whose relative target traverses another symlink', (t) => {
  const p = newProj();
  fs.mkdirSync(path.join(p, 'pm'), { recursive: true });
  fs.writeFileSync(path.join(p, 'pm', 'log.md'), '');
  if (!canSymlink(path.join(p, 'src'), path.join(p, 'docs', 'impl-link'))) return t.skip('symlinks unavailable');
  fs.symlinkSync('impl-link/../pm/log.md', path.join(p, 'docs', 'alias'));
  // Win32 path normalisation collapses '..' lexically before the filesystem resolves
  // 'impl-link', so the symlink target lands in docs/pm/log.md on Windows and pm/log.md on POSIX.
  const expected = process.platform === 'win32' ? 'docs/pm/log.md' : 'pm/log.md';
  assert.equal(pmRelpath(p, path.join(p, 'docs', 'alias')), expected);
});

test('pmActorId chomps only trailing newlines, matching bash command substitution', () => {
  const p = newProj();
  gitIn(p, ['config', 'user.email', ' casey@example.com ']);
  assert.equal(pmActorId(p), 'casey-example-com-4d8988c65278');
});

test('pmRelpath resolves Windows drive-relative paths against the drive cwd', (t) => {
  if (process.platform !== 'win32') return t.skip('win32 only');
  const p = newProj();
  fs.mkdirSync(path.join(p, 'pm'), { recursive: true });
  fs.writeFileSync(path.join(p, 'pm', 'log.md'), '');
  const cwd = process.cwd();
  process.chdir(p);
  try {
    assert.equal(pmRelpath(p, 'C:pm\\log.md'.replace('C:', p.slice(0, 2))), 'pm/log.md');
  } finally {
    process.chdir(cwd);
  }
});

test('readJson refuses non-regular files (FIFO) and returns promptly', (t) => {
  if (process.platform === 'win32') return t.skip('no mkfifo on win32');
  const p = newProj();
  const fifo = path.join(p, 'pm', 'fifo');
  try {
    execFileSync('mkfifo', [fifo]);
  } catch {
    return t.skip('mkfifo unavailable');
  }
  assert.equal(readJson(fifo), null);
});

test('hookFile returns the write target with its project root, else null', () => {
  const p = newProj();
  delete process.env.CLAUDE_PROJECT_DIR;
  for (const empty of [null, undefined, {}, { tool_input: null }, { tool_input: {} }, { tool_input: { file_path: '' } }, { tool_input: { file_path: 7 } }]) {
    assert.equal(hookFile(empty), null, JSON.stringify(empty));
  }
  const file = path.join(p, 'src', 'app.py');
  assert.deepEqual(hookFile({ cwd: p, tool_input: { file_path: file } }), { file, root: p });
  // A payload with no usable cwd falls back to the process cwd, as each hook used to.
  assert.equal(hookFile({ tool_input: { file_path: file } }).root, pmRoot(process.cwd()));
  assert.equal(hookFile({ cwd: '', tool_input: { file_path: file } }).root, pmRoot(process.cwd()));
});

test('lib.mjs CLI: state counts only deliver worktrees; the rest are host-owned', () => {
  const lib = path.join(HOOKS_DIR, 'lib.mjs');
  const p = newProj(true);
  const state = () => { const r = spawnSync(process.execPath, [lib, 'state', p], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout); };
  assert.equal(state().worktrees, 0);
  assert.equal(state().hostWorktrees, 0);
  // Deliver's own: under <root>/tmp/worktrees/ whatever the branch, or on a pm/* branch anywhere.
  gitIn(p, ['worktree', 'add', '-q', path.join(p, 'tmp', 'worktrees', 'a'), '-b', 'feature-a']);
  gitIn(p, ['worktree', 'add', '-q', path.join(tmpDir('wt-'), 'b'), '-b', 'pm/S1-1-b']);
  // Host-owned: a T3-style worktree elsewhere, and a detached one.
  gitIn(p, ['worktree', 'add', '-q', path.join(tmpDir('wt-'), 'c'), '-b', 't3code/thread-1']);
  gitIn(p, ['worktree', 'add', '-q', '--detach', path.join(tmpDir('wt-'), 'd')]);
  const st = state();
  assert.equal(st.worktrees, 2);
  assert.equal(st.hostWorktrees, 2);
});

test('worktree counting: a symlinked tmp/ still marks tmp/worktrees/ as deliver-owned', (t) => {
  const p = newProj(true);
  if (!canSymlink(tmpDir('tmpreal-'), path.join(p, 'tmp'))) return t.skip('symlinks unavailable');
  gitIn(p, ['worktree', 'add', '-q', path.join(p, 'tmp', 'worktrees', 'a'), '-b', 'feature-a']);
  const st = inspectState(p);
  assert.equal(st.worktrees, 1);
  assert.equal(st.hostWorktrees, 0);
});

test('worktree counting: an unresolved root (darwin /var vs /private/var) still matches', (t) => {
  if (process.platform !== 'darwin') return t.skip('darwin-only path aliasing');
  // Git records realpaths, so the main checkout's base is always canonical. Only a root that is
  // itself a linked worktree, given in its unresolved form, exercises the root's own base.
  const p = newProj(true);
  const parent = tmpDir('wt-');
  const unresolved = path.join(os.tmpdir(), path.basename(parent), 'l');
  if (!unresolved.startsWith('/var/')) return t.skip('os.tmpdir() is already canonical');
  gitIn(p, ['worktree', 'add', '-q', path.join(parent, 'l'), '-b', 'pm/S1-1-l']);
  gitIn(p, ['worktree', 'add', '-q', path.join(parent, 'l', 'tmp', 'worktrees', 'a'), '-b', 'feature-a']);
  const st = inspectState(unresolved);
  assert.equal(st.worktrees, 2);
  assert.equal(st.hostWorktrees, 0);
});

test('resume cleanup drops a stale deliver worktree entry and keeps a stale host-owned one', () => {
  const p = newProj(true);
  const mine = path.join(p, 'tmp', 'worktrees', 'a');
  const host = path.join(tmpDir('wt-'), 'h');
  gitIn(p, ['worktree', 'add', '-q', mine, '-b', 'pm/S1-1-a']);
  gitIn(p, ['worktree', 'add', '-q', host, '-b', 't3code/thread-1']);
  // Both directories vanish; a T3 thread's may be only temporarily missing.
  fs.rmSync(mine, { recursive: true, force: true });
  fs.rmSync(host, { recursive: true, force: true });
  // The recipe resume-procedure.md documents: classify, then remove each stale deliver entry.
  const r = spawnSync(process.execPath, [path.join(HOOKS_DIR, 'lib.mjs'), 'worktrees', p], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const wt = JSON.parse(r.stdout);
  // Git prints forward slashes on Windows; path.resolve normalizes both sides.
  assert.deepEqual(wt.host.map((w) => [path.resolve(w.path), w.prunable]), [[host, true]]);
  for (const w of wt.deliver.filter((x) => x.prunable)) gitIn(p, ['worktree', 'remove', w.path]);
  const listed = gitIn(p, ['worktree', 'list', '--porcelain']).split(/\r?\n/)
    .filter((l) => l.startsWith('worktree ')).map((l) => path.resolve(l.slice('worktree '.length)));
  assert.ok(!listed.includes(mine), 'the stale deliver entry is gone');
  assert.ok(listed.includes(host), 'the stale host-owned entry survives');
  assert.equal(gitIn(p, ['branch', '--list', 'pm/S1-1-a']).trim(), 'pm/S1-1-a');
});

test('worktree counting: a stale non-pm worktree under a symlinked tmp/ stays deliver-owned after tmp/worktrees goes', (t) => {
  const p = newProj(true);
  const real = tmpDir('tmpreal-');
  if (!canSymlink(real, path.join(p, 'tmp'))) return t.skip('symlinks unavailable');
  gitIn(p, ['worktree', 'add', '-q', path.join(p, 'tmp', 'worktrees', 'a'), '-b', 'feature-a']);
  fs.rmSync(path.join(real, 'worktrees'), { recursive: true, force: true });
  const wt = lib.classifyWorktrees(p);
  assert.equal(wt.deliver.length, 1);
  assert.equal(wt.deliver[0].prunable, true);
  assert.equal(wt.host.length, 0);
});

test('parseWorktrees reads CRLF porcelain output', () => {
  const text = 'worktree /r\r\nHEAD 1\r\nbranch refs/heads/main\r\n\r\n'
    + 'worktree /r/tmp/worktrees/a\r\nHEAD 2\r\nbranch refs/heads/pm/S1-1-a\r\nprunable gitdir file points to non-existent location\r\n\r\n'
    + 'worktree /elsewhere/d\r\nHEAD 3\r\ndetached\r\n';
  assert.deepEqual(lib.parseWorktrees(text), [
    { path: '/r', branch: 'refs/heads/main', prunable: false },
    { path: '/r/tmp/worktrees/a', branch: 'refs/heads/pm/S1-1-a', prunable: true },
    { path: '/elsewhere/d', branch: '', prunable: false },
  ]);
  assert.deepEqual(lib.parseWorktrees(''), []);
});

test('lib.mjs CLI: worktrees exits 1 with a reason outside a repository', () => {
  const r = spawnSync(process.execPath, [path.join(HOOKS_DIR, 'lib.mjs'), 'worktrees', tmpDir('norepo-')], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.equal(r.stdout, '');
  assert.match(r.stderr, /git worktree list failed/);
});
