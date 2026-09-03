import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { parseArgs, UsageError } from '../codex/lib/args.mjs';
import { envelope, EXIT, RunnerError } from '../codex/lib/result.mjs';
import { parseStory } from '../codex/lib/story.mjs';
import { snapshotWorktree, changedPaths, gitMetadataFingerprint } from '../codex/lib/snapshot.mjs';
import { runCodex } from '../codex/lib/spawn.mjs';
import { cmdFallbackPrefix } from '../codex/lib/preflight.mjs';
import { PLUGIN_ROOT, tmpDir, gitIn, newBuildProject, makeStub, runRunner, stubArgs, stubActions, minimalPath } from './helpers.mjs';

test('args: defaults per mode and validation', () => {
  const b = parseArgs(['--mode', 'build', '--worktree', '/w', '--story', 'docs/stories/S1-1.md']);
  assert.deepEqual([b.model, b.effort, b.timeoutSeconds], ['gpt-5.6-sol', 'high', 600]);
  const r = parseArgs(['--mode', 'review', '--scope', 'recent', '--out', '/w/untracked']);
  assert.deepEqual([r.model, r.effort], ['gpt-5.6-terra', 'high']);
  const a = parseArgs(['--mode', 'advise', '--prompt-file', '/p.md']);
  assert.deepEqual([a.model, a.effort], ['gpt-5.6-sol', 'medium']);
  const s = parseArgs(['--mode', 'research', '--prompt-file', '/p.md', '--search', 'off']);
  assert.equal(s.search, 'off');
  assert.throws(() => parseArgs(['--mode', 'build', '--worktree', '/w']), UsageError);
  assert.throws(() => parseArgs(['--mode', 'fix', '--worktree', '/w', '--story', 'x.md']), UsageError);
  assert.throws(() => parseArgs(['--mode', 'build', '--worktree', '/w', '--story', 'x.md', '--evidence', 'e.md']), UsageError);
  assert.throws(() => parseArgs(['--mode', 'build', '--worktree', '/w', '--story', 'x.md', '--effort', 'ultra']), UsageError);
  assert.throws(() => parseArgs(['--mode', 'build', '--worktree', '/w', '--story', 'x.md', '--model', 'bad id']), UsageError);
  assert.throws(() => parseArgs(['--mode', 'build', '--worktree', '/w', '--story', 'x.md', '--timeout-seconds', '9999']), UsageError);
  assert.throws(() => parseArgs(['--mode', 'build', '--worktree', '/w', '--story', 'x.md', '--dangerously-bypass-approvals-and-sandbox']), UsageError);
  assert.throws(() => parseArgs(['--mode', 'review', '--scope', 'everything', '--out', '/o']), UsageError);
  assert.throws(() => parseArgs(['--mode', 'review', '--scope', 'recent']), UsageError);
  assert.throws(() => parseArgs(['--mode', 'advise']), UsageError);
  assert.throws(() => parseArgs(['--mode', 'build', '--preflight', '--worktree', '/w', '--story', 'x.md', '--evidence', 'e.md']), UsageError);
  const pf = parseArgs(['--mode', 'build', '--preflight', '--worktree', '/w']);
  assert.equal(pf.preflight, true);
});

test('result: envelope shape mirrors the bash runner', () => {
  const e = envelope('failed', 'boom', { scratch_dir: '/s', codex_version: 'v', codex_exit: 7 });
  assert.deepEqual(e, { runner_status: 'failed', reason: 'boom', scratch_dir: '/s', codex_version: 'v', codex_exit: '7', diagnostics_retained: true });
  const p = envelope('safety-violation', 'x', { scratch_dir: '/s', codex_version: '', codex_exit: 0, actual_files_changed: ['a'] });
  assert.equal(p.diagnostics_retained, true);
  assert.deepEqual(p.actual_files_changed, ['a']);
  assert.equal(envelope('rejected', 'r').diagnostics_retained, false);
  assert.equal(EXIT.SAFETY, 74);
});

test('story: pm-meta parsing and visible-field cross checks', () => {
  const p = newBuildProject(true);
  assert.deepEqual(parseStory(p, 'docs/stories/S1-1-fix.md'), { builder: 'codex-builder', scopes: ['src'] });
  const story = path.join(p, 'docs', 'stories', 'S1-1-fix.md');
  const original = fs.readFileSync(story, 'utf8');
  const expectBlocked = (text, re) => { fs.writeFileSync(story, text); assert.throws(() => parseStory(p, 'docs/stories/S1-1-fix.md'), (e) => e instanceof RunnerError && e.status === 'blocked' && re.test(e.message)); };
  expectBlocked(original.replace('"touches":["src"]', '"touches":[]'), /pm-meta/);
  expectBlocked(original.replace('Builder: codex-builder', 'Builder: expert-builder'), /does not match/);
  expectBlocked(original.replace('Touches: src', 'Touches: lib'), /visible Touches/);
  expectBlocked(original.replace('"touches":["src"]', '"touches":["../x"]'), /traversal|outside/);
  expectBlocked(original.replace('"touches":["src"]', '"touches":["src/*"]'), /globs/);
  // A literal "." touches item matches the traversal-segment regex (`/${item}/` === '/./')
  // before the whole-worktree guard runs — confirmed identical in the bash reference
  // (case "/$item/" in */../*|*/./*) also fires first). The whole-worktree guard is
  // defense-in-depth for symlink aliasing, not reachable via a literal "." here.
  expectBlocked(original.replace('"touches":["src"]', '"touches":["."]').replace('Touches: src', 'Touches: .'), /traversal|whole worktree/);
});

test('result.emit: a synchronous write is not truncated by an immediate process.exit', () => {
  const url = pathToFileURL(path.join(PLUGIN_ROOT, 'scripts', 'codex', 'lib', 'result.mjs')).href;
  const code = `import { emit } from ${JSON.stringify(url)}; emit({ big: 'x'.repeat(200000) }); process.exit(74);`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8', maxBuffer: 1 << 24 });
  assert.equal(JSON.parse(r.stdout).big.length, 200000);
  assert.equal(r.status, 74);
});

test('spawn: a synchronous spawn error still cleans up signal listeners and fds', async () => {
  const dir = tmpDir('nocodex-');
  const before = process.listenerCount('SIGINT');
  await assert.rejects(runCodex(
    { file: path.join(dir, 'missing-codex'), prefix: [], verbatim: false, display: 'x' },
    ['--version'],
    { stdinText: '', cwd: process.cwd(), env: process.env, timeoutSeconds: 5, stdoutPath: path.join(dir, 'out.log'), stderrPath: path.join(dir, 'err.log') },
  ));
  assert.equal(process.listenerCount('SIGINT'), before);
});

test('preflight: cmdFallbackPrefix quotes the cmd.exe shim path and rejects unsafe ones', () => {
  assert.deepEqual(cmdFallbackPrefix('C:\\Users\\Jane Smith\\npm\\codex.cmd'), ['/d', '/s', '/c', '"C:\\Users\\Jane Smith\\npm\\codex.cmd"']);
  assert.equal(cmdFallbackPrefix('C:\\bad"path\\codex.cmd'), null);
});

test('snapshot: detects content, new, deleted, mode, and ignored-protected changes', () => {
  const p = newBuildProject(true);
  const before = snapshotWorktree(p);
  assert.ok(before.has('src/script.sh') && before.has('docs/stories/S1-1-fix.md') && before.has('pm/pm-state.json'));
  assert.equal(before.get('docs/spec.md'), 'missing');
  fs.writeFileSync(path.join(p, 'src', 'fix.txt'), 'new\n');
  fs.appendFileSync(path.join(p, '.gitignore'), 'pm/hidden.md\n');
  fs.writeFileSync(path.join(p, 'pm', 'hidden.md'), 'hidden\n');
  fs.rmSync(path.join(p, 'src', 'script.sh'));
  const after = snapshotWorktree(p);
  assert.deepEqual(changedPaths(before, after), ['.gitignore', 'pm/hidden.md', 'src/fix.txt', 'src/script.sh']);
  const meta1 = gitMetadataFingerprint(p);
  gitIn(p, ['branch', 'other']);
  assert.notEqual(gitMetadataFingerprint(p), meta1);
});

test('snapshot: executable bit is part of the delta on POSIX', (t) => {
  if (process.platform === 'win32') return t.skip('no exec bit on win32');
  const p = newBuildProject(true);
  const before = snapshotWorktree(p);
  fs.chmodSync(path.join(p, 'src', 'script.sh'), 0o755);
  assert.deepEqual(changedPaths(before, snapshotWorktree(p)), ['src/script.sh']);
});

const WIN = process.platform === 'win32';
const has = (arr, v) => arr.includes(v);

test('build 1: missing CLI is a clean unavailable result', () => {
  const p = newBuildProject(true);
  const r = runRunner(['--mode', 'build'], { project: p, env: { PATH: minimalPath(), Path: minimalPath() } });
  assert.equal(r.status, 69);
  assert.equal(r.out.runner_status, 'unavailable');
  assert.match(r.out.reason, /codex CLI not found/);
});

test('build 2: failed auth stops before help or execution', () => {
  const p = newBuildProject(true); const s = makeStub();
  const r = runRunner(['--mode', 'build'], { project: p, stub: s, env: { STUB_LOGIN_EXIT: '1' } });
  assert.equal(r.status, 69);
  assert.match(r.out.reason, /not authenticated/);
  assert.doesNotMatch(stubActions(s), /^exec/m);
});

test('build 3: sign-off false stops before Codex is invoked', () => {
  const p = newBuildProject(false); const s = makeStub();
  const r = runRunner(['--mode', 'build'], { project: p, stub: s });
  assert.equal(r.status, 66);
  assert.match(r.out.reason, /not signed off/);
  assert.equal(stubActions(s), '');
});

test('build 4: non-zero codex exit preserves diagnostics and the exact exit', () => {
  const p = newBuildProject(true); const s = makeStub();
  const r = runRunner(['--mode', 'build'], { project: p, stub: s, env: { STUB_EXEC_EXIT: '7' } });
  assert.equal(r.status, 70);
  assert.equal(r.out.runner_status, 'failed');
  assert.equal(r.out.codex_exit, '7');
  assert.ok(r.out.scratch_dir.length > 0);
});

test('build 5: structured success uses the fixed safe invocation', () => {
  const p = newBuildProject(true); const s = makeStub();
  const r = runRunner(['--mode', 'build'], { project: p, stub: s, env: { STUB_WRITE_PATH: 'src/fix.txt' } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const a = stubArgs(s);
  const common = ['--ignore-user-config', '--ignore-rules', '--strict-config', '--sandbox', '--ephemeral', '--color', 'never', '-C', p, 'gpt-5.6-sol', 'model_reasoning_effort=high', 'agents.enabled=false', 'web_search="disabled"', 'mcp_servers={}', 'features.hooks=false', '--output-schema', '-o', '-'];
  for (const x of common) assert.ok(has(a, x), `missing ${x}`);
  if (WIN) {
    assert.ok(has(a, 'danger-full-access'));
    assert.equal(r.out.sandbox, 'none (win32)');
  } else {
    for (const x of ['workspace-write', 'sandbox_workspace_write.network_access=false', 'sandbox_workspace_write.exclude_slash_tmp=true', 'sandbox_workspace_write.exclude_tmpdir_env_var=true', 'shell_environment_policy.inherit="core"', 'shell_environment_policy.ignore_default_excludes=false', 'shell_environment_policy.experimental_use_profile=false', 'allow_login_shell=false']) assert.ok(has(a, x), `missing ${x}`);
    assert.equal(r.out.sandbox, 'workspace-write');
  }
  for (const x of ['--dangerously-bypass-approvals-and-sandbox', '--full-auto', '--yolo', '--add-dir']) assert.ok(!has(a, x));
  assert.ok(a.some((x) => x.startsWith('shell_environment_policy.set.TMPDIR="') && /tmp[\\/]+codex-runtime[\\/]+/.test(x)));
  assert.equal(r.out.runner_status, 'completed');
  assert.equal(r.out.result.status, 'done');
  assert.deepEqual(r.out.actual_files_changed, ['src/fix.txt']);
  assert.equal(r.out.diagnostics_retained, false);
  assert.match(r.out.git_status_short, /src\/fix\.txt/);
  assert.match(fs.readFileSync(s.promptFile, 'utf8'), /Do not run git commands that mutate/);
  assert.match(fs.readFileSync(s.promptFile, 'utf8'), /read AGENTS\.md, and CLAUDE\.md when it is more than a pointer/);
  assert.equal(fs.readdirSync(s.tmp).length, 0);
  assert.ok(!fs.existsSync(path.join(p, 'tmp', 'codex-runtime')) || fs.readdirSync(path.join(p, 'tmp', 'codex-runtime')).length === 0);
});

test('build 6: fix mode passes the evidence brief', () => {
  const p = newBuildProject(true); const s = makeStub();
  const r = runRunner(['--mode', 'fix', '--evidence', 'tmp/codex-builder/S1-1-round-1.md'], { project: p, stub: s, env: { STUB_WRITE_PATH: 'src/fix.txt' } });
  assert.equal(r.status, 0);
  assert.equal(r.out.mode, 'fix');
  assert.match(fs.readFileSync(s.promptFile, 'utf8'), /Fix evidence: tmp\/codex-builder\/S1-1-round-1\.md/);
});

test('build 7: an unsafe flag is rejected before anything runs', () => {
  const p = newBuildProject(true); const s = makeStub();
  const r = runRunner(['--mode', 'build', '--dangerously-bypass-approvals-and-sandbox'], { project: p, stub: s });
  assert.equal(r.status, 64);
  assert.equal(stubActions(s), '');
});

test('build 8: absolute roots are mandatory and story symlinks cannot escape', (t) => {
  const p = newBuildProject(true); const s = makeStub();
  const rel = runRunner(['--mode', 'build', '--worktree', path.basename(p), '--story', 'docs/stories/S1-1-fix.md'], { stub: s, cwd: path.dirname(p) });
  assert.equal(rel.status, 65);
  const outside = tmpDir('outside-');
  fs.writeFileSync(path.join(outside, 'story.md'), '# outside\n');
  try { fs.symlinkSync(path.join(outside, 'story.md'), path.join(p, 'docs', 'stories', 'escape.md'), 'file'); } catch { return t.skip('symlinks unavailable'); }
  const esc = runRunner(['--mode', 'build', '--worktree', p, '--story', 'docs/stories/escape.md'], { stub: s });
  assert.equal(esc.status, 65);
  assert.equal(stubActions(s), '');
});

test('build 9: invalid structured output fails closed', () => {
  const p = newBuildProject(true); const s = makeStub();
  const r = runRunner(['--mode', 'build'], { project: p, stub: s, env: { STUB_BAD_RESULT: '1' } });
  assert.equal(r.status, 70);
  assert.match(r.out.reason, /result contract/);
});

test('build 10 and 18: git metadata mutation is a safety violation', () => {
  for (const env of [{ STUB_STAGE_GIT: '1' }, { STUB_CREATE_REF: '1' }]) {
    const p = newBuildProject(true); const s = makeStub();
    const r = runRunner(['--mode', 'build'], { project: p, stub: s, env });
    assert.equal(r.status, 74);
    assert.equal(r.out.runner_status, 'safety-violation');
    assert.match(r.out.reason, /protected git state/);
  }
});

test('build 11: missing and symlinked PM state fail closed', (t) => {
  const p = newBuildProject(true); const s = makeStub();
  fs.rmSync(path.join(p, 'pm', 'pm-state.json'));
  const r1 = runRunner(['--mode', 'build'], { project: p, stub: s });
  assert.equal(r1.status, 66); assert.match(r1.out.reason, /missing/);
  const outside = tmpDir('state-');
  fs.writeFileSync(path.join(outside, 'state.json'), '{"signed_off":true}\n');
  try { fs.symlinkSync(path.join(outside, 'state.json'), path.join(p, 'pm', 'pm-state.json'), 'file'); } catch { return t.skip('symlinks unavailable'); }
  const r2 = runRunner(['--mode', 'build'], { project: p, stub: s });
  assert.equal(r2.status, 66); assert.match(r2.out.reason, /symlink/);
  assert.equal(stubActions(s), '');
});

test('build 12, 14, 22: protected artifact, outside-touches, and ignored-protected edits are violations', () => {
  const cases = [
    [{ STUB_WRITE_PATH: 'pm/pm-state.json', STUB_REPORT_PATH: 'pm/pm-state.json' }, /protected PM artifact/, 'pm/pm-state.json'],
    [{ STUB_WRITE_PATH: 'README.md', STUB_REPORT_PATH: 'README.md' }, /outside the story/, 'README.md'],
    [{ STUB_WRITE_PATH: 'pm/hidden.md', STUB_REPORT_PATH: 'pm/hidden.md' }, /protected PM artifact/, 'pm/hidden.md'],
  ];
  for (const [env, re, changed] of cases) {
    const p = newBuildProject(true); const s = makeStub();
    if (changed === 'pm/hidden.md') fs.appendFileSync(path.join(p, '.gitignore'), 'pm/hidden.md\n');
    const r = runRunner(['--mode', 'build'], { project: p, stub: s, env });
    assert.equal(r.status, 74, JSON.stringify(r.out));
    assert.match(r.out.reason, re);
    assert.ok(r.out.actual_files_changed.includes(changed));
  }
});

test('build 13: an omitted files_changed entry cannot conceal an edit', () => {
  const p = newBuildProject(true); const s = makeStub();
  const r = runRunner(['--mode', 'build'], { project: p, stub: s, env: { STUB_WRITE_PATH: 'src/fix.txt', STUB_OMIT_REPORT: '1' } });
  assert.equal(r.status, 74);
  assert.match(r.out.reason, /authoritative/);
  assert.deepEqual(r.out.actual_files_changed, ['src/fix.txt']);
});

test('build 15: hostile project config is overridden', () => {
  const p = newBuildProject(true); const s = makeStub();
  fs.mkdirSync(path.join(p, '.codex'));
  fs.writeFileSync(path.join(p, '.codex', 'config.toml'), 'web_search = "live"\n[mcp_servers.hostile]\ncommand = "false"\n[features]\nhooks = true\n[sandbox_workspace_write]\nnetwork_access = true\n');
  const r = runRunner(['--mode', 'build'], { project: p, stub: s, env: { STUB_WRITE_PATH: 'src/fix.txt' } });
  assert.equal(r.status, 0);
  const a = stubArgs(s);
  for (const x of ['--ignore-user-config', '--ignore-rules', '--strict-config', 'web_search="disabled"', 'mcp_servers={}', 'features.hooks=false']) assert.ok(has(a, x), x);
  if (!WIN) assert.ok(has(a, 'sandbox_workspace_write.network_access=false'));
});

test('build 16: a structured blocked result with no edits completes', () => {
  const p = newBuildProject(true); const s = makeStub();
  const r = runRunner(['--mode', 'build'], { project: p, stub: s, env: { STUB_BLOCKED_RESULT: '1' } });
  assert.equal(r.status, 0);
  assert.equal(r.out.result.status, 'blocked');
  assert.deepEqual(r.out.actual_files_changed, []);
});

test('build 17: timeout kills the process tree and preserves diagnostics', () => {
  const p = newBuildProject(true); const s = makeStub();
  const r = runRunner(['--mode', 'build', '--timeout-seconds', '1'], { project: p, stub: s, env: { STUB_SLEEP: '1' } });
  assert.equal(r.status, 124, JSON.stringify(r.out));
  assert.equal(r.out.runner_status, 'timed-out');
  assert.equal(r.out.diagnostics_retained, true);
  const pid = Number(fs.readFileSync(s.childPid, 'utf8').trim());
  let alive = true;
  try { process.kill(pid, 0); } catch { alive = false; }
  assert.equal(alive, false, 'sleeping grandchild must be dead');
});

test('build 19: a dirty baseline is isolated from this run', () => {
  const p = newBuildProject(true); const s = makeStub();
  fs.writeFileSync(path.join(p, 'src', 'preexisting.txt'), 'user-owned dirty file\n');
  const r = runRunner(['--mode', 'build'], { project: p, stub: s, env: { STUB_WRITE_PATH: 'src/fix.txt' } });
  assert.equal(r.status, 0);
  assert.deepEqual(r.out.actual_files_changed, ['src/fix.txt']);
  assert.match(r.out.git_status_short, /src\/preexisting\.txt/);
});

test('build 20, 24, 25: invalid effort, empty touches, and drifted fields fail before quota use', () => {
  const p = newBuildProject(true); const s = makeStub();
  assert.equal(runRunner(['--mode', 'build', '--effort', 'ultra'], { project: p, stub: s }).status, 64);
  const story = path.join(p, 'docs', 'stories', 'S1-1-fix.md');
  const original = fs.readFileSync(story, 'utf8');
  for (const [text, re] of [[original.replace('"touches":["src"]', '"touches":[]'), /pm-meta/], [original.replace('Builder: codex-builder', 'Builder: expert-builder'), /does not match/], [original.replace('Touches: src', 'Touches: lib'), /visible Touches/]]) {
    fs.writeFileSync(story, text);
    const r = runRunner(['--mode', 'build'], { project: p, stub: s });
    assert.equal(r.status, 66); assert.match(r.out.reason, re);
    assert.doesNotMatch(stubActions(s), /^exec --ignore-user-config/m);
  }
});

test('build 21: executable-bit changes are part of the delta (POSIX)', (t) => {
  if (WIN) return t.skip('no exec bit on win32');
  const p = newBuildProject(true); const s = makeStub();
  const r = runRunner(['--mode', 'build'], { project: p, stub: s, env: { STUB_CHMOD_PATH: 'src/script.sh' } });
  assert.equal(r.status, 0);
  assert.deepEqual(r.out.actual_files_changed, ['src/script.sh']);
});

test('build 23: preflight checks readiness without a model task', () => {
  const p = newBuildProject(true); const s = makeStub();
  const r = runRunner(['--mode', 'build', '--preflight'], { project: p, stub: s });
  assert.equal(r.status, 0);
  assert.equal(r.out.runner_status, 'ready');
  assert.equal(r.out.preflight, true);
  assert.equal(r.out.story_scope_checked, true);
  assert.deepEqual(r.out.allowed_paths, ['src']);
  assert.equal(r.out.quota_consumed, false);
  assert.equal(r.out.policy.host_tmp_writable, WIN);
  assert.doesNotMatch(stubActions(s), /^exec --ignore-user-config/m);
  assert.ok(!fs.existsSync(path.join(p, 'tmp', 'codex-runtime')));
});

test('build 26: duplicate reported paths are rejected', () => {
  const p = newBuildProject(true); const s = makeStub();
  const r = runRunner(['--mode', 'build'], { project: p, stub: s, env: { STUB_WRITE_PATH: 'src/fix.txt', STUB_DUPLICATE_REPORT: '1' } });
  assert.equal(r.status, 70);
  assert.match(r.out.reason, /result contract/);
});

test('build: untracked story and unignored tmp/ are blocked', () => {
  const p = newBuildProject(true); const s = makeStub();
  fs.writeFileSync(path.join(p, 'docs', 'stories', 'S1-2-new.md'), fs.readFileSync(path.join(p, 'docs', 'stories', 'S1-1-fix.md')));
  const r1 = runRunner(['--mode', 'build', '--worktree', p, '--story', 'docs/stories/S1-2-new.md'], { stub: s });
  assert.equal(r1.status, 66); assert.match(r1.out.reason, /tracked/);
  fs.writeFileSync(path.join(p, '.gitignore'), '');
  const r2 = runRunner(['--mode', 'build'], { project: p, stub: s });
  assert.equal(r2.status, 66); assert.match(r2.out.reason, /tmp\/ must be ignored/);
});
