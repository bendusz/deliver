import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { newProj, runHook, writeInput, canSymlink, tmpDir, gitIn } from './helpers.mjs';

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

const secrets = (input, env) => runHook('pm-secrets-guard.mjs', input, env).status;
const content = (cwd, f, c) => ({ cwd, tool_input: { file_path: f, content: c } });

test('secrets: prose in pm/ is allowed, shaped values are blocked', () => {
  const g = newProj(false);
  const log = path.join(g, 'pm', 'log.md');
  assert.equal(secrets(content(g, log, 'rotate the API key on the box')), 0);
  assert.equal(secrets(content(g, log, 'api_key = "zq9x7c2v8b4n6m1k"')), 2);
  assert.equal(secrets(content(g, log, 'API_KEY = "zq9x7c2v8b4n6m1k"')), 2);
  assert.equal(secrets(content(g, log, 'API_KEY=abcdefghijklmno')), 2);
  assert.equal(secrets(content(g, log, 'Password: hunter2hunter2')), 2);
  assert.equal(secrets(content(g, log, 'TOKEN=$GITHUB_TOKEN and api_key = "$FROM_ENV_VAR"')), 0);
  assert.equal(secrets(content(g, log, 'token = "<rotate-me-later>"')), 0);
  assert.equal(secrets(content(g, log, 'key AKIAIOSFODNN7EXAMPLE ok')), 2);
  assert.equal(secrets(content(g, log, 'ghp_abcdefghijklmnopqrstuvwxyz012345')), 2);
  assert.equal(secrets(content(g, log, '-----BEGIN RSA PRIVATE KEY-----')), 2);
  assert.equal(secrets(content(g, log, 'Password: "use a sentence here"')), 0);
});

test('secrets: ignores writes outside pm/, guards traversal and symlinks into pm/', (t) => {
  const g = newProj(false);
  assert.equal(secrets(content(g, path.join(g, 'src', 'config.py'), 'API_KEY=abcdefghijklmno')), 0);
  assert.equal(secrets(content(g, path.join(g, 'docs', '..', 'pm', 'log.md'), 'API_KEY=abcdefghijklmno')), 2);
  fs.writeFileSync(path.join(g, 'pm', 'log.md'), '');
  if (!canSymlink(path.join(g, 'pm', 'log.md'), path.join(g, 'docs', 'note.md'))) return t.skip('symlinks unavailable');
  assert.equal(secrets(content(g, path.join(g, 'docs', 'note.md'), 'API_KEY=abcdefghijklmno')), 2);
});

test('secrets: scans Edit.new_string and MultiEdit.edits[].new_string', () => {
  const g = newProj(false);
  const log = path.join(g, 'pm', 'log.md');
  assert.equal(secrets({ cwd: g, tool_input: { file_path: log, new_string: 'API_KEY=abcdefghijklmno' } }), 2);
  assert.equal(secrets({ cwd: g, tool_input: { file_path: log, edits: [{ new_string: 'fine' }, { new_string: 'API_KEY=abcdefghijklmno' }] } }), 2);
  assert.equal(secrets({ cwd: g, tool_input: { file_path: log } }), 0);
});

const actor = (input, env) => runHook('actor-guard.mjs', input, env).status;
const ME = 'casey-example-com-589b8fa8ab93';

test('actor: own files allowed, other actors blocked, non-actor files allowed', () => {
  const a = newProj(false);
  const actors = path.join(a, 'pm', 'actors');
  assert.equal(actor(writeInput(a, path.join(actors, `${ME}.json`))), 0);
  assert.equal(actor(writeInput(a, path.join(actors, `${ME}.HANDOFF.md`))), 0);
  assert.equal(actor(writeInput(a, path.join(actors, 'jordan-example-com-000000000000.json'))), 2);
  assert.equal(actor(writeInput(a, path.join(actors, 'jordan-example-com-000000000000.HANDOFF.md'))), 2);
  assert.equal(actor(writeInput(a, path.join(actors, 'README.txt'))), 0);
  assert.equal(actor(writeInput(a, path.join(a, 'pm', 'log.md'))), 0);
});

test('actor: F4 cross-domain and bare local-part ids are other actors', () => {
  const a = newProj(false);
  const actors = path.join(a, 'pm', 'actors');
  assert.equal(actor(writeInput(a, path.join(actors, 'casey-other-org.json'))), 2);
  assert.equal(actor(writeInput(a, path.join(actors, 'casey.json'))), 2);
});

test('actor: a symlink named after us still blocks by real target', (t) => {
  const a = newProj(false);
  const actors = path.join(a, 'pm', 'actors');
  const other = path.join(actors, 'jordan-example-com-000000000000.json');
  fs.writeFileSync(other, '{}');
  if (!canSymlink(other, path.join(actors, `${ME}.HANDOFF.md`))) return t.skip('symlinks unavailable');
  assert.equal(actor(writeInput(a, path.join(actors, `${ME}.HANDOFF.md`))), 2);
});

test('actor: kill switch and no derivable identity allow', () => {
  const a = newProj(false);
  const other = path.join(a, 'pm', 'actors', 'jordan-example-com-000000000000.json');
  assert.equal(actor(writeInput(a, other), { PM_SKILL_NO_ENFORCE: '1' }), 0);
  const b = newProj(false);
  gitIn(b, ['config', '--unset', 'user.email']);
  gitIn(b, ['config', '--unset', 'user.name']);
  const r = actor(writeInput(b, path.join(b, 'pm', 'actors', 'jordan-example-com-000000000000.json')), { GIT_CONFIG_GLOBAL: path.join(b, 'no-global'), GIT_CONFIG_SYSTEM: path.join(b, 'no-system') });
  assert.equal(r, 0);
});
