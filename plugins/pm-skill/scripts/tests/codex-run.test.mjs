import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { parseArgs, UsageError } from '../codex/lib/args.mjs';
import { envelope, EXIT, RunnerError } from '../codex/lib/result.mjs';
import { parseStory } from '../codex/lib/story.mjs';
import { PLUGIN_ROOT, tmpDir, gitIn, newBuildProject } from './helpers.mjs';

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
