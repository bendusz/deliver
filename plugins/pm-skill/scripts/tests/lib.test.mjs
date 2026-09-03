import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { cksum, pmActorId } from '../../hooks/lib.mjs';
import { newProj, gitIn } from './helpers.mjs';

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
