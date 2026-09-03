import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { parseArgs, UsageError } from '../codex/lib/args.mjs';
import { lockedExecArgs } from '../codex/lib/argv.mjs';
import { envelope, EXIT, RunnerError } from '../codex/lib/result.mjs';
import { parseStory } from '../codex/lib/story.mjs';
import { snapshotWorktree, changedPaths, gitMetadataFingerprint } from '../codex/lib/snapshot.mjs';
import { runCodex } from '../codex/lib/spawn.mjs';
import { cmdFallbackPrefix, CMD_FALLBACK_SUFFIX, requireCodex, BUILD_FLAGS, READONLY_FLAGS, REVIEW_FLAGS } from '../codex/lib/preflight.mjs';
import { PLUGIN_ROOT, tmpDir, gitIn, canSymlink, newBuildProject, makeStub, runRunner, stubArgs, stubActions, minimalPath, STORY_V2, STORY_LEGACY } from './helpers.mjs';

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
  // "under 500" is exclusive, and tab/LF/CR are rejected with the other control characters.
  assert.throws(() => parseArgs(['--mode', 'review', '--scope', 'recent', '--out', '/o', '--objective', 'x'.repeat(500)]), UsageError);
  assert.equal(parseArgs(['--mode', 'review', '--scope', 'recent', '--out', '/o', '--objective', 'x'.repeat(499)]).objective.length, 499);
  for (const ch of ['\t', '\n', '\r']) {
    assert.throws(() => parseArgs(['--mode', 'review', '--scope', 'recent', '--out', '/o', '--objective', `a${ch}b`]), UsageError);
  }
  assert.throws(() => parseArgs(['--mode', 'build', '--preflight', '--worktree', '/w', '--story', 'x.md', '--evidence', 'e.md']), UsageError);
  const pf = parseArgs(['--mode', 'build', '--preflight', '--worktree', '/w']);
  assert.equal(pf.preflight, true);
});

test('argv: lockedExecArgs is the one shared flag set every mode passes', () => {
  const o = { model: 'gpt-5.6-terra', effort: 'high' };
  const a = lockedExecArgs(o);
  for (const x of ['--ignore-user-config', '--ignore-rules', '--strict-config', '--ephemeral',
    'gpt-5.6-terra', 'model_reasoning_effort=high', 'mcp_servers={}', 'features.hooks=false',
    'agents.enabled=false', 'web_search="disabled"']) assert.ok(a.includes(x), x);
  // `codex exec review` rejects these, so no mode may inherit them from the shared set.
  for (const x of ['--sandbox', '-C', '--color', '--skip-git-repo-check', '-o', '--output-schema']) {
    assert.ok(!a.includes(x), `shared args must not carry ${x}`);
  }
  const withSearch = lockedExecArgs(o, { search: true });
  assert.ok(withSearch.includes('--search'));
  assert.ok(!withSearch.includes('web_search="disabled"'));
});

test('args: a usage error from the real runner prints usage on stderr with exit 64', () => {
  const r = runRunner([], {});
  assert.equal(r.status, 64);
  assert.match(r.stderr, /usage: run\.mjs/);
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

test('story: pm-meta is authoritative; legacy visible fields are optional but must agree', () => {
  const p = newBuildProject(true);
  const rel = 'docs/stories/S1-1-fix.md';
  const story = path.join(p, rel);
  assert.deepEqual(parseStory(p, rel), { builder: 'codex-builder', scopes: ['src'] });
  const expectBlocked = (text, re) => { fs.writeFileSync(story, text); assert.throws(() => parseStory(p, rel), (e) => e instanceof RunnerError && e.status === 'blocked' && re.test(e.message)); };
  expectBlocked(STORY_V2.replace('"touches":["src"]', '"touches":[]'), /pm-meta/);
  expectBlocked(STORY_V2.replace('"touches":["src"]', '"touches":["../x"]'), /traversal|outside/);
  expectBlocked(STORY_V2.replace('"touches":["src"]', '"touches":["src/*"]'), /globs/);
  expectBlocked(STORY_V2.replace('"touches":["src"]', '"touches":["."]'), /traversal|whole worktree/);
  fs.writeFileSync(story, STORY_LEGACY);
  assert.deepEqual(parseStory(p, rel), { builder: 'codex-builder', scopes: ['src'] });
  expectBlocked(STORY_LEGACY.replace('Builder: codex-builder', 'Builder: expert-builder'), /does not match/);
  expectBlocked(STORY_LEGACY.replace('Touches: src', 'Touches: lib'), /visible Touches/);
  expectBlocked(STORY_LEGACY.replace('Touches: src', 'Touches: '), /visible Touches/);
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

test('preflight: cmdFallbackPrefix double-quotes the cmd.exe shim path and rejects unsafe ones', () => {
  // `cmd.exe /s /c` strips the first and last character of the command string when both
  // are quotes and runs the rest verbatim. Without the extra enclosing pair the path's
  // own quotes are the ones consumed and a path with spaces splits into two arguments,
  // so the prefix opens an outer quote and CMD_FALLBACK_SUFFIX closes it after the args.
  assert.deepEqual(cmdFallbackPrefix('C:\\Users\\Jane Smith\\npm\\codex.cmd'), ['/d', '/s', '/c', '""C:\\Users\\Jane Smith\\npm\\codex.cmd"']);
  assert.equal(CMD_FALLBACK_SUFFIX, '"');
  assert.equal(cmdFallbackPrefix('C:\\bad"path\\codex.cmd'), null);
});

test('preflight: requireCodex appends the builder hint only where the caller asks for it', () => {
  const saved = process.env.PATH;
  process.env.PATH = tmpDir('nocodex-');
  try {
    const messages = [];
    for (const opts of [{ hint: ' or use expert-builder' }, {}]) {
      assert.throws(() => requireCodex(BUILD_FLAGS, opts), (e) => {
        assert.equal(e.status, 'unavailable');
        messages.push(e.message);
        return true;
      });
    }
    assert.deepEqual(messages, [
      'codex CLI not found; install @openai/codex or use expert-builder',
      'codex CLI not found; install @openai/codex',
    ]);
  } finally { process.env.PATH = saved; }
});

test('preflight: the review flag list covers every flag the runner passes to exec review', () => {
  for (const f of ['--commit', '--uncommitted', '--ignore-rules', '--ephemeral', '--strict-config', '--ignore-user-config']) {
    assert.ok(REVIEW_FLAGS.includes(f), f);
  }
  assert.ok(READONLY_FLAGS.includes('--ignore-rules'));
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

test('snapshot: ignored files are fingerprinted cheaply and the runtime dir is skipped', () => {
  const p = newBuildProject(true);
  fs.appendFileSync(path.join(p, '.gitignore'), '.env\n');
  fs.writeFileSync(path.join(p, '.env'), 'SECRET=1\n');
  fs.mkdirSync(path.join(p, 'tmp', 'codex-runtime', 'run1'), { recursive: true });
  fs.writeFileSync(path.join(p, 'tmp', 'codex-runtime', 'run1', 'noise.txt'), 'churn\n');
  const before = snapshotWorktree(p);
  assert.match(before.get('.env'), /^ignored:9:/);
  assert.ok(!before.has('tmp/codex-runtime/run1/noise.txt'), 'the runner\'s own TMPDIR must stay out of the delta');
  assert.ok(before.has('tmp/codex-builder/S1-1-round-1.md'), 'other ignored files are tracked by the snapshot');
  fs.writeFileSync(path.join(p, '.env'), 'SECRET=exfiltrated\n');
  fs.writeFileSync(path.join(p, 'tmp', 'codex-runtime', 'run1', 'noise.txt'), 'more churn\n');
  assert.deepEqual(changedPaths(before, snapshotWorktree(p)), ['.env']);
});

test('snapshot: index flags, git hooks, and info/exclude are protected git state', () => {
  const p = newBuildProject(true);
  const base = gitMetadataFingerprint(p);
  gitIn(p, ['update-index', '--skip-worktree', 'src/script.sh']);
  assert.notEqual(gitMetadataFingerprint(p), base, 'skip-worktree must move the fingerprint');
  gitIn(p, ['update-index', '--no-skip-worktree', 'src/script.sh']);
  assert.equal(gitMetadataFingerprint(p), base);
  fs.writeFileSync(path.join(p, '.git', 'hooks', 'pre-commit'), '#!/bin/sh\nexit 0\n');
  const withHook = gitMetadataFingerprint(p);
  assert.notEqual(withHook, base, 'an installed git hook must move the fingerprint');
  fs.mkdirSync(path.join(p, '.git', 'info'), { recursive: true });
  fs.writeFileSync(path.join(p, '.git', 'info', 'exclude'), 'secrets/\n');
  assert.notEqual(gitMetadataFingerprint(p), withHook, 'info/exclude must move the fingerprint');
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

test('build: a missing git binary fails closed before the toplevel check', () => {
  const p = newBuildProject(true);
  const only = path.dirname(process.execPath);
  const r = runRunner(['--mode', 'build'], { project: p, env: { PATH: only, Path: only } });
  assert.equal(r.status, 69);
  assert.match(r.out.reason, /git is required/);
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
  assert.ok(fs.existsSync(r.out.scratch_dir));
});

test('build 5: structured success uses the fixed safe invocation', () => {
  const p = newBuildProject(true); const s = makeStub();
  const r = runRunner(['--mode', 'build'], { project: p, stub: s, env: { STUB_WRITE_PATH: 'src/fix.txt' } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const a = stubArgs(s);
  const common = ['--ignore-user-config', '--ignore-rules', '--strict-config', '--sandbox', '--ephemeral', '--color', 'never', '-C', p, 'gpt-5.6-sol', 'model_reasoning_effort=high', 'allow_login_shell=false', 'agents.enabled=false', 'web_search="disabled"', 'mcp_servers={}', 'features.hooks=false', '--output-schema', '-o', '-'];
  for (const x of common) assert.ok(has(a, x), `missing ${x}`);
  if (WIN) {
    assert.ok(has(a, 'danger-full-access'));
    assert.equal(r.out.sandbox, 'none (win32)');
  } else {
    for (const x of ['workspace-write', 'sandbox_workspace_write.network_access=false', 'sandbox_workspace_write.exclude_slash_tmp=true', 'sandbox_workspace_write.exclude_tmpdir_env_var=true', 'shell_environment_policy.inherit="core"', 'shell_environment_policy.ignore_default_excludes=false', 'shell_environment_policy.experimental_use_profile=false']) assert.ok(has(a, x), `missing ${x}`);
    assert.equal(r.out.sandbox, 'workspace-write');
  }
  for (const x of ['--dangerously-bypass-approvals-and-sandbox', '--full-auto', '--yolo', '--add-dir']) assert.ok(!has(a, x));
  assert.ok(a.some((x) => x.startsWith('shell_environment_policy.set.TMPDIR="') && /tmp[\\/]+codex-runtime[\\/]+/.test(x)));
  a.forEach((x, i) => { if (x === '-c') assert.match(a[i + 1], /=/, `-c at ${i} not followed by a key=value pair`); });
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
  // 3 s, not 2: a loaded Windows runner needs room to start node, load the stub, spawn
  // the grandchild, and write the pid file before the timeout fires.
  const r = runRunner(['--mode', 'build', '--timeout-seconds', '3'], { project: p, stub: s, env: { STUB_SLEEP: '1' } });
  assert.equal(r.status, 124, JSON.stringify(r.out));
  assert.equal(r.out.runner_status, 'timed-out');
  assert.equal(r.out.diagnostics_retained, true);
  // The timeout contract above holds either way; the liveness assertion needs the pid
  // file, which a slow host may not have produced before the deadline.
  if (!fs.existsSync(s.childPid)) return;
  const pid = Number(fs.readFileSync(s.childPid, 'utf8').trim());
  if (!Number.isInteger(pid) || pid <= 0) return;
  let alive = true;
  try { process.kill(pid, 0); } catch { alive = false; }
  assert.equal(alive, false, 'sleeping grandchild must be dead');
});

test('build 27: a backgrounded descendant cannot outlive a clean Codex exit', async (t) => {
  const p = newBuildProject(true); const s = makeStub();
  const r = runRunner(['--mode', 'build'], { project: p, stub: s, env: { STUB_ORPHAN: '1' } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.out.runner_status, 'completed');
  if (WIN) return t.skip('process.kill(pid, 0) cannot reliably probe a reaped win32 pid');
  const pid = Number(fs.readFileSync(s.childPid, 'utf8').trim());
  let alive = true;
  for (let i = 0; i < 60 && alive; i += 1) {
    try { process.kill(pid, 0); } catch { alive = false; break; }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal(alive, false, 'a descendant left running by Codex must be reaped before the runner exits');
});

test('build 28: an ignored file outside the story scope is reported, not enforced', () => {
  const p = newBuildProject(true); const s = makeStub();
  fs.appendFileSync(path.join(p, '.gitignore'), '.env\n');
  fs.writeFileSync(path.join(p, '.env'), 'SECRET=1\n');
  const r = runRunner(['--mode', 'build'], { project: p, stub: s, env: { STUB_WRITE_PATH: '.env', STUB_OMIT_REPORT: '1' } });
  assert.equal(r.status, 0, JSON.stringify(r.out));
  assert.equal(r.out.runner_status, 'completed');
  assert.deepEqual(r.out.ignored_files_changed, ['.env']);
  assert.deepEqual(r.out.actual_files_changed, []);
});

test('build 28b: an ignored file that is also a protected PM artifact is still a violation', () => {
  const p = newBuildProject(true); const s = makeStub();
  fs.appendFileSync(path.join(p, '.gitignore'), 'pm/hidden.md\n');
  const r = runRunner(['--mode', 'build'], { project: p, stub: s, env: { STUB_WRITE_PATH: 'pm/hidden.md', STUB_OMIT_REPORT: '1' } });
  assert.equal(r.status, 74, JSON.stringify(r.out));
  assert.match(r.out.reason, /protected PM artifact: pm\/hidden\.md/);
  // Every envelope carrying actual_files_changed carries the ignored list beside it.
  assert.ok(Array.isArray(r.out.ignored_files_changed), JSON.stringify(r.out));
});

test('build 28c: an ignored file inside the story scope is reported and does not fail the run', () => {
  const p = newBuildProject(true); const s = makeStub();
  fs.appendFileSync(path.join(p, '.gitignore'), 'src/cache.bin\n');
  fs.writeFileSync(path.join(p, 'src', 'cache.bin'), 'stale\n');
  const r = runRunner(['--mode', 'build'], { project: p, stub: s, env: { STUB_WRITE_PATH: 'src/cache.bin', STUB_OMIT_REPORT: '1' } });
  assert.equal(r.status, 0, JSON.stringify(r.out));
  assert.deepEqual(r.out.ignored_files_changed, ['src/cache.bin']);
  assert.deepEqual(r.out.actual_files_changed, []);
});

test('build 28d: an ignored file Codex honestly reports in files_changed still matches the delta', () => {
  const p = newBuildProject(true); const s = makeStub();
  fs.appendFileSync(path.join(p, '.gitignore'), '.env\n');
  fs.writeFileSync(path.join(p, '.env'), 'SECRET=1\n');
  const r = runRunner(['--mode', 'build'], { project: p, stub: s, env: { STUB_WRITE_PATH: '.env', STUB_REPORT_PATH: '.env' } });
  assert.equal(r.status, 0, JSON.stringify(r.out));
  assert.deepEqual(r.out.ignored_files_changed, ['.env']);
  assert.deepEqual(r.out.actual_files_changed, []);
});

test('build 29: a skip-worktree index flag is a protected-git-state violation', () => {
  const p = newBuildProject(true); const s = makeStub();
  const r = runRunner(['--mode', 'build'], { project: p, stub: s, env: { STUB_SKIP_WORKTREE: '1' } });
  assert.equal(r.status, 74, JSON.stringify(r.out));
  assert.match(r.out.reason, /protected git state/);
});

test('build 30: a symlinked tmp/codex-runtime is blocked before Codex runs', (t) => {
  const p = newBuildProject(true); const s = makeStub();
  const outside = tmpDir('runtime-escape-');
  fs.mkdirSync(path.join(p, 'tmp'), { recursive: true });
  if (!canSymlink(outside, path.join(p, 'tmp', 'codex-runtime'))) return t.skip('symlinks unavailable');
  const r = runRunner(['--mode', 'build'], { project: p, stub: s, env: { STUB_WRITE_PATH: 'src/fix.txt' } });
  assert.equal(r.status, 66, JSON.stringify(r.out));
  assert.match(r.out.reason, /tmp\/codex-runtime must be a real directory/);
  assert.doesNotMatch(stubActions(s), /^exec --ignore-user-config/m);
  assert.equal(fs.readdirSync(outside).length, 0);
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
  for (const [text, re] of [[STORY_LEGACY.replace('"touches":["src"]', '"touches":[]'), /pm-meta/], [STORY_LEGACY.replace('Builder: codex-builder', 'Builder: expert-builder'), /does not match/], [STORY_LEGACY.replace('Touches: src', 'Touches: lib'), /visible Touches/]]) {
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
  assert.equal(r.out.policy.login_shell, false);
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

test('review: recent scope with an objective goes through exec review with prompt-as-scope', () => {
  const p = newBuildProject(true); const s = makeStub();
  const out = path.join(p, 'untracked');
  const gitignoreBefore = fs.readFileSync(path.join(p, '.gitignore'), 'utf8');
  const r = runRunner(['--mode', 'review', '--scope', 'recent', '--objective', 'security', '--out', out], { stub: s, cwd: p });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const a = stubArgs(s);
  assert.equal(a[0], 'review');
  for (const x of ['--sandbox', '-C', '--cd', '--color', '--commit']) assert.ok(!has(a, x), `must not pass ${x}`);
  for (const x of ['--ignore-user-config', '--ignore-rules', '--strict-config', '--ephemeral', 'gpt-5.6-terra', 'model_reasoning_effort=high', '-o']) assert.ok(has(a, x), x);
  // A trusted repository's .codex/config.toml must not be able to start MCP processes,
  // hooks, or agents, or turn web search back on, in a read-only mode.
  for (const x of ['mcp_servers={}', 'features.hooks=false', 'agents.enabled=false', 'web_search="disabled"']) assert.ok(has(a, x), x);
  assert.match(fs.readFileSync(s.promptFile, 'utf8'), /last commit \(HEAD\).*security/s);
  assert.ok(fs.existsSync(r.out.report_path));
  assert.match(path.basename(r.out.report_path), /^\d{8}-\d{6}-codex-review-recent-security\.md$/);
  assert.equal(r.out.gitignore_rule_needed, '/untracked/');
  assert.equal(fs.readFileSync(path.join(p, '.gitignore'), 'utf8'), gitignoreBefore);
});

test('review: clean worktree is nothing-to-review; recent without objective uses --commit HEAD', () => {
  const p = newBuildProject(true); const s = makeStub();
  const out = path.join(p, 'codex');
  const clean = runRunner(['--mode', 'review', '--scope', 'worktree', '--out', out], { stub: s, cwd: p });
  assert.equal(clean.status, 0);
  assert.equal(clean.out.runner_status, 'nothing-to-review');
  assert.doesNotMatch(stubActions(s), /^exec review (?!--help)/m);
  const r = runRunner(['--mode', 'review', '--scope', 'recent', '--out', out], { stub: s, cwd: p });
  assert.equal(r.status, 0);
  const a = stubArgs(s);
  assert.ok(has(a, '--commit') && has(a, 'HEAD'));
});

test('review: worktree scope uses --uncommitted; codebase uses exec read-only', () => {
  const p = newBuildProject(true); const s = makeStub();
  fs.writeFileSync(path.join(p, 'src', 'dirty.txt'), 'x');
  const out = path.join(p, 'untracked');
  assert.equal(runRunner(['--mode', 'review', '--scope', 'worktree', '--out', out], { stub: s, cwd: p }).status, 0);
  assert.ok(has(stubArgs(s), '--uncommitted'));
  const cb = runRunner(['--mode', 'review', '--scope', 'codebase', '--objective', 'find dead code', '--out', out], { stub: s, cwd: p });
  assert.equal(cb.status, 0);
  const a = stubArgs(s);
  assert.notEqual(a[0], 'review');
  assert.ok(has(a, '--sandbox') && has(a, 'read-only'));
  assert.match(fs.readFileSync(s.promptFile, 'utf8'), /Focus exclusively on this objective: find dead code\./);
  assert.match(path.basename(cb.out.report_path), /codebase-find-dead-code\.md$/);
});

test('review: out dir must be untracked/ or codex/ with no tracked files; failures keep stderr', () => {
  const p = newBuildProject(true); const s = makeStub();
  const bad = runRunner(['--mode', 'review', '--scope', 'recent', '--out', path.join(p, 'reports')], { stub: s, cwd: p });
  assert.equal(bad.status, 65);
  fs.mkdirSync(path.join(p, 'codex')); fs.writeFileSync(path.join(p, 'codex', 'keep.md'), 'x');
  gitIn(p, ['add', 'codex/keep.md']); gitIn(p, ['commit', '-qm', 'tracked report dir']);
  const tracked = runRunner(['--mode', 'review', '--scope', 'recent', '--out', path.join(p, 'codex')], { stub: s, cwd: p });
  assert.equal(tracked.status, 65);
  const failed = runRunner(['--mode', 'review', '--scope', 'recent', '--out', path.join(p, 'untracked')], { stub: s, cwd: p, env: { STUB_EXEC_EXIT: '3' } });
  assert.equal(failed.status, 70);
  assert.equal(failed.out.codex_exit, '3');
  assert.ok(fs.existsSync(failed.out.stderr_path));
});

test('review: colliding report names get a numeric suffix instead of overwriting', () => {
  const p = newBuildProject(true); const s = makeStub();
  const out = path.join(p, 'untracked');
  const r1 = runRunner(['--mode', 'review', '--scope', 'recent', '--objective', 'N+1 queries', '--out', out], { stub: s, cwd: p });
  const r2 = runRunner(['--mode', 'review', '--scope', 'recent', '--objective', 'n 1 queries', '--out', out], { stub: s, cwd: p });
  assert.equal(r1.status, 0, r1.stdout + r1.stderr);
  assert.equal(r2.status, 0, r2.stdout + r2.stderr);
  assert.notEqual(r1.out.report_path, r2.out.report_path);
  assert.ok(fs.existsSync(r1.out.report_path));
  assert.ok(fs.existsSync(r2.out.report_path));
});

test('review: the suffix loop tries every name through -500', () => {
  const p = newBuildProject(true); const s = makeStub();
  const out = path.join(p, 'untracked');
  fs.mkdirSync(out, { recursive: true });
  // PM_CODEX_STAMP pins the runner's stamp so the pre-created names are guaranteed to
  // collide, rather than racing the runner's own wall-clock stamp() call. Pre-create
  // every name from `.md` to `-499.md`; only `-500` is left free.
  const fixedStamp = '20260101-000000';
  const nameBase = `${fixedStamp}-codex-review-recent-collide`;
  fs.writeFileSync(path.join(out, `${nameBase}.md`), '');
  for (let n = 2; n <= 499; n += 1) fs.writeFileSync(path.join(out, `${nameBase}-${n}.md`), '');
  const r = runRunner(['--mode', 'review', '--scope', 'recent', '--objective', 'collide', '--out', out], { stub: s, cwd: p, env: { PM_CODEX_STAMP: fixedStamp } });
  assert.equal(r.status, 0, JSON.stringify(r.out));
  assert.match(path.basename(r.out.report_path), /-collide-500\.md$/);
});

test('review: an objective that slugs to empty falls back to "custom"', () => {
  const p = newBuildProject(true); const s = makeStub();
  const out = path.join(p, 'untracked');
  const r = runRunner(['--mode', 'review', '--scope', 'recent', '--objective', '!!!', '--out', out], { stub: s, cwd: p });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(path.basename(r.out.report_path), /-custom\.md$/);
});

test('review: an objective of "index" cannot collide with the multi-report index file', () => {
  const p = newBuildProject(true); const s = makeStub();
  const out = path.join(p, 'untracked');
  const r = runRunner(['--mode', 'review', '--scope', 'recent', '--objective', 'index', '--out', out], { stub: s, cwd: p });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(path.basename(r.out.report_path), /-index-objective\.md$/);
});

test('review: preflight reports readiness without running', () => {
  const p = newBuildProject(true); const s = makeStub();
  const r = runRunner(['--mode', 'review', '--scope', 'recent', '--preflight'], { stub: s, cwd: p });
  assert.equal(r.status, 0);
  assert.equal(r.out.runner_status, 'ready');
  assert.equal(r.out.quota_consumed, false);
  // Preflight now verifies review support itself, so `exec review --help` IS expected —
  // what must not appear is a real review run.
  assert.match(stubActions(s), /^exec review --help$/m);
  assert.doesNotMatch(stubActions(s), /^exec review (?!--help)/m);
});

test('review: a symlinked output directory is rejected before Codex runs', (t) => {
  const p = newBuildProject(true); const s = makeStub();
  const outside = tmpDir('review-escape-');
  if (!canSymlink(outside, path.join(p, 'untracked'))) return t.skip('symlinks unavailable');
  const r = runRunner(['--mode', 'review', '--scope', 'recent', '--out', path.join(p, 'untracked')], { stub: s, cwd: p });
  assert.equal(r.status, 65, JSON.stringify(r.out));
  assert.match(r.out.reason, /must not be a symlink/);
  assert.doesNotMatch(stubActions(s), /^exec review (?!--help)/m);
  assert.equal(fs.readdirSync(outside).length, 0);
});

test('review: an output path that exists and is not a directory is rejected', () => {
  const p = newBuildProject(true); const s = makeStub();
  fs.writeFileSync(path.join(p, 'untracked'), 'a regular file, not a report directory\n');
  const r = runRunner(['--mode', 'review', '--scope', 'recent', '--out', path.join(p, 'untracked')], { stub: s, cwd: p });
  assert.equal(r.status, 65, JSON.stringify(r.out));
  assert.match(r.out.reason, /not a directory/);
  assert.doesNotMatch(stubActions(s), /^exec review (?!--help)/m);
});

test('review: a stale CLI without --ignore-rules on the review subcommand is unavailable', () => {
  const p = newBuildProject(true); const s = makeStub();
  const out = path.join(p, 'untracked');
  const r = runRunner(['--mode', 'review', '--scope', 'recent', '--out', out], { stub: s, cwd: p, env: { STUB_NO_REVIEW_IGNORE_RULES: '1' } });
  assert.equal(r.status, 69, JSON.stringify(r.out));
  assert.match(r.out.reason, /lacks required review flag --ignore-rules/);
  assert.equal(r.out.codex_version, 'codex-cli 9.9.9-stub');
  assert.doesNotMatch(stubActions(s), /^exec review (?!--help)/m);
});

test('review: codebase scope is not gated on the review subcommand', () => {
  const p = newBuildProject(true); const s = makeStub();
  const out = path.join(p, 'untracked');
  const r = runRunner(['--mode', 'review', '--scope', 'codebase', '--out', out], { stub: s, cwd: p, env: { STUB_REVIEW_HELP_EXIT: '2' } });
  assert.equal(r.status, 0, JSON.stringify(r.out));
  assert.doesNotMatch(stubActions(s), /^exec review --help$/m);
  const worktree = runRunner(['--mode', 'review', '--scope', 'worktree', '--preflight'], { stub: s, cwd: p, env: { STUB_REVIEW_HELP_EXIT: '2' } });
  assert.equal(worktree.status, 69, JSON.stringify(worktree.out));
  assert.match(worktree.out.reason, /codex exec review --help failed/);
});

test('advise: read-only exec with the prompt on stdin, answer retained', () => {
  const p = newBuildProject(true); const s = makeStub();
  const brief = path.join(s.dir, 'brief.md');
  fs.writeFileSync(brief, 'Should we use X or Y?\n');
  const r = runRunner(['--mode', 'advise', '--prompt-file', brief], { stub: s, cwd: p, env: { STUB_ANSWER: '1' } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const a = stubArgs(s);
  for (const x of ['--sandbox', 'read-only', '--ephemeral', '--color', 'never', '--ignore-user-config', '--ignore-rules', '--strict-config', 'gpt-5.6-sol', 'model_reasoning_effort=medium', '-o', '-']) assert.ok(has(a, x), x);
  for (const x of ['mcp_servers={}', 'features.hooks=false', 'agents.enabled=false', 'web_search="disabled"']) assert.ok(has(a, x), x);
  assert.ok(!has(a, '--search') && !has(a, '--skip-git-repo-check'));
  assert.equal(fs.readFileSync(s.promptFile, 'utf8'), 'Should we use X or Y?\n');
  assert.equal(fs.readFileSync(r.out.answer_path, 'utf8'), 'stub answer\n');
  assert.equal(r.out.mode, 'advise');
});

test('research: adds --search when available and --skip-git-repo-check outside a repo', () => {
  const s = makeStub();
  const noRepo = tmpDir('norepo-');
  const brief = path.join(s.dir, 'brief.md');
  fs.writeFileSync(brief, 'Compare auth libraries.\n');
  const withSearch = runRunner(['--mode', 'research', '--prompt-file', brief], { stub: s, cwd: noRepo, env: { STUB_ANSWER: '1', STUB_HAS_SEARCH: '1' } });
  assert.equal(withSearch.status, 0);
  assert.ok(has(stubArgs(s), '--search') && has(stubArgs(s), '--skip-git-repo-check'));
  // The only argv that omits the web_search override: search was explicitly requested.
  assert.ok(!has(stubArgs(s), 'web_search="disabled"'));
  for (const x of ['mcp_servers={}', 'features.hooks=false', 'agents.enabled=false']) assert.ok(has(stubArgs(s), x), x);
  assert.equal(withSearch.out.search_used, true);
  assert.ok(has(stubArgs(s), 'gpt-5.6-terra'));
  const off = runRunner(['--mode', 'research', '--prompt-file', brief, '--search', 'off'], { stub: s, cwd: noRepo, env: { STUB_ANSWER: '1', STUB_HAS_SEARCH: '1' } });
  assert.ok(!has(stubArgs(s), '--search'));
  assert.ok(has(stubArgs(s), 'web_search="disabled"'));
  assert.equal(off.out.search_used, false);
});

test('advise: hostile project config cannot re-enable MCP servers, hooks, agents, or search', () => {
  const p = newBuildProject(true); const s = makeStub();
  fs.mkdirSync(path.join(p, '.codex'));
  fs.writeFileSync(path.join(p, '.codex', 'config.toml'), 'web_search = "live"\n[mcp_servers.hostile]\ncommand = "false"\n[features]\nhooks = true\n');
  const brief = path.join(s.dir, 'brief.md');
  fs.writeFileSync(brief, 'q\n');
  const r = runRunner(['--mode', 'advise', '--prompt-file', brief], { stub: s, cwd: p, env: { STUB_ANSWER: '1' } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const a = stubArgs(s);
  for (const x of ['--ignore-user-config', '--ignore-rules', '--strict-config', 'mcp_servers={}', 'features.hooks=false', 'agents.enabled=false', 'web_search="disabled"']) assert.ok(has(a, x), x);
});

test('advise: missing prompt file, auth failure, and non-zero exit', () => {
  const s = makeStub();
  const p = newBuildProject(true);
  assert.equal(runRunner(['--mode', 'advise', '--prompt-file', path.join(s.dir, 'nope.md')], { stub: s, cwd: p }).status, 65);
  const brief = path.join(s.dir, 'brief.md'); fs.writeFileSync(brief, 'q\n');
  assert.equal(runRunner(['--mode', 'advise', '--prompt-file', brief], { stub: s, cwd: p, env: { STUB_LOGIN_EXIT: '1' } }).status, 69);
  const failed = runRunner(['--mode', 'advise', '--prompt-file', brief], { stub: s, cwd: p, env: { STUB_EXEC_EXIT: '5' } });
  assert.equal(failed.status, 70);
  assert.equal(failed.out.codex_exit, '5');
});
