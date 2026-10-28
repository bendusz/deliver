import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tmpDir, gitIn, PLUGIN_ROOT, newBuildProject, runRunner } from './helpers.mjs';

const DOC = path.join(PLUGIN_ROOT, 'skills', 'project-manager', 'references', 'host-t3.md');

test('host-t3: the T3 Codex path snapshots and compares through the runner, never by hand', () => {
  const text = fs.readFileSync(DOC, 'utf8');
  for (const need of ['--emit-prompt', '--snapshot --snapshot-out', '--snapshot-compare <file> --snapshot-sha256 <sha>', 'no git repository']) {
    assert.ok(text.includes(need), need);
  }
  // The hand-run commands missed .git/ and ignored files; nothing uses them any more.
  assert.doesNotMatch(text, /git stash create|advisory-snapshot/);
  const steps = text.slice(text.indexOf('## A Codex call through'), text.indexOf('**Calibration.**'));
  assert.ok(steps.indexOf('--snapshot --snapshot-out') < steps.indexOf('**Call**'), 'snapshot before the call');
  assert.ok(steps.indexOf('**Read** the result') < steps.indexOf('--snapshot-compare'), 'compare after the child');
  assert.match(steps, /never grade or relay the run/);
});

// The documented commands, run as the PM would around a read-only child that writes what
// `git status --porcelain` cannot show: an overwrite of an already modified or untracked file, and a commit.
test('host-t3: the documented snapshot catches changes that leave git status unchanged', () => {
  const brief = path.join(tmpDir('pmt3-'), 'brief.md');
  fs.writeFileSync(brief, 'q\n');
  const args = ['--mode', 'advise', '--prompt-file', brief];
  const cases = {
    'a tracked file overwritten': (d) => fs.writeFileSync(path.join(d, 'src', 'script.sh'), 'overwritten by the delegate\n'),
    'an untracked file overwritten': (d) => fs.writeFileSync(path.join(d, 'new.txt'), 'overwritten untracked\n'),
    'a commit': (d) => gitIn(d, ['commit', '-q', '--allow-empty', '-m', 'delegate commit']),
  };
  for (const [what, write] of Object.entries(cases)) {
    const d = newBuildProject(true);
    fs.writeFileSync(path.join(d, 'src', 'script.sh'), 'edited before\n');
    fs.writeFileSync(path.join(d, 'new.txt'), 'untracked before\n');
    const status = gitIn(d, ['status', '--porcelain']);
    const file = path.join(tmpDir('pmt3-'), 'snap.json');
    const snap = runRunner([...args, '--snapshot', '--snapshot-out', file], { cwd: d });
    assert.equal(snap.status, 0, snap.stdout + snap.stderr);
    const compare = () => runRunner([...args, '--snapshot-compare', file, '--snapshot-sha256', snap.out.snapshot_sha256], { cwd: d });
    assert.equal(compare().status, 0, 'stable when nothing changes');
    write(d);
    assert.equal(gitIn(d, ['status', '--porcelain']), status, what);
    assert.equal(compare().status, 74, what);
  }
});

test('host-t3: the own-checkout snapshot command runs as documented and catches a write there', () => {
  const d = newBuildProject(true);
  const args = ['--mode', 'review', '--scope', 'codebase', '--out', path.join(d, 'untracked')];
  const file = path.join(tmpDir('pmt3-'), 'snap.json');
  const snap = runRunner([...args, '--snapshot', '--snapshot-out', file], { cwd: d });
  assert.equal(snap.status, 0, snap.stdout + snap.stderr);
  fs.writeFileSync(path.join(d, 'stray.txt'), 'a shared child wrote here\n');
  const r = runRunner([...args, '--snapshot-compare', file, '--snapshot-sha256', snap.out.snapshot_sha256], { cwd: d });
  assert.equal(r.status, 74);
  assert.deepEqual(r.out.changes.content, ['stray.txt']);
});
