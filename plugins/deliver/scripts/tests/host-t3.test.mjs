import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpDir, gitIn, PLUGIN_ROOT } from './helpers.mjs';

const DOC = path.join(PLUGIN_ROOT, 'skills', 'project-manager', 'references', 'host-t3.md');

// snapshotCommands(): the advisory-call snapshot block host-t3.md documents, one command a line.
function snapshotCommands() {
  const text = fs.readFileSync(DOC, 'utf8');
  const m = text.match(/<!-- advisory-snapshot -->\s*```[a-z]*\r?\n([\s\S]*?)```/);
  assert.ok(m, 'host-t3.md documents the advisory snapshot in a fenced block after <!-- advisory-snapshot -->');
  return m[1].split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}

// snapshot(d): every documented command's output, with a stash commit read as its tree, since the
// commit itself carries a timestamp.
function snapshot(d) {
  return snapshotCommands().map((cmd) => {
    const r = spawnSync(cmd, { cwd: d, shell: true, encoding: 'utf8', windowsHide: true });
    assert.equal(r.status, 0, `${cmd}: ${r.stderr}`);
    const out = r.stdout.trim();
    return /stash create/.test(cmd) && out ? gitIn(d, ['rev-parse', `${out}^{tree}`]).trim() : out;
  });
}

test('host-t3: the advisory snapshot catches content changes that leave git status unchanged', () => {
  const cmds = snapshotCommands();
  for (const need of [/rev-parse HEAD/, /stash create/, /ls-files -o --exclude-standard/, /hash-object/]) assert.ok(cmds.some((c) => need.test(c)), String(need));
  const d = tmpDir('pmt3-');
  gitIn(d, ['init', '-q', '-b', 'main']);
  gitIn(d, ['config', 'user.email', 't3@example.com']);
  gitIn(d, ['config', 'user.name', 'T3 Tests']);
  fs.writeFileSync(path.join(d, 'a.txt'), 'base\n');
  gitIn(d, ['add', 'a.txt']);
  gitIn(d, ['commit', '-qm', 'base']);
  // Already modified and untracked before the call.
  fs.writeFileSync(path.join(d, 'a.txt'), 'edited before\n');
  fs.writeFileSync(path.join(d, 'new.txt'), 'untracked before\n');
  const status = () => gitIn(d, ['status', '--porcelain']);
  const before = { status: status(), snap: snapshot(d) };
  assert.deepEqual(snapshot(d), before.snap, 'the snapshot is stable when nothing changes');
  // The delegate overwrites both: status reads the same, the snapshot does not.
  fs.writeFileSync(path.join(d, 'a.txt'), 'overwritten by the delegate\n');
  assert.equal(status(), before.status);
  assert.notDeepEqual(snapshot(d), before.snap, 'a tracked file overwritten');
  fs.writeFileSync(path.join(d, 'a.txt'), 'edited before\n');
  fs.writeFileSync(path.join(d, 'new.txt'), 'overwritten untracked\n');
  assert.equal(status(), before.status);
  assert.notDeepEqual(snapshot(d), before.snap, 'an untracked file overwritten');
  // A commit that leaves the same status still moves HEAD.
  fs.writeFileSync(path.join(d, 'new.txt'), 'untracked before\n');
  gitIn(d, ['commit', '-q', '--allow-empty', '-m', 'delegate commit']);
  assert.equal(status(), before.status);
  assert.notDeepEqual(snapshot(d), before.snap, 'a commit');
});
