import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { newProj, runHook, writeInput, canSymlink, tmpDir } from './helpers.mjs';

const signoff = (input, env) => runHook('require-signoff.mjs', input, env).status;

test('signoff: blocks implementation write pre-sign-off', () => {
  const p = newProj(false);
  assert.equal(signoff(writeInput(p, path.join(p, 'src', 'app.py'))), 2);
});

test('signoff: allows planning and state writes', () => {
  const p = newProj(false);
  for (const f of ['docs/plan.md', 'pm/log.md', 'CLAUDE.md', 'AGENTS.md', '.gitignore', '.gitattributes', '.claude/rules/pm-state.md', 'tmp/x.md']) {
    assert.equal(signoff(writeInput(p, path.join(p, f))), 0, f);
  }
});

test('signoff: allows outside-project write', () => {
  const p = newProj(false);
  assert.equal(signoff(writeInput(p, path.join(path.dirname(p), 'hosts'))), 0);
});

test('signoff: kill switch, malformed JSON, and missing file_path all allow', () => {
  const p = newProj(false);
  assert.equal(signoff(writeInput(p, path.join(p, 'src', 'app.py')), { PM_SKILL_NO_ENFORCE: '1' }), 0);
  assert.equal(signoff('not json {'), 0);
  assert.equal(signoff({ cwd: p, tool_input: { command: 'ls' } }), 0);
});

test('signoff: allows implementation write after sign-off', () => {
  const p = newProj(true);
  assert.equal(signoff(writeInput(p, path.join(p, 'src', 'app.py'))), 0);
});

test('signoff: F1 subdirectory cwd still finds pm/pm-state.json', () => {
  const p = newProj(false);
  const sub = path.join(p, 'packages', 'foo');
  assert.equal(signoff(writeInput(sub, path.join(p, 'src', 'app.py')), { CLAUDE_PROJECT_DIR: p }), 2);
  assert.equal(signoff(writeInput(sub, path.join(p, 'src', 'app.py'))), 2);
});

test('signoff: F2 traversal and symlink aliases classify by the real target', (t) => {
  const p = newProj(false);
  assert.equal(signoff(writeInput(p, path.join(p, 'pm', '..', 'src', 'app.py'))), 2);
  if (!canSymlink(path.join(p, 'src'), path.join(p, 'docs', 'impl-link'))) return t.skip('symlinks unavailable');
  assert.equal(signoff(writeInput(p, path.join(p, 'docs', 'impl-link', 'app.py'))), 2);
  fs.writeFileSync(path.join(p, 'src', 'config.py'), '');
  canSymlink(path.join(p, 'src', 'config.py'), path.join(p, 'docs', 'config.md'));
  assert.equal(signoff(writeInput(p, path.join(p, 'docs', 'config.md'))), 2);
});

test('signoff: legacy tmp/pm-state.json is honoured', () => {
  const p = newProj(false);
  fs.mkdirSync(path.join(p, 'tmp'));
  fs.renameSync(path.join(p, 'pm', 'pm-state.json'), path.join(p, 'tmp', 'pm-state.json'));
  assert.equal(signoff(writeInput(p, path.join(p, 'src', 'app.py'))), 2);
});

test('signoff: block message names the gate', () => {
  const p = newProj(false);
  const r = runHook('require-signoff.mjs', writeInput(p, path.join(p, 'src', 'app.py')));
  assert.match(r.stderr, /implementation is blocked until the plan is signed off/);
});
