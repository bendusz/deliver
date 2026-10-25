import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpDir, gitIn, PLUGIN_ROOT } from './helpers.mjs';

const SCRIPT = path.join(PLUGIN_ROOT, 'scripts', 'test-integrity.mjs');

// Markers are assembled so this file never carries a literal skip marker of its own.
const SKIP = '.' + 'skip(';
const ONLY = '.' + 'only(';

const TEST_JS = [
  "import { test } from 'node:test';",
  "import assert from 'node:assert/strict';",
  "test('adds', () => { assert.equal(1 + 1, 2); });",
  "test('subtracts', () => { assert.equal(2 - 1, 1); });",
  '',
].join('\n');

// repo(baseFiles, change): a repository whose `main` holds baseFiles and whose `story` branch
// applies change(dir) on top as one commit. Returns the directory.
function repo(baseFiles, change) {
  const d = tmpDir('pmintegrity-');
  gitIn(d, ['init', '-q', '-b', 'main']);
  gitIn(d, ['config', 'user.email', 'integrity@example.com']);
  gitIn(d, ['config', 'user.name', 'Integrity Tests']);
  gitIn(d, ['config', 'commit.gpgsign', 'false']);
  write(d, { 'README.md': 'fixture\n', ...baseFiles });
  gitIn(d, ['add', '-A']);
  gitIn(d, ['commit', '-qm', 'base']);
  gitIn(d, ['checkout', '-qb', 'story']);
  change(d);
  gitIn(d, ['add', '-A']);
  gitIn(d, ['commit', '-qm', 'story', '--allow-empty']);
  return d;
}

function write(d, files) {
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(d, rel)), { recursive: true });
    fs.writeFileSync(path.join(d, rel), text);
  }
}

function run(d, extra = []) {
  const r = spawnSync(process.execPath, [SCRIPT, 'main', 'story', '--root', d, ...extra], { encoding: 'utf8', windowsHide: true });
  let out = null;
  try { out = JSON.parse(r.stdout); } catch { out = null; }
  return { status: r.status, out, stderr: r.stderr };
}

const kinds = (r) => r.out.findings.map((f) => f.kind);

test('integrity: a clean diff passes', () => {
  const d = repo({ 'src/math.js': 'export const add = (a, b) => a + b;\n', 'src/math.test.js': TEST_JS }, (dir) => {
    write(dir, {
      'src/math.js': 'export const add = (a, b) => a + b;\nexport const sub = (a, b) => a - b;\n',
      'src/math.test.js': TEST_JS + "test('more', () => { assert.equal(3, 3); });\n",
    });
  });
  const r = run(d);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.out, { verdict: 'pass', findings: [] });
});

test('integrity: a deleted test file fails as test-deleted', () => {
  const d = repo({ 'tests/test_math.py': 'def test_add():\n    assert 1 + 1 == 2\n' }, (dir) => fs.rmSync(path.join(dir, 'tests', 'test_math.py')));
  const r = run(d);
  assert.equal(r.status, 1);
  assert.equal(r.out.verdict, 'fail');
  assert.deepEqual(kinds(r), ['test-deleted']);
  assert.equal(r.out.findings[0].path, 'tests/test_math.py');
});

test('integrity: a test file renamed out of every test path fails as test-deleted', () => {
  const d = repo({ 'pkg/calc_test.go': 'package pkg\n\nfunc TestAdd(t *testing.T) {\n\tif 1+1 != 2 {\n\t\tt.Error("bad")\n\t}\n}\n' }, (dir) => {
    fs.renameSync(path.join(dir, 'pkg', 'calc_test.go'), path.join(dir, 'pkg', 'calc_old.go'));
  });
  const r = run(d);
  assert.equal(r.status, 1);
  assert.ok(kinds(r).includes('test-deleted'), JSON.stringify(r.out));
});

test('integrity: an added skip or focus marker fails as skip-added', () => {
  const d = repo({ 'src/math.test.js': TEST_JS }, (dir) => {
    write(dir, { 'src/math.test.js': TEST_JS.replace("test('adds'", `test${SKIP}'adds'`).replace("test('subtracts'", `test${ONLY}'subtracts'`) });
  });
  const r = run(d);
  assert.equal(r.status, 1);
  assert.deepEqual(kinds(r), ['skip-added']);
  assert.match(r.out.findings[0].detail, /^2 /);
});

test('integrity: framework markers outside JavaScript count too', () => {
  const marks = ['@pytest.mark.' + 'skip', '@pytest.mark.' + 'xfail', '#[' + 'ignore]', '@' + 'Disabled', 't.' + 'Skip("later")'];
  for (const m of marks) {
    const d = repo({ 'src/lib.rs': 'fn a() {}\n' }, (dir) => write(dir, { 'src/lib.rs': `fn a() {}\n${m}\n` }));
    assert.deepEqual(kinds(run(d)), ['skip-added'], m);
  }
});

test('integrity: a bare skip call outside a test file is not a skip marker', () => {
  const d = repo({ 'src/iter.rs': 'fn a() {}\n' }, (dir) => write(dir, { 'src/iter.rs': `fn a() { v.iter()${SKIP}1); }\n` }));
  assert.equal(run(d).status, 0);
});

test('integrity: fewer assertions in a modified test file fails as assertions-dropped', () => {
  const d = repo({ 'src/math.test.js': TEST_JS }, (dir) => {
    write(dir, { 'src/math.test.js': TEST_JS.replace('assert.equal(2 - 1, 1);', '/* checked by hand */') });
  });
  const r = run(d);
  assert.equal(r.status, 1);
  assert.deepEqual(kinds(r), ['assertions-dropped']);
  assert.match(r.out.findings[0].detail, /from 2 to 1/);
});

test('integrity: a lowered coverage threshold fails as config-weakened', () => {
  const base = "export default { coverageThreshold: { global: { branches: 80, lines: 90 } } };\n";
  const d = repo({ 'jest.config.js': base }, (dir) => write(dir, { 'jest.config.js': base.replace('lines: 90', 'lines: 60') }));
  const r = run(d);
  assert.equal(r.status, 1);
  assert.deepEqual(kinds(r), ['config-weakened']);
  assert.match(r.out.findings[0].detail, /lines lowered from 90 to 60/);
});

test('integrity: a lint rule turned off or to warn fails as config-weakened', () => {
  const base = JSON.stringify({ rules: { 'no-console': 'error', eqeqeq: ['error', 'always'] } }, null, 2);
  const d = repo({ '.eslintrc.json': base }, (dir) => write(dir, { '.eslintrc.json': base.replace('"no-console": "error"', '"no-console": "off"').replace('"error",\n      "always"', '"warn",\n      "always"') }));
  const r = run(d);
  assert.equal(r.status, 1);
  assert.deepEqual(r.out.findings.map((f) => f.detail).sort(), ['lint rule eqeqeq downgraded', 'lint rule no-console downgraded']);
});

test('integrity: tsconfig strict turned false fails as config-weakened', () => {
  const base = '{\n  "compilerOptions": { "strict": true, "noImplicitAny": true }\n}\n';
  const d = repo({ 'tsconfig.json': base }, (dir) => write(dir, { 'tsconfig.json': base.replace('"strict": true', '"strict": false') }));
  const r = run(d);
  assert.deepEqual(kinds(r), ['config-weakened']);
  assert.match(r.out.findings[0].detail, /strict turned from true to false/);
});

test('integrity: a lowered pinned toolchain fails as config-weakened, a raised one passes', () => {
  const down = repo({ '.nvmrc': '22.4.0\n', 'go.mod': 'module x\n\ngo 1.22\n' }, (dir) => write(dir, { '.nvmrc': '20.11.0\n', 'go.mod': 'module x\n\ngo 1.21\n' }));
  const r = run(down);
  assert.equal(r.status, 1);
  assert.deepEqual(r.out.findings.map((f) => f.path).sort(), ['.nvmrc', 'go.mod']);
  const up = repo({ '.nvmrc': '20.11.0\n' }, (dir) => write(dir, { '.nvmrc': '22.4.0\n' }));
  assert.equal(run(up).status, 0);
});

test('integrity: engines.node lowered in package.json fails as config-weakened', () => {
  const pkg = (v) => JSON.stringify({ name: 'x', engines: { node: v } }, null, 2) + '\n';
  const d = repo({ 'package.json': pkg('>=22') }, (dir) => write(dir, { 'package.json': pkg('>=18') }));
  assert.deepEqual(kinds(run(d)), ['config-weakened']);
});

test('integrity: any change under a --protected path fails as protected-changed', () => {
  const d = repo({ 'tests/acceptance/login.test.js': TEST_JS, 'src/app.js': 'x\n' }, (dir) => {
    write(dir, { 'tests/acceptance/login.test.js': TEST_JS + "test('extra', () => { assert.ok(true); });\n", 'src/app.js': 'y\n' });
  });
  const r = run(d, ['--protected', 'tests/acceptance/', 'docs/none.md']);
  assert.equal(r.status, 1);
  assert.deepEqual(kinds(r), ['protected-changed']);
  assert.equal(r.out.findings[0].path, 'tests/acceptance/login.test.js');
  assert.equal(run(d).status, 0, 'without --protected the same diff passes');
});

test('integrity: --protected-base judges protected paths from the acceptance commit', () => {
  // The acceptance tests land on the story branch first; only later changes to them count.
  const d = repo({}, (dir) => write(dir, { 'tests/acceptance/a.test.js': TEST_JS }));
  const acceptance = gitIn(d, ['rev-parse', 'story']).trim();
  const prot = ['--protected', 'tests/acceptance', '--protected-base', acceptance];
  write(d, { 'src/app.js': 'built\n' });
  gitIn(d, ['add', '-A']);
  gitIn(d, ['commit', '-qm', 'build']);
  assert.equal(run(d, prot).status, 0, 'building beside the protected tests passes');
  write(d, { 'tests/acceptance/a.test.js': TEST_JS.replace('2 - 1, 1', '2 - 1, 2') });
  gitIn(d, ['commit', '-qam', 'loosen']);
  const r = run(d, prot);
  assert.equal(r.status, 1);
  assert.deepEqual(kinds(r), ['protected-changed']);
});

test('integrity: --allow suppresses a declared kind and only that kind', () => {
  const d = repo({ 'tests/test_math.py': 'def test_add():\n    assert True\n', 'tsconfig.json': '{ "compilerOptions": { "strict": true } }\n' }, (dir) => {
    fs.rmSync(path.join(dir, 'tests', 'test_math.py'));
    write(dir, { 'tsconfig.json': '{ "compilerOptions": { "strict": false } }\n' });
  });
  const partial = run(d, ['--allow', 'test-deleted']);
  assert.equal(partial.status, 1);
  assert.deepEqual(kinds(partial), ['config-weakened']);
  const both = run(d, ['--allow', 'test-deleted', 'config-weakened']);
  assert.equal(both.status, 0);
  assert.deepEqual(both.out, { verdict: 'pass', findings: [] });
});

test('integrity: only the story side of the diff counts, not integration-branch history', () => {
  const d = repo({ 'tests/a.test.js': TEST_JS }, (dir) => write(dir, { 'src/new.js': 'x\n' }));
  gitIn(d, ['checkout', '-q', 'main']);
  fs.rmSync(path.join(d, 'tests', 'a.test.js'));
  gitIn(d, ['commit', '-qam', 'integration removed a test']);
  assert.equal(run(d).status, 0);
});

// --- fix round 1 ---

test('integrity: deleting a coverage, lint, tsconfig, or toolchain config is config-weakened', () => {
  const files = {
    '.eslintrc.json': '{ "rules": { "no-console": "error" } }\n',
    'tsconfig.json': '{ "compilerOptions": { "strict": true } }\n',
    '.nvmrc': '22\n',
    'jest.config.js': 'export default { coverageThreshold: { global: { lines: 90 } } };\n',
    'biome.json': '{ "linter": { "rules": { "style": { "noVar": "error" } } } }\n',
  };
  for (const [rel, text] of Object.entries(files)) {
    const d = repo({ [rel]: text }, (dir) => fs.rmSync(path.join(dir, rel)));
    const r = run(d);
    assert.deepEqual(kinds(r), ['config-weakened'], rel);
  }
});

test('integrity: deleting a shared config file with no thresholds or rules in it passes', () => {
  const d = repo({ 'setup.cfg': '[metadata]\nname = x\n' }, (dir) => fs.rmSync(path.join(dir, 'setup.cfg')));
  assert.equal(run(d).status, 0);
});

test('integrity: a rename that drops the collected test name is test-deleted, even inside tests/', () => {
  const cases = [['tests/test_math.py', 'tests/math.py'], ['tests/calc_test.go', 'tests/calc.go'], ['tests/a.test.js', 'tests/a.js']];
  for (const [from, to] of cases) {
    const d = repo({ [from]: 'body that stays the same across the rename\n'.repeat(5) }, (dir) => fs.renameSync(path.join(dir, from), path.join(dir, to)));
    assert.deepEqual(kinds(run(d)), ['test-deleted'], from);
  }
  const ok = repo({ 'tests/test_a.py': 'same body\n'.repeat(5) }, (dir) => fs.renameSync(path.join(dir, 'tests/test_a.py'), path.join(dir, 'tests/test_b.py')));
  assert.equal(run(ok).status, 0, 'a rename between collected names passes');
});

test('integrity: a skip split across lines still counts', () => {
  const d = repo({ 'src/math.test.js': TEST_JS }, (dir) => write(dir, { 'src/math.test.js': TEST_JS.replace("test('adds'", "test.\n  skip('adds'") }));
  assert.deepEqual(kinds(run(d)), ['skip-added']);
});

test('integrity: the wider marker list is recognised in test files', () => {
  const js = ['test.skip.each([1])', 'it.only.each([1])', 'test.skipIf(true)', 'it.skipIf(true)', "test('a', { skip: true }, () => {})", "test('a', { todo: true }, () => {})", "test('a', { only: true }, () => {})", "fit('a', () => {})", "fdescribe('a', () => {})", "test.fixme('a', () => {})"];
  for (const m of js) {
    const d = repo({ 'src/math.test.js': TEST_JS }, (dir) => write(dir, { 'src/math.test.js': `${TEST_JS}${m};\n` }));
    assert.deepEqual(kinds(run(d)), ['skip-added'], m);
  }
  const py = ['@unittest.skip("later")\ndef test_b():\n    pass', 'def test_c(self):\n    self.skipTest("later")', 'def test_d():\n    pytest.skip("later")'];
  const PY = 'def test_a():\n    assert 1 == 1\n';
  for (const m of py) {
    const d = repo({ 'tests/test_x.py': PY }, (dir) => write(dir, { 'tests/test_x.py': `${PY}\n${m}\n` }));
    assert.deepEqual(kinds(run(d)), ['skip-added'], m);
  }
});

test('integrity: a fit method call, or a marker inside a comment or string, is not a skip', () => {
  const extra = "const model = { fit() {} };\nmodel.fit();\n// test.skip('later')\nconst note = \"it.only(\";\n";
  const d = repo({ 'src/math.test.js': TEST_JS }, (dir) => write(dir, { 'src/math.test.js': TEST_JS + extra }));
  assert.equal(run(d).status, 0, JSON.stringify(run(d).out));
});

test('integrity: commenting out an assertion drops it; an assertion inside a string never counted', () => {
  const commented = repo({ 'src/math.test.js': TEST_JS }, (dir) => write(dir, { 'src/math.test.js': TEST_JS.replace('assert.equal(2 - 1, 1);', '/* assert.equal(2 - 1, 1); */') }));
  assert.deepEqual(kinds(run(commented)), ['assertions-dropped']);
  const PY = 'def test_a():\n    assert 1 == 1\n    assert 2 == 2\n';
  const py = repo({ 'tests/test_x.py': PY }, (dir) => write(dir, { 'tests/test_x.py': PY.replace('    assert 2 == 2', '    # assert 2 == 2') }));
  assert.deepEqual(kinds(run(py)), ['assertions-dropped']);
  const stringy = TEST_JS.replace("test('adds'", "const doc = 'assert.equal(9, 9)';\ntest('adds'");
  const str = repo({ 'src/math.test.js': stringy }, (dir) => write(dir, { 'src/math.test.js': stringy.replace("const doc = 'assert.equal(9, 9)';\n", '') }));
  assert.equal(run(str).status, 0, 'removing a string that mentions assert drops no assertion');
});

test('integrity: absolute or traversing --protected paths are usage errors', () => {
  const d = repo({}, () => {});
  for (const bad of [path.join(d, 'tests'), '../tests', 'tests/../../x', 'C:\\tests']) {
    const r = spawnSync(process.execPath, [SCRIPT, 'main', 'story', '--root', d, '--protected', bad], { encoding: 'utf8', windowsHide: true });
    assert.equal(r.status, 64, bad);
  }
});

// --- fix round 2 ---

test('integrity: an added lint config that turns rules off, or a coverage config at 0, is config-weakened', () => {
  const off = repo({}, (dir) => write(dir, { 'src/legacy/.eslintrc.json': '{ "rules": { "no-console": "off", "eqeqeq": 0 } }\n' }));
  assert.deepEqual(kinds(run(off)), ['config-weakened', 'config-weakened']);
  const zero = repo({}, (dir) => write(dir, { 'jest.config.js': 'export default { coverageThreshold: { global: { lines: 0 } } };\n' }));
  assert.deepEqual(kinds(run(zero)), ['config-weakened']);
  const strict = repo({}, (dir) => write(dir, { '.eslintrc.json': '{ "rules": { "no-console": "error" } }\n' }));
  assert.equal(run(strict).status, 0, 'an added config that only enables rules passes');
});

// Assembled so this file carries none of the pragmas it tests.
const P = (...parts) => parts.join('');
const PRAGMAS = [
  ['src/a.js', P('// eslint', '-disable-next-line no-console\n')],
  ['src/a.js', P('/* istanbul', ' ignore next */\n')],
  ['src/a.js', P('/* c8', ' ignore next */\n')],
  ['src/a.ts', P('// @ts', '-ignore\n')],
  ['src/a.ts', P('// @ts', '-nocheck\n')],
  ['src/a.py', P('x = 1  # pragma:', ' no cover\n')],
  ['src/a.py', P('x = f()  # type:', ' ignore\n')],
  ['src/a.rs', P('#[al', 'low(dead_code)]\n')],
  ['src/a.go', P('x := 1 //no', 'lint\n')],
];

test('integrity: each added disable or ignore pragma is pragma-added, and --allow takes it', () => {
  for (const [rel, line] of PRAGMAS) {
    const d = repo({ [rel]: 'code\n' }, (dir) => write(dir, { [rel]: `code\n${line}` }));
    const r = run(d);
    assert.deepEqual(kinds(r), ['pragma-added'], line);
    assert.equal(run(d, ['--allow', 'pragma-added']).status, 0, line);
  }
});

test('integrity: a pragma moved within its file is not added', () => {
  const [rel, line] = PRAGMAS[0];
  const d = repo({ [rel]: `${line}a\nb\n` }, (dir) => write(dir, { [rel]: `a\n${line}b\n` }));
  assert.equal(run(d).status, 0);
});

test('integrity: a strict-family flag set false under strict true is config-weakened', () => {
  const base = '{ "compilerOptions": { "strict": true } }\n';
  for (const flag of ['noImplicitAny', 'strictNullChecks', 'strictFunctionTypes']) {
    const d = repo({ 'tsconfig.json': base }, (dir) => write(dir, { 'tsconfig.json': base.replace('"strict": true', `"strict": true, "${flag}": false`) }));
    const r = run(d);
    assert.deepEqual(kinds(r), ['config-weakened'], flag);
    assert.match(r.out.findings[0].detail, new RegExp(flag));
  }
});

// --- fix round 3 ---

test('integrity: commenting out an enforced config setting counts as removing it', () => {
  const cases = [
    ['tsconfig.json', '{\n  "compilerOptions": {\n    "strict": true\n  }\n}\n', (t) => t.replace('"strict": true', '// "strict": true')],
    ['tsconfig.json', '{\n  "compilerOptions": {\n    "strict": true\n  }\n}\n', (t) => t.replace('"strict": true', '/* "strict": true */')],
    ['eslint.config.js', "export default [{ rules: {\n  'no-console': 'error',\n} }];\n", (t) => t.replace("  'no-console'", "  // 'no-console'")],
    ['pyproject.toml', '[tool.coverage.report]\nfail_under = 80\n', (t) => t.replace('fail_under', '# fail_under')],
    ['.nycrc.yml', 'check-coverage: true\nlines: 90\n', (t) => t.replace('lines: 90', '# lines: 90')],
  ];
  for (const [rel, before, edit] of cases) {
    const d = repo({ [rel]: before }, (dir) => write(dir, { [rel]: edit(before) }));
    assert.deepEqual(kinds(run(d)), ['config-weakened'], `${rel}: ${edit(before)}`);
  }
});

test('integrity: a comment that only mentions a setting changes nothing', () => {
  const before = '{\n  "compilerOptions": {\n    "strict": true\n  }\n}\n';
  const d = repo({ 'tsconfig.json': before }, (dir) => write(dir, { 'tsconfig.json': before.replace('{\n', '{\n  // was "strict": false once\n') }));
  assert.equal(run(d).status, 0);
});

test('integrity: pragmas in Markdown and docs are prose, not pragmas', () => {
  const line = P('Use `// eslint', '-disable-next-line` sparingly.\n');
  for (const rel of ['README.md', 'docs/guide.txt', 'notes.rst']) {
    const d = repo({ [rel]: 'x\n' }, (dir) => write(dir, { [rel]: `x\n${line}` }));
    assert.equal(run(d).status, 0, rel);
  }
});

test('integrity: usage errors exit 64', () => {
  const d = repo({}, () => {});
  const usage = (args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', windowsHide: true }).status;
  assert.equal(usage([]), 64);
  assert.equal(usage(['main']), 64);
  assert.equal(usage(['main', 'story', '--root', d, '--bogus']), 64);
  assert.equal(usage(['main', 'story', '--root', d, '--allow', 'not-a-kind']), 64);
  assert.equal(usage(['main', 'no-such-ref', '--root', d]), 64);
  assert.equal(usage(['main', 'story', '--root', tmpDir('pmnotgit-')]), 64);
  assert.equal(usage(['main', 'story', '--root', d, '--protected-base']), 64);
  assert.equal(usage(['main', 'story', '--root', d, '--protected-base', 'no-such-ref']), 64);
});

// --- WP-D follow-ups ---

test('integrity: a pragma in code under docs/ counts; prose files of every listed extension do not', () => {
  const pragma = '// eslint' + '-disable-next-line no-console\n';
  const code = repo({ 'docs/site/build.js': 'console.log(1);\n' }, (dir) => write(dir, { 'docs/site/build.js': pragma + 'console.log(1);\n' }));
  const r = run(code);
  assert.equal(r.status, 1);
  assert.deepEqual(kinds(r), ['pragma-added']);
  for (const ext of ['md', 'mdx', 'rst', 'txt', 'adoc']) {
    const prose = repo({}, (dir) => write(dir, { [`guide/notes.${ext}`]: `Use ${pragma}` }));
    assert.equal(run(prose).status, 0, ext);
  }
});

test('integrity: a repeated coverage threshold that loses an occurrence is config-weakened', () => {
  const base = "export default { projects: [{ coverageThreshold: { global: { lines: 80 } } }, { coverageThreshold: { global: { lines: 100 } } }] };\n";
  const d = repo({ 'jest.config.js': base }, (dir) => write(dir, { 'jest.config.js': "export default { projects: [{ coverageThreshold: { global: { lines: 80 } } }, {}] };\n" }));
  const r = run(d);
  assert.equal(r.status, 1);
  assert.deepEqual(kinds(r), ['config-weakened']);
  assert.match(r.out.findings[0].detail, /lines/);
});

test('integrity: renaming a config to a name with no config role is config-weakened', () => {
  const cases = [
    ['.nycrc', '.nycrc.disabled', '{ "check-coverage": true, "lines": 90, "branches": 80 }\n'],
    ['tsconfig.json', 'tsconfig.json.bak', '{ "compilerOptions": { "strict": true } }\n'],
    ['.eslintrc.json', '.eslintrc.json.off', '{ "rules": { "no-console": "error" } }\n'],
    ['.nvmrc', 'nvmrc.old', '22\n'],
  ];
  for (const [from, to, text] of cases) {
    const d = repo({ [from]: text }, (dir) => fs.renameSync(path.join(dir, from), path.join(dir, to)));
    const r = run(d);
    assert.deepEqual(kinds(r), ['config-weakened'], `${from} -> ${to}`);
    assert.equal(r.out.findings[0].path, from);
  }
});

test('integrity: a rename between two names of the same config role is judged by content', () => {
  const text = '{ "check-coverage": true, "lines": 90, "branches": 80, "functions": 80, "statements": 90 }\n';
  const same = repo({ '.nycrc': text }, (dir) => fs.renameSync(path.join(dir, '.nycrc'), path.join(dir, '.nycrc.json')));
  assert.equal(run(same).status, 0, 'same content under another coverage name passes');
  const lowered = repo({ '.nycrc': text }, (dir) => {
    fs.renameSync(path.join(dir, '.nycrc'), path.join(dir, '.nycrc.json'));
    write(dir, { '.nycrc.json': text.replace('"lines": 90', '"lines": 50') });
  });
  assert.deepEqual(kinds(run(lowered)), ['config-weakened'], 'a lowered threshold across the rename still counts');
});
