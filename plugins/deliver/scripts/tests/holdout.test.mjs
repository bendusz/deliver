import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { tmpDir, gitIn, PLUGIN_ROOT } from './helpers.mjs';

const SCRIPT = path.join(PLUGIN_ROOT, 'scripts', 'holdout.mjs');
// A project at the git top level keys its refs `_`.
const REF = 'refs/deliver/holdout/_/S1-2';
const LEGACY = 'refs/deliver/holdout/S1-2';

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

test('holdout: after RUN exits only POSIX kills the process group; Windows kills the tree only on timeout', async () => {
  const { killsAfterExit } = await import(pathToFileURL(SCRIPT).href);
  assert.equal(killsAfterExit('darwin'), true);
  assert.equal(killsAfterExit('linux'), true);
  // The pid of a process that has exited may already belong to another one, and taskkill /T
  // would kill that process and its children.
  assert.equal(killsAfterExit('win32'), false);
});

// handRef(d, ref, files): a holdout ref written by hand, bypassing store's checks.
function handRef(d, ref, files) {
  const lines = Object.entries(files).map(([name, text]) => {
    const blob = spawnSync('git', ['-C', d, 'hash-object', '-w', '--stdin'], { input: text, encoding: 'utf8' }).stdout.trim();
    return `100644 blob ${blob}\t${name}\n`;
  });
  const tree = spawnSync('git', ['-C', d, 'mktree'], { input: lines.join(''), encoding: 'utf8' }).stdout.trim();
  gitIn(d, ['update-ref', ref, gitIn(d, ['commit-tree', tree, '-m', 'by hand']).trim()]);
}

test('holdout: a multiline RUN is refused by store, check, and run, and nothing runs', () => {
  const d = repo();
  const multi = checks('node -e "process.exit(0)"\nnode -e "process.exit(1)"');
  const stored = cli(['store', 'S1-2', multi, '--root', d]);
  assert.equal(stored.status, 64, 'store refuses a second line');
  assert.match(stored.stderr, /one line/);
  assert.equal(spawnSync('git', ['-C', d, 'rev-parse', '--verify', '--quiet', REF]).status, 1, 'no ref written');
  handRef(d, REF, { RUN: 'node -e "require(\'fs\').writeFileSync(\'ran.txt\', \'x\')"\nnode -e "process.exit(1)"\n' });
  assert.equal(cli(['check', 'S1-2', '--root', d]).status, 64, 'check refuses a multiline RUN');
  const r = cli(['run', 'S1-2', '--target', d, '--root', d]);
  assert.equal(r.status, 64, 'run refuses it rather than running the first line');
  assert.match(r.stderr, /one line/);
  assert.ok(!fs.existsSync(path.join(d, 'ran.txt')), 'no line of it ran');
  handRef(d, REF, { RUN: '  \n' });
  assert.equal(cli(['check', 'S1-2', '--root', d]).status, 64, 'check refuses a blank RUN');
  assert.equal(cli(['store', 'S1-2', checks('\n\n'), '--root', d]).status, 64, 'store refuses a blank RUN');
});

// twoProjects(): one repository holding deliver projects a/ and nested/b/, plus the root.
function twoProjects() {
  const d = repo();
  for (const p of ['a', path.join('nested', 'b')]) {
    fs.mkdirSync(path.join(d, p, 'src'), { recursive: true });
    fs.writeFileSync(path.join(d, p, 'src', 'x.txt'), 'ok\n');
  }
  gitIn(d, ['add', '-A']);
  gitIn(d, ['commit', '-qm', 'projects']);
  return { d, a: path.join(d, 'a'), b: path.join(d, 'nested', 'b') };
}

test('holdout: refs are namespaced by project, so two projects keep their own S1-1', () => {
  const { d, a, b } = twoProjects();
  const sa = cli(['store', 'S1-1', checks('node -e "process.exit(1)"'), '--root', a]);
  const sb = cli(['store', 'S1-1', checks('node -e "process.exit(0)"'), '--root', b]);
  assert.equal(sa.status, 0, sa.stderr);
  assert.equal(sb.status, 0, sb.stderr);
  assert.match(sa.out.ref, /^refs\/deliver\/holdout\/a_[0-9a-f]{8}\/S1-1$/);
  assert.match(sb.out.ref, /^refs\/deliver\/holdout\/nested-b_[0-9a-f]{8}\/S1-1$/);
  assert.notEqual(sa.out.ref, sb.out.ref);
  const ra = cli(['run', 'S1-1', '--target', a, '--root', a]);
  assert.equal(ra.status, 1, 'project A runs its own failing checks');
  assert.equal(ra.out.verdict, 'fail');
  const rb = cli(['run', 'S1-1', '--target', b, '--root', b]);
  assert.equal(rb.status, 0, rb.stderr);
  assert.equal(cli(['check', 'S1-1', '--root', d]).status, 66, 'the root project has no S1-1');
});

test('holdout: --target must lie inside the owning project', () => {
  const { a, b } = twoProjects();
  const stored = cli(['store', 'S1-1', checks('node -e "process.exit(0)"'), '--root', a]);
  assert.equal(stored.status, 0, stored.stderr);
  assert.equal(cli(['run', 'S1-1', '--target', b, '--root', a]).status, 64, 'another project');
  assert.equal(cli(['run', 'S1-1', '--target', tmpDir('pmelse-'), '--root', a]).status, 64, 'outside the repository');
  assert.equal(cli(['run', 'S1-1', '--target', path.join(a, 'src'), '--root', a]).status, 0, 'inside the project');
});

test('holdout: run from a project below the git top level materialises RUN and passes', () => {
  const { b } = twoProjects();
  const dir = checks();
  assert.equal(cli(['store', 'S1-2', dir, '--root', b]).status, 0);
  const r = cli(['run', 'S1-2', '--target', b, '--root', b]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.out.verdict, 'pass');
  // And from a linked worktree of the whole repository, judging that worktree's copy of the project.
  const wt = path.join(tmpDir('pmwt-'), 'story');
  gitIn(path.dirname(path.dirname(b)), ['worktree', 'add', '-q', '-b', 'pm/S1-2-x', wt]);
  const inWt = path.join(wt, 'nested', 'b');
  const w = cli(['run', 'S1-2', '--target', inWt, '--root', inWt]);
  assert.equal(w.status, 0, w.stderr);
});

test('holdout: a root project still reads the legacy unnamespaced ref, with a note; a nested one does not', () => {
  const { d, b } = twoProjects();
  handRef(d, LEGACY, { RUN: 'node -e "process.exit(0)"\n' });
  const c = cli(['check', 'S1-2', '--root', d]);
  assert.equal(c.status, 0, c.stderr);
  assert.equal(c.out.ref, LEGACY);
  assert.match(c.stderr, /legacy/);
  assert.equal(cli(['run', 'S1-2', '--target', d, '--root', d]).status, 0);
  assert.equal(cli(['check', 'S1-2', '--root', b]).status, 66);
});

test('holdout: a project directory whose name starts with .. is still inside the repository', () => {
  const d = repo();
  const odd = path.join(d, '..odd');
  fs.mkdirSync(path.join(odd, 'src'), { recursive: true });
  fs.writeFileSync(path.join(odd, 'src', 'x.txt'), 'ok\n');
  const r = cli(['store', 'S1-2', checks(), '--root', odd]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.out.ref, /^refs\/deliver\/holdout\/odd_[0-9a-f]{8}\/S1-2$/);
  const run = cli(['run', 'S1-2', '--target', odd, '--root', odd]);
  assert.equal(run.status, 0, run.stderr);
});

test('holdout: only a bad stored RUN names RUN in its exit-64 message, so the PM regenerates for that alone', () => {
  const { a, b } = twoProjects();
  const stored = cli(['store', 'S1-1', checks('node -e "process.exit(0)"'), '--root', a]);
  assert.equal(stored.status, 0, stored.stderr);
  const bad = cli(['run', 'S1-1', '--target', b, '--root', a]);
  assert.equal(bad.status, 64);
  assert.doesNotMatch(bad.stderr, /\bRUN\b/, 'a wrong --target is the command\'s mistake');
  handRef(path.dirname(a), `refs/deliver/holdout/_/S1-1`, { RUN: 'a\nb\n' });
  const multi = cli(['run', 'S1-1', '--target', path.dirname(a), '--root', path.dirname(a)]);
  assert.equal(multi.status, 64);
  assert.match(multi.stderr, /\bRUN\b/);
});
