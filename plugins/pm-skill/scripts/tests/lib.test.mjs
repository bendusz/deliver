import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { cksum, pmActorId, pmRoot, pmRelpath, readJson } from '../../hooks/lib.mjs';
import { newProj, gitIn, canSymlink, tmpDir, HOOKS_DIR } from './helpers.mjs';

test('cksum matches POSIX cksum vectors', () => {
  assert.equal(cksum('casey@example.com'), 1486589864);
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
