import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpDir, gitIn, PLUGIN_ROOT } from './helpers.mjs';

const SCRIPT = path.join(PLUGIN_ROOT, 'scripts', 'holdout.mjs');
const REF = 'refs/deliver/holdout/S1-2';

function repo() {
  const d = tmpDir('pmholdout-');
  gitIn(d, ['init', '-q', '-b', 'main']);
  gitIn(d, ['config', 'user.email', 'holdout@example.com']);
  gitIn(d, ['config', 'user.name', 'Holdout Tests']);
  fs.mkdirSync(path.join(d, 'src'));
  fs.writeFileSync(path.join(d, 'src', 'x.txt'), 'ok\n');
  gitIn(d, ['add', '-A']);
  gitIn(d, ['commit', '-qm', 'base']);
  return d;
}

// checks(): a holdout directory outside any repository, as test-engineer leaves it.
function checks(run = 'node "{holdout}/checks/check.mjs"') {
  const d = tmpDir('pmchecks-');
  fs.mkdirSync(path.join(d, 'checks'));
  fs.writeFileSync(path.join(d, 'checks', 'check.mjs'), [
    "import fs from 'node:fs';",
    "import path from 'node:path';",
    "const text = fs.readFileSync(path.join(process.env.HOLDOUT_TARGET, 'src', 'x.txt'), 'utf8');",
    "process.exit(text.trim() === 'ok' && process.cwd() === fs.realpathSync(process.env.HOLDOUT_TARGET) ? 0 : 1);",
    '',
  ].join('\n'));
  if (run !== null) fs.writeFileSync(path.join(d, 'RUN'), `${run}\n`);
  return d;
}

const cli = (args) => {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', windowsHide: true });
  let out = null;
  try { out = JSON.parse(r.stdout.trim().split('\n').at(-1)); } catch { out = null; }
  return { status: r.status, out, stderr: r.stderr };
};

test('holdout: store commits the checks to a private ref without touching the working tree or index', () => {
  const d = repo();
  const r = cli(['store', 'S1-2', checks(), '--root', d]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.out.ref, REF);
  assert.deepEqual(gitIn(d, ['ls-tree', '-r', '--name-only', REF]).trim().split('\n').sort(), ['RUN', 'checks/check.mjs']);
  assert.equal(gitIn(d, ['status', '--porcelain', '--untracked-files=all']), '');
  assert.equal(gitIn(d, ['branch', '--show-current']).trim(), 'main');
  assert.equal(gitIn(d, ['log', '--oneline', 'main']).trim().split('\n').length, 1, 'no commit on the branch');
});

test('holdout: a second store keeps the first as its parent', () => {
  const d = repo();
  cli(['store', 'S1-2', checks(), '--root', d]);
  const first = gitIn(d, ['rev-parse', REF]).trim();
  assert.equal(cli(['store', 'S1-2', checks('node "{holdout}/checks/check.mjs" --again'), '--root', d]).status, 0);
  assert.equal(gitIn(d, ['rev-parse', `${REF}^`]).trim(), first);
});

test('holdout: the ref is visible from a linked worktree, where run judges that worktree', () => {
  const d = repo();
  cli(['store', 'S1-2', checks(), '--root', d]);
  const wt = path.join(tmpDir('pmwt-'), 'story');
  gitIn(d, ['worktree', 'add', '-q', '-b', 'pm/S1-2-x', wt]);
  const r = cli(['run', 'S1-2', '--target', wt, '--root', wt]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.out.verdict, 'pass');
});

test('holdout: run materialises outside the repository, passes or fails with the checks, and deletes the copy', () => {
  const d = repo();
  cli(['store', 'S1-2', checks(), '--root', d]);
  const pass = cli(['run', 'S1-2', '--target', d, '--root', d]);
  assert.equal(pass.status, 0, pass.stderr);
  assert.equal(pass.out.verdict, 'pass');
  assert.ok(!pass.out.dir.startsWith(d), 'materialised outside the repository');
  assert.ok(!fs.existsSync(pass.out.dir), 'temp copy deleted');
  fs.writeFileSync(path.join(d, 'src', 'x.txt'), 'broken\n');
  const fail = cli(['run', 'S1-2', '--target', d, '--root', d]);
  assert.equal(fail.status, 1);
  assert.equal(fail.out.verdict, 'fail');
  assert.ok(!fs.existsSync(fail.out.dir));
});

test('holdout: a run that outlives --timeout fails as timed out', () => {
  const d = repo();
  cli(['store', 'S1-2', checks('node -e "setTimeout(() => {}, 30000)"'), '--root', d]);
  const started = Date.now();
  const r = cli(['run', 'S1-2', '--target', d, '--root', d, '--timeout', '1']);
  assert.equal(r.status, 1);
  assert.equal(r.out.verdict, 'fail');
  assert.equal(r.out.timedOut, true);
  assert.ok(Date.now() - started < 20000, 'killed at the timeout');
  assert.equal(cli(['run', 'S1-2', '--target', d, '--root', d, '--timeout', 'soon']).status, 64);
});

test('holdout: a timeout kills the whole process tree before cleanup', { skip: process.platform === 'win32' && 'POSIX shell syntax in RUN' }, async () => {
  const d = repo();
  const dir = checks('node "{holdout}/slow.mjs"; true');
  fs.writeFileSync(path.join(dir, 'slow.mjs'), "import fs from 'node:fs';\nimport path from 'node:path';\nsetTimeout(() => fs.writeFileSync(path.join(process.env.HOLDOUT_TARGET, 'late.txt'), 'survived'), 2000);\n");
  cli(['store', 'S1-2', dir, '--root', d]);
  const r = cli(['run', 'S1-2', '--target', d, '--root', d, '--timeout', '1']);
  assert.equal(r.status, 1);
  assert.equal(r.out.timedOut, true);
  await new Promise((done) => setTimeout(done, 3000));
  assert.ok(!fs.existsSync(path.join(d, 'late.txt')), 'the chained child was killed');
});

test('holdout: a blank RUN is refused by store and by run', () => {
  const d = repo();
  assert.equal(cli(['store', 'S1-2', checks('   '), '--root', d]).status, 64);
  // A ref written by hand with a blank RUN.
  const blob = spawnSync('git', ['-C', d, 'hash-object', '-w', '--stdin'], { input: '\n', encoding: 'utf8' }).stdout.trim();
  const tree = spawnSync('git', ['-C', d, 'mktree'], { input: `100644 blob ${blob}\tRUN\n`, encoding: 'utf8' }).stdout.trim();
  const commit = gitIn(d, ['commit-tree', tree, '-m', 'blank']).trim();
  gitIn(d, ['update-ref', REF, commit]);
  const r = cli(['run', 'S1-2', '--target', d, '--root', d]);
  assert.equal(r.status, 64);
  assert.match(r.stderr, /RUN/);
});

test('holdout: check reports a missing ref with exit 66 so the PM regenerates the checks', () => {
  const d = repo();
  const missing = cli(['check', 'S1-2', '--root', d]);
  assert.equal(missing.status, 66);
  assert.match(missing.stderr, /regenerate/);
  assert.equal(cli(['run', 'S1-2', '--target', d, '--root', d]).status, 66);
  cli(['store', 'S1-2', checks(), '--root', d]);
  assert.equal(cli(['check', 'S1-2', '--root', d]).status, 0);
});

test('holdout: usage errors exit 64', () => {
  const d = repo();
  assert.equal(cli([]).status, 64);
  assert.equal(cli(['store', 'S1-2', checks(null), '--root', d]).status, 64, 'no RUN file');
  assert.equal(cli(['store', '../x', checks(), '--root', d]).status, 64, 'bad story id');
  assert.equal(cli(['store', 'S1-2', path.join(d, 'nope'), '--root', d]).status, 64, 'missing directory');
  assert.equal(cli(['run', 'S1-2', '--root', d]).status, 64, 'run needs --target');
  assert.equal(cli(['bogus', 'S1-2', '--root', d]).status, 64);
});
