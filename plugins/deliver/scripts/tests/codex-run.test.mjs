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
import { cmdFallbackPrefix, CMD_FALLBACK_SUFFIX, requireCodex, BUILD_FLAGS, EXEC_FLAGS, REVIEW_FLAGS } from '../codex/lib/preflight.mjs';
import { PLUGIN_ROOT, tmpDir, gitIn, canSymlink, newBuildProject, makeStub, runRunner, stubArgs, stubActions, minimalPath, STORY_V2, STORY_LEGACY, APPROVED } from './helpers.mjs';

test('args: defaults per mode and validation', () => {
  const b = parseArgs(['--mode', 'build', '--worktree', '/w', '--story', 'docs/stories/S1-1.md']);
  assert.deepEqual([b.model, b.effort, b.timeoutSeconds], ['gpt-6-astra', 'high', 600]);
  const r = parseArgs(['--mode', 'review', '--scope', 'recent', '--out', '/w/untracked']);
  assert.deepEqual([r.model, r.effort], ['gpt-6-astra', 'high']);
  const a = parseArgs(['--mode', 'advise', '--prompt-file', '/p.md']);
  assert.deepEqual([a.model, a.effort], ['gpt-6-astra', 'medium']);
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
  const o = { model: 'gpt-5.6-luna', effort: 'high' };
  const a = lockedExecArgs(o);
  for (const x of ['--ignore-rules', '--ephemeral', 'gpt-5.6-luna', 'model_reasoning_effort=high',
    'sandbox_mode="danger-full-access"', 'features.hooks=false', 'agents.enabled=false']) assert.ok(a.includes(x), x);
  // The user's config, MCP servers, and web search apply: nothing overrides them.
  for (const x of ['--ignore-user-config', '--strict-config', 'mcp_servers={}', 'web_search="disabled"']) assert.ok(!a.includes(x), `shared args must not carry ${x}`);
  // `codex exec review` rejects these, so no mode may inherit them from the shared set.
  for (const x of ['--sandbox', '-C', '--color', '--skip-git-repo-check', '-o', '--output-schema']) {
    assert.ok(!a.includes(x), `shared args must not carry ${x}`);
  }
  const withSearch = lockedExecArgs(o, { search: true });
  assert.ok(withSearch.includes('--search'));
  assert.ok(!withSearch.includes('web_search="disabled"'));
  const noSearch = lockedExecArgs(o, { searchOff: true });
  assert.ok(noSearch.includes('web_search="disabled"') && !noSearch.includes('--search'));
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
  expectBlocked(STORY_V2.replace('"touches":["src"]', '"touches":["src","src/"]'), /unique touches/);
  fs.writeFileSync(story, STORY_LEGACY);
  assert.deepEqual(parseStory(p, rel), { builder: 'codex-builder', scopes: ['src'] });
  expectBlocked(STORY_LEGACY.replace('Builder: codex-builder', 'Builder: expert-builder'), /does not match/);
  expectBlocked(STORY_LEGACY.replace('Touches: src', 'Touches: lib'), /visible Touches/);
  expectBlocked(STORY_LEGACY.replace('Touches: src', 'Touches: '), /visible Touches/);
  fs.writeFileSync(story, STORY_V2.replace('## Acceptance criteria (testable)', '## Acceptance criteria (testable)\nTouches: nothing'));
  assert.deepEqual(parseStory(p, rel), { builder: 'codex-builder', scopes: ['src'] });
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
  for (const f of ['--commit', '--uncommitted', '--base', '--ignore-rules', '--ephemeral']) {
    assert.ok(REVIEW_FLAGS.includes(f), f);
  }
  assert.ok(EXEC_FLAGS.includes('--ignore-rules'));
});

test('snapshot: detects content, new, deleted, mode, and ignored-protected changes', () => {
  const p = newBuildProject(true);
  const before = snapshotWorktree(p);
  assert.ok(before.has('src/script.sh') && before.has('docs/stories/S1-1-fix.md') && before.has('docs/approval.json'));
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
  // A same-size, same-mode hook rewrite is a content change, not a size change.
  const hook = path.join(p, '.git', 'hooks', 'pre-commit');
  fs.writeFileSync(hook, '#!/bin/sh\necho AAAA\n', { mode: 0o755 });
  const withHook = gitMetadataFingerprint(p);
  fs.writeFileSync(hook, '#!/bin/sh\necho BBBB\n', { mode: 0o755 });
  assert.notEqual(gitMetadataFingerprint(p), withHook);
  // From a linked worktree the shared hooks and info/exclude are still fingerprinted.
  const wt = path.join(tmpDir('wt-'), 'w');
  gitIn(p, ['worktree', 'add', '-q', wt, '-b', 'wt-branch']);
  const fromWorktree = gitMetadataFingerprint(wt);
  fs.writeFileSync(hook, '#!/bin/sh\necho CCCC\n', { mode: 0o755 });
  assert.notEqual(gitMetadataFingerprint(wt), fromWorktree);
  const afterHook = gitMetadataFingerprint(wt);
  fs.appendFileSync(path.join(p, '.git', 'info', 'exclude'), 'secret.txt\n');
  assert.notEqual(gitMetadataFingerprint(wt), afterHook);
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

test('snapshot: a root .sdd is scanned as a protected file even when ignored; a directory named *.sdd is not', () => {
  const p = newBuildProject(true);
  fs.appendFileSync(path.join(p, '.gitignore'), 'hidden.sdd\nSHOUTED.SDD\n');
  fs.writeFileSync(path.join(p, 'hidden.sdd'), 'spec\n');
  fs.writeFileSync(path.join(p, 'SHOUTED.SDD'), 'spec\n');
  fs.mkdirSync(path.join(p, 'dir.sdd'));
  fs.writeFileSync(path.join(p, 'dir.sdd', 'inside.txt'), 'x\n');
  const snap = snapshotWorktree(p);
  assert.match(snap.get('hidden.sdd'), /^file:100644:/, 'a hidden root spec is scanned by path, not by the ignored-files pass, so it fingerprints as content, not as ignored:');
  assert.match(snap.get('SHOUTED.SDD'), /^file:100644:/, 'the root-spec scan is case-insensitive, so an uppercase extension cannot hide a spec:');
  assert.ok(!snap.has('dir.sdd'), 'a directory named like a root spec must not be added by the *.sdd scan');
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

test('build 3b: a plan that changed since approval stops before Codex is invoked', () => {
  const p = newBuildProject(true); const s = makeStub();
  fs.writeFileSync(path.join(p, 'docs', 'plan.md'), '# plan v1\n');
  const digest = gitIn(p, ['hash-object', 'docs/plan.md']).trim();
  const marker = (d) => { fs.writeFileSync(path.join(p, 'docs', 'approval.json'), JSON.stringify({ ...APPROVED, plan_digest: d }) + '\n'); gitIn(p, ['add', 'docs']); gitIn(p, ['commit', '-qm', 'plan']); };
  marker('0000000000000000000000000000000000000000');
  const r = runRunner(['--mode', 'build'], { project: p, stub: s });
  assert.equal(r.status, 66); assert.match(r.out.reason, /plan_digest mismatch/);
  assert.equal(stubActions(s), '');
  marker(digest);
  const ok = runRunner(['--mode', 'build'], { project: p, stub: s, env: { STUB_WRITE_PATH: 'src/fix.txt' } });
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  // A plan that is not a regular file is refused before git could block on it.
  if (process.platform !== 'win32') {
    fs.rmSync(path.join(p, 'docs', 'plan.md'));
    if (spawnSync('mkfifo', [path.join(p, 'docs', 'plan.md')]).status === 0) {
      const fifo = runRunner(['--mode', 'build'], { project: p, stub: s });
      assert.equal(fifo.status, 66, JSON.stringify(fifo.out));
      assert.match(fifo.out.reason, /not a regular file/);
    }
  }
});

test('build 3: sign-off false stops before Codex is invoked', () => {
  const p = newBuildProject(false); const s = makeStub();
  const r = runRunner(['--mode', 'build'], { project: p, stub: s });
  assert.equal(r.status, 66);
  assert.match(r.out.reason, /not approved/);
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
  const common = ['--ignore-rules', '--ephemeral', '--color', 'never', '-C', p, 'gpt-6-astra', 'model_reasoning_effort=high', 'sandbox_mode="danger-full-access"', 'allow_login_shell=false', 'agents.enabled=false', 'features.hooks=false', 'shell_environment_policy.inherit="core"', 'shell_environment_policy.ignore_default_excludes=false', 'shell_environment_policy.experimental_use_profile=false', '--output-schema', '-o', '-'];
  for (const x of common) assert.ok(has(a, x), `missing ${x}`);
  // No OS sandbox on any platform, and no override of the user's config, MCP servers, or web search.
  for (const x of ['--sandbox', 'workspace-write', 'read-only', '--ignore-user-config', '--strict-config', 'mcp_servers={}', 'web_search="disabled"', 'sandbox_workspace_write.network_access=false']) assert.ok(!has(a, x), `must not pass ${x}`);
  for (const x of ['--dangerously-bypass-approvals-and-sandbox', '--full-auto', '--yolo', '--add-dir']) assert.ok(!has(a, x));
  assert.ok(a.some((x) => x.startsWith('shell_environment_policy.set.TMPDIR="') && /tmp[\\/]+codex-runtime[\\/]+/.test(x)));
  a.forEach((x, i) => { if (x === '-c') assert.match(a[i + 1], /=/, `-c at ${i} not followed by a key=value pair`); });
  assert.equal(r.out.runner_status, 'completed');
  assert.equal(r.out.result.status, 'done');
  assert.deepEqual(r.out.actual_files_changed, ['src/fix.txt']);
  assert.match(fs.readFileSync(s.promptFile, 'utf8'), /Stay inside the allowed implementation paths\. Do not change git state or edit stories, docs\/wiki\/, docs\/handoff\/, docs\/approval\.json, docs\/spec\.md, docs\/plan\.md, docs\/constitution\.md, or \.specdd\/\./);
  assert.doesNotMatch(fs.readFileSync(s.promptFile, 'utf8'), /rebase, merge, branch/);
  assert.match(fs.readFileSync(s.promptFile, 'utf8'), /AGENTS\.md is already in your context; read CLAUDE\.md only when it is more than a pointer/);
  assert.match(fs.readFileSync(s.promptFile, 'utf8'), /Read the story's Specs/);
  assert.match(fs.readFileSync(s.promptFile, 'utf8'), /summary holds at most five short strings\./);
  assert.equal(fs.readdirSync(s.tmp).length, 0);
  assert.ok(!fs.existsSync(path.join(p, 'tmp', 'codex-runtime')) || fs.readdirSync(path.join(p, 'tmp', 'codex-runtime')).length === 0);
});

test('envelopes: completed shapes carry only consumed fields', () => {
  const p = newBuildProject(true); const s = makeStub();
  const b = runRunner(['--mode', 'build'], { project: p, stub: s, env: { STUB_WRITE_PATH: 'src/fix.txt' } });
  // build.mjs has no gitignore_rule_needed computation today (only review's --out dir has
  // one); the key set below is what the trimmed envelope actually carries.
  assert.deepEqual(Object.keys(b.out).sort(), ['actual_files_changed', 'codex_version', 'effort', 'ignored_files_changed', 'model', 'result', 'runner_status']);
  const s2 = makeStub();
  const rv = runRunner(['--mode', 'review', '--scope', 'codebase', '--out', path.join(p, 'untracked')], { stub: s2, cwd: p });
  assert.deepEqual(Object.keys(rv.out).sort(), ['codex_version', 'effort', 'gitignore_rule_needed', 'model', 'report_path', 'runner_status']);
  const brief = path.join(s2.dir, 'brief.md'); fs.writeFileSync(brief, 'Should we use X or Y?\n');
  const s3 = makeStub();
  const ad = runRunner(['--mode', 'advise', '--prompt-file', brief], { stub: s3, cwd: p, env: { STUB_ANSWER: '1' } });
  assert.deepEqual(Object.keys(ad.out).sort(), ['answer_path', 'codex_version', 'effort', 'model', 'runner_status', 'scratch_dir', 'search_used']);
});

test('model fallback: an unsupported default model retries once on the mode fallback and records it', () => {
  const p = newBuildProject(true); const s = makeStub();
  const r = runRunner(['--mode', 'build'], { project: p, stub: s, env: { STUB_UNSUPPORTED_MODEL: 'gpt-6-astra', STUB_WRITE_PATH: 'src/fix.txt' } });
  assert.equal(r.status, 0);
  assert.deepEqual([r.out.model, r.out.effort], ['gpt-5.6-sol', 'medium']);
  assert.deepEqual(r.out.model_fallback.from, { model: 'gpt-6-astra', effort: 'high' });
  assert.deepEqual(r.out.model_fallback.to, { model: 'gpt-5.6-sol', effort: 'medium' });
  assert.match(r.out.model_fallback.reason, /not supported when using Codex/);
  assert.equal((stubActions(s).match(/^exec(?! --help)/gm) || []).length, 2);
  assert.ok(has(stubArgs(s), 'gpt-5.6-sol'));
  assert.ok(has(stubArgs(s), 'model_reasoning_effort=medium'));
});

test('model fallback: an explicit --model never falls back; other failures never fall back; success carries no field', () => {
  const p = newBuildProject(true); const s = makeStub();
  const explicit = runRunner(['--mode', 'build', '--model', 'gpt-6-astra'], { project: p, stub: s, env: { STUB_UNSUPPORTED_MODEL: 'gpt-6-astra' } });
  assert.equal(explicit.status, 70); assert.equal(explicit.out.model_fallback, undefined);
  assert.equal((stubActions(s).match(/^exec(?! --help)/gm) || []).length, 1);
  const s2 = makeStub();
  const other = runRunner(['--mode', 'build'], { project: p, stub: s2, env: { STUB_EXEC_EXIT: '5' } });
  assert.equal(other.status, 70); assert.equal(other.out.model_fallback, undefined);
  assert.equal((stubActions(s2).match(/^exec(?! --help)/gm) || []).length, 1);
  const s3 = makeStub();
  const ok = runRunner(['--mode', 'build'], { project: p, stub: s3, env: { STUB_WRITE_PATH: 'src/fix.txt' } });
  assert.equal(ok.status, 0); assert.equal(ok.out.model, 'gpt-6-astra'); assert.equal('model_fallback' in ok.out, false);
});

test('model fallback: review and advise take the same gpt-5.6-sol fallback at medium', () => {
  const p = newBuildProject(true);
  const s = makeStub();
  const rv = runRunner(['--mode', 'review', '--scope', 'codebase', '--out', path.join(p, 'untracked')], { stub: s, cwd: p, env: { STUB_UNSUPPORTED_MODEL: 'gpt-6-astra' } });
  assert.equal(rv.status, 0); assert.deepEqual([rv.out.model, rv.out.effort], ['gpt-5.6-sol', 'medium']);
  assert.equal(rv.out.model_fallback.to.model, 'gpt-5.6-sol');
  const brief = path.join(s.dir, 'brief.md'); fs.writeFileSync(brief, 'Should we use X or Y?\n');
  const s2 = makeStub();
  const ad = runRunner(['--mode', 'advise', '--prompt-file', brief], { stub: s2, cwd: p, env: { STUB_UNSUPPORTED_MODEL: 'gpt-6-astra', STUB_ANSWER: '1' } });
  assert.equal(ad.status, 0); assert.deepEqual([ad.out.model, ad.out.effort], ['gpt-5.6-sol', 'medium']);
  assert.equal(ad.out.model_fallback.to.model, 'gpt-5.6-sol');
});

test('model fallback: a failure after the fallback names the model that ran', () => {
  const p = newBuildProject(true); const s = makeStub();
  const r = runRunner(['--mode', 'build'], { project: p, stub: s, env: { STUB_UNSUPPORTED_MODEL: 'gpt-6-astra', STUB_EXEC_EXIT: '5' } });
  assert.equal(r.status, 70, JSON.stringify(r.out));
  assert.deepEqual([r.out.model, r.out.effort], ['gpt-5.6-sol', 'medium']);
  assert.equal(r.out.model_fallback.to.model, 'gpt-5.6-sol');
});

test('build 6: fix mode passes the evidence brief', () => {
  const p = newBuildProject(true); const s = makeStub();
  const r = runRunner(['--mode', 'fix', '--evidence', 'tmp/codex-builder/S1-1-round-1.md'], { project: p, stub: s, env: { STUB_WRITE_PATH: 'src/fix.txt' } });
  assert.equal(r.status, 0);
  assert.match(fs.readFileSync(s.promptFile, 'utf8'), /Mode: fix/);
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

test('build 11: missing, legacy-only, and symlinked approval markers fail closed', (t) => {
  const p = newBuildProject(true); const s = makeStub();
  fs.rmSync(path.join(p, 'docs', 'approval.json'));
  const r1 = runRunner(['--mode', 'build'], { project: p, stub: s });
  assert.equal(r1.status, 66); assert.match(r1.out.reason, /missing/);
  // A project managed before 0.24 has only pm/pm-state.json: the runner names the migration
  // instead of trusting the old flag.
  fs.writeFileSync(path.join(p, 'pm', 'pm-state.json'), '{"signed_off":true}\n');
  const r1b = runRunner(['--mode', 'build'], { project: p, stub: s });
  assert.equal(r1b.status, 66); assert.match(r1b.out.reason, /pre-0\.24 state; run \/deliver:resume/);
  fs.rmSync(path.join(p, 'pm', 'pm-state.json'));
  const outside = tmpDir('state-');
  fs.writeFileSync(path.join(outside, 'state.json'), '{"status":"approved"}\n');
  try { fs.symlinkSync(path.join(outside, 'state.json'), path.join(p, 'docs', 'approval.json'), 'file'); } catch { return t.skip('symlinks unavailable'); }
  const r2 = runRunner(['--mode', 'build'], { project: p, stub: s });
  assert.equal(r2.status, 66); assert.match(r2.out.reason, /symlink/);
  assert.equal(stubActions(s), '');
});

// One build run whose stub writes `rel` and reports it. `ignore` adds a .gitignore rule first, so a
// case can prove that a hostile ignore rule cannot hide a protected path from the audit.
function runBuildWriteCase(rel, { ignore } = {}) {
  const p = newBuildProject(true); const s = makeStub();
  if (ignore) fs.appendFileSync(path.join(p, '.gitignore'), `${ignore}\n`);
  return runRunner(['--mode', 'build'], { project: p, stub: s, env: { STUB_WRITE_PATH: rel, STUB_REPORT_PATH: rel } });
}

test('build 12, 12c, 12d, 14, 22: protected, out-of-scope, ignored, wiki, .specdd, and root-spec writes are violations', () => {
  const cases = [
    ['docs/approval.json', /protected PM artifact/, null],
    ['docs/handoff/casey.md', /protected PM artifact/, null],
    ['README.md', /outside the story/, null],
    ['pm/hidden.md', /protected PM artifact/, 'pm/hidden.md'],
    ['docs/wiki/index.md', /protected PM artifact/, null],
    ['.specdd/bootstrap.md', /protected PM artifact/, null],
    ['todo-cli.sdd', /protected PM artifact/, null],
    ['ROOT.SDD', /protected PM artifact/, null],
    ['hidden.sdd', /protected PM artifact/, 'hidden.sdd'],
  ];
  for (const [rel, re, ignore] of cases) {
    const r = runBuildWriteCase(rel, { ignore });
    assert.equal(r.status, 74, `${rel}: ${JSON.stringify(r.out)}`);
    assert.match(r.out.reason, re, rel);
    assert.ok(r.out.actual_files_changed.includes(rel), rel);
  }
});

test('build 12d: a .sdd inside the story touches is not protected', () => {
  const r = runBuildWriteCase('src/fix.sdd');
  assert.equal(r.status, 0, JSON.stringify(r.out));
  assert.ok(r.out.actual_files_changed.includes('src/fix.sdd'));
});

test('build 13: an omitted files_changed entry cannot conceal an edit', () => {
  const p = newBuildProject(true); const s = makeStub();
  const r = runRunner(['--mode', 'build'], { project: p, stub: s, env: { STUB_WRITE_PATH: 'src/fix.txt', STUB_OMIT_REPORT: '1' } });
  assert.equal(r.status, 74);
  assert.match(r.out.reason, /authoritative/);
  assert.deepEqual(r.out.actual_files_changed, ['src/fix.txt']);
});

test('build 15: project config is trusted; only hooks and subagents stay off', () => {
  const p = newBuildProject(true); const s = makeStub();
  fs.mkdirSync(path.join(p, '.codex'));
  fs.writeFileSync(path.join(p, '.codex', 'config.toml'), 'web_search = "live"\n[mcp_servers.hostile]\ncommand = "false"\n[features]\nhooks = true\n[sandbox_workspace_write]\nnetwork_access = true\n');
  const r = runRunner(['--mode', 'build'], { project: p, stub: s, env: { STUB_WRITE_PATH: 'src/fix.txt' } });
  assert.equal(r.status, 0);
  const a = stubArgs(s);
  for (const x of ['--ignore-rules', 'features.hooks=false', 'agents.enabled=false', 'sandbox_mode="danger-full-access"']) assert.ok(has(a, x), x);
  for (const x of ['--ignore-user-config', '--strict-config', 'web_search="disabled"', 'mcp_servers={}', 'sandbox_workspace_write.network_access=false']) assert.ok(!has(a, x), `must not pass ${x}`);
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

test('build 28e: an ignored file under docs/wiki/ is still a protected-artifact violation', () => {
  const p = newBuildProject(true); const s = makeStub();
  fs.appendFileSync(path.join(p, '.gitignore'), 'docs/wiki/hidden.md\n');
  const r = runRunner(['--mode', 'build'], { project: p, stub: s, env: { STUB_WRITE_PATH: 'docs/wiki/hidden.md', STUB_OMIT_REPORT: '1' } });
  assert.equal(r.status, 74, JSON.stringify(r.out));
  assert.match(r.out.reason, /protected PM artifact: docs\/wiki\/hidden\.md/);
  assert.ok(Array.isArray(r.out.ignored_files_changed), JSON.stringify(r.out));
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
  assert.doesNotMatch(stubActions(s), /^exec --ignore-rules/m);
  assert.equal(fs.readdirSync(outside).length, 0);
});

test('build 19: a dirty baseline is isolated from this run', () => {
  const p = newBuildProject(true); const s = makeStub();
  fs.writeFileSync(path.join(p, 'src', 'preexisting.txt'), 'user-owned dirty file\n');
  const r = runRunner(['--mode', 'build'], { project: p, stub: s, env: { STUB_WRITE_PATH: 'src/fix.txt' } });
  assert.equal(r.status, 0);
  // The pre-existing dirty file is excluded from both delta lists; only the fix write is
  // reported. That is the fact git_status_short used to carry.
  assert.deepEqual(r.out.actual_files_changed, ['src/fix.txt']);
  assert.deepEqual(r.out.ignored_files_changed, []);
});

test('build 20, 24, 25: invalid effort, empty touches, and drifted fields fail before quota use', () => {
  const p = newBuildProject(true); const s = makeStub();
  assert.equal(runRunner(['--mode', 'build', '--effort', 'ultra'], { project: p, stub: s }).status, 64);
  const story = path.join(p, 'docs', 'stories', 'S1-1-fix.md');
  for (const [text, re] of [[STORY_LEGACY.replace('"touches":["src"]', '"touches":[]'), /pm-meta/], [STORY_LEGACY.replace('Builder: codex-builder', 'Builder: expert-builder'), /does not match/], [STORY_LEGACY.replace('Touches: src', 'Touches: lib'), /visible Touches/]]) {
    fs.writeFileSync(story, text);
    const r = runRunner(['--mode', 'build'], { project: p, stub: s });
    assert.equal(r.status, 66); assert.match(r.out.reason, re);
    assert.doesNotMatch(stubActions(s), /^exec --ignore-rules/m);
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
  assert.equal(r.out.policy.sandbox, 'danger-full-access');
  assert.equal(r.out.policy.network_access, true);
  assert.equal(r.out.policy.host_tmp_writable, true);
  assert.equal(r.out.policy.login_shell, false);
  assert.doesNotMatch(stubActions(s), /^exec --ignore-rules/m);
  assert.ok(!fs.existsSync(path.join(p, 'tmp', 'codex-runtime')));
});

test('build 31: a legacy result key outside the contract fails closed', () => {
  const p = newBuildProject(true); const s = makeStub();
  const r = runRunner(['--mode', 'build'], { project: p, stub: s, env: { STUB_WRITE_PATH: 'src/fix.txt', STUB_EXTRA_RESULT_KEY: '1' } });
  assert.equal(r.status, 70, JSON.stringify(r.out));
  assert.match(r.out.reason, /builder result contract/);
});

test('build 32: a summary over five items fails closed', () => {
  const p = newBuildProject(true); const s = makeStub();
  const r = runRunner(['--mode', 'build'], { project: p, stub: s, env: { STUB_WRITE_PATH: 'src/fix.txt', STUB_LONG_SUMMARY: '1' } });
  assert.equal(r.status, 70, JSON.stringify(r.out));
  assert.match(r.out.reason, /builder result contract/);
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
  for (const x of ['--ignore-rules', '--ephemeral', 'gpt-6-astra', 'model_reasoning_effort=high', 'sandbox_mode="danger-full-access"', 'features.hooks=false', 'agents.enabled=false', '-o']) assert.ok(has(a, x), x);
  for (const x of ['--ignore-user-config', '--strict-config', 'mcp_servers={}', 'web_search="disabled"']) assert.ok(!has(a, x), `must not pass ${x}`);
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

test('review: worktree scope uses --uncommitted; codebase uses plain exec', () => {
  const p = newBuildProject(true); const s = makeStub();
  fs.writeFileSync(path.join(p, 'src', 'dirty.txt'), 'x');
  const out = path.join(p, 'untracked');
  assert.equal(runRunner(['--mode', 'review', '--scope', 'worktree', '--out', out], { stub: s, cwd: p }).status, 0);
  assert.ok(has(stubArgs(s), '--uncommitted'));
  const cb = runRunner(['--mode', 'review', '--scope', 'codebase', '--objective', 'find dead code', '--out', out], { stub: s, cwd: p });
  assert.equal(cb.status, 0);
  const a = stubArgs(s);
  assert.notEqual(a[0], 'review');
  assert.ok(!has(a, '--sandbox') && has(a, 'sandbox_mode="danger-full-access"'));
  assert.match(fs.readFileSync(s.promptFile, 'utf8'), /Focus exclusively on this objective: find dead code\./);
  assert.match(path.basename(cb.out.report_path), /codebase-find-dead-code\.md$/);
});

test('review: branch scope uses --base, needs commits ahead of it, and names the base in a prompted review', () => {
  const p = newBuildProject(true); const s = makeStub();
  const out = path.join(p, 'untracked');
  const main = gitIn(p, ['branch', '--show-current']).trim();
  assert.equal(runRunner(['--mode', 'review', '--scope', 'branch', '--out', out], { stub: s, cwd: p }).status, 64);
  // Preflight needs no base: the command probes readiness before it knows the branch.
  const pre = runRunner(['--mode', 'review', '--scope', 'branch', '--preflight'], { stub: s, cwd: p });
  assert.equal(pre.status, 0, pre.stdout + pre.stderr);
  assert.equal(pre.out.runner_status, 'ready');
  assert.equal(runRunner(['--mode', 'review', '--scope', 'branch', '--base', '--evil', '--out', out], { stub: s, cwd: p }).status, 64);
  assert.equal(runRunner(['--mode', 'review', '--scope', 'recent', '--base', main, '--out', out], { stub: s, cwd: p }).status, 64);
  const none = runRunner(['--mode', 'review', '--scope', 'branch', '--base', main, '--out', out], { stub: s, cwd: p });
  assert.equal(none.status, 0);
  assert.equal(none.out.runner_status, 'nothing-to-review');
  gitIn(p, ['checkout', '-qb', 'pm/S1-1-fix']);
  fs.writeFileSync(path.join(p, 'src', 'fix.txt'), 'x\n');
  gitIn(p, ['add', 'src/fix.txt']); gitIn(p, ['commit', '-qm', 'build(S1-1): fix']);
  const r = runRunner(['--mode', 'review', '--scope', 'branch', '--base', main, '--out', out], { stub: s, cwd: p });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  let a = stubArgs(s);
  assert.equal(a[0], 'review');
  assert.ok(has(a, '--base') && has(a, main) && !has(a, '--commit') && !has(a, '--uncommitted'));
  assert.match(path.basename(r.out.report_path), /codex-review-branch\.md$/);
  assert.equal(runRunner(['--mode', 'review', '--scope', 'branch', '--base', 'no-such-branch', '--out', out], { stub: s, cwd: p }).status, 65);
  // An orphan branch shares no history with the base: rejected before any quota is spent.
  gitIn(p, ['checkout', '-q', '--orphan', 'orphan']);
  gitIn(p, ['commit', '-qm', 'orphan root']);
  const orphan = runRunner(['--mode', 'review', '--scope', 'branch', '--base', main, '--out', out], { stub: s, cwd: p });
  assert.equal(orphan.status, 65);
  assert.match(orphan.out.reason, /no common history/);
  gitIn(p, ['checkout', '-q', 'pm/S1-1-fix']);
  const obj = runRunner(['--mode', 'review', '--scope', 'branch', '--base', main, '--objective', 'bugs', '--out', out], { stub: s, cwd: p });
  assert.equal(obj.status, 0);
  a = stubArgs(s);
  assert.ok(!has(a, '--base'));
  assert.match(fs.readFileSync(s.promptFile, 'utf8'), new RegExp(`relative to ${main} \\(git diff ${main}\\.\\.\\.HEAD\\)`));
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
  // Preflight now verifies review support itself, so `exec review --help` IS expected:
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

test('advise: exec with the prompt on stdin, answer retained', () => {
  const p = newBuildProject(true); const s = makeStub();
  const brief = path.join(s.dir, 'brief.md');
  fs.writeFileSync(brief, 'Should we use X or Y?\n');
  const r = runRunner(['--mode', 'advise', '--prompt-file', brief], { stub: s, cwd: p, env: { STUB_ANSWER: '1' } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const a = stubArgs(s);
  for (const x of ['--ephemeral', '--color', 'never', '--ignore-rules', 'gpt-6-astra', 'model_reasoning_effort=medium', 'sandbox_mode="danger-full-access"', 'features.hooks=false', 'agents.enabled=false', '-o', '-']) assert.ok(has(a, x), x);
  for (const x of ['--sandbox', 'read-only', '--ignore-user-config', '--strict-config', 'mcp_servers={}', 'web_search="disabled"']) assert.ok(!has(a, x), `must not pass ${x}`);
  assert.ok(!has(a, '--search') && !has(a, '--skip-git-repo-check'));
  assert.equal(fs.readFileSync(s.promptFile, 'utf8'), 'Should we use X or Y?\n');
  assert.equal(fs.readFileSync(r.out.answer_path, 'utf8'), 'stub answer\n');
  assert.match(path.basename(r.out.scratch_dir), /^pm-codex-advise\./);
});

test('research: adds --search when available and --skip-git-repo-check outside a repo', () => {
  const s = makeStub();
  const noRepo = tmpDir('norepo-');
  const brief = path.join(s.dir, 'brief.md');
  fs.writeFileSync(brief, 'Compare auth libraries.\n');
  const withSearch = runRunner(['--mode', 'research', '--prompt-file', brief], { stub: s, cwd: noRepo, env: { STUB_ANSWER: '1', STUB_HAS_SEARCH: '1' } });
  assert.equal(withSearch.status, 0);
  assert.ok(has(stubArgs(s), '--search') && has(stubArgs(s), '--skip-git-repo-check'));
  assert.ok(!has(stubArgs(s), 'web_search="disabled"'));
  for (const x of ['features.hooks=false', 'agents.enabled=false']) assert.ok(has(stubArgs(s), x), x);
  assert.ok(!has(stubArgs(s), 'mcp_servers={}'));
  assert.equal(withSearch.out.search_used, true);
  assert.ok(has(stubArgs(s), 'gpt-6-astra'));
  const off = runRunner(['--mode', 'research', '--prompt-file', brief, '--search', 'off'], { stub: s, cwd: noRepo, env: { STUB_ANSWER: '1', STUB_HAS_SEARCH: '1' } });
  assert.ok(!has(stubArgs(s), '--search'));
  assert.ok(has(stubArgs(s), 'web_search="disabled"'));
  assert.equal(off.out.search_used, false);
});

test('advise: project config applies; only hooks and subagents stay off', () => {
  const p = newBuildProject(true); const s = makeStub();
  fs.mkdirSync(path.join(p, '.codex'));
  fs.writeFileSync(path.join(p, '.codex', 'config.toml'), 'web_search = "live"\n[mcp_servers.hostile]\ncommand = "false"\n[features]\nhooks = true\n');
  const brief = path.join(s.dir, 'brief.md');
  fs.writeFileSync(brief, 'q\n');
  const r = runRunner(['--mode', 'advise', '--prompt-file', brief], { stub: s, cwd: p, env: { STUB_ANSWER: '1' } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const a = stubArgs(s);
  for (const x of ['--ignore-rules', 'features.hooks=false', 'agents.enabled=false']) assert.ok(has(a, x), x);
  for (const x of ['--ignore-user-config', '--strict-config', 'mcp_servers={}', 'web_search="disabled"']) assert.ok(!has(a, x), `must not pass ${x}`);
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
