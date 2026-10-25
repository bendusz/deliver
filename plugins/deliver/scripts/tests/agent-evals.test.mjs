import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpDir, PLUGIN_ROOT } from './helpers.mjs';
import { EVAL_ROOT, loadCases, listCases, manifest, verdictOf, score, compare } from '../agent-evals.mjs';

const SCRIPT = path.join(PLUGIN_ROOT, 'scripts', 'agent-evals.mjs');
const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', windowsHide: true });
const CASES = {
  trials: 3,
  cases: [
    { id: 'a', agent: 'rev', split: 'dev', kind: 'seeded', expect: { verdicts: ['FAIL'], must_match: ['inject'] } },
    { id: 'b', agent: 'rev', split: 'heldout', kind: 'seeded', expect: { verdicts: ['FAIL'], must_match: [] } },
    { id: 'c', agent: 'rev', split: 'heldout', kind: 'clean', expect: { verdicts: ['PASS', 'CONCERNS'], must_match: [] } },
    { id: 'z', agent: 'other', split: 'dev', kind: 'clean', expect: { verdicts: ['PASS'], must_match: [] } },
  ],
};
const results = (outputs, bytes = 1000) => ({
  agent: 'rev',
  ref: 'x',
  prompt_bytes: bytes,
  runs: Object.entries(outputs).flatMap(([id, outs]) => outs.map((output, i) => ({ case: id, trial: i + 1, output }))),
});
const GOOD = { a: ['FAIL: SQL injection', 'Verdict: FAIL, injection', 'FAIL injectable'], b: ['FAIL', 'FAIL', 'FAIL'], c: ['PASS', 'CONCERNS', 'PASS'] };

test('agent-evals: every case has its fixture files, and both splits cover both agents', () => {
  const cases = loadCases();
  assert.equal(cases.cases.length, 16);
  for (const c of cases.cases) {
    const dir = path.join(EVAL_ROOT, 'fixtures', c.id);
    for (const f of ['story.md', 'diff.patch']) assert.ok(fs.existsSync(path.join(dir, f)), `${c.id}/${f}`);
    if (c.agent === 'pm-verifier') assert.ok(fs.existsSync(path.join(dir, 'repo', 'package.json')), `${c.id}/repo`);
    for (const p of c.expect.must_match) assert.doesNotThrow(() => new RegExp(p, 'i'));
  }
  for (const agent of ['code-integrity-reviewer', 'pm-verifier']) {
    for (const split of ['dev', 'heldout']) {
      const rows = cases.cases.filter((c) => c.agent === agent && c.split === split);
      assert.ok(rows.some((c) => c.kind === 'seeded') && rows.some((c) => c.kind === 'clean'), `${agent} ${split}`);
    }
  }
});

test('agent-evals: the fixtures match the frozen manifest', () => {
  assert.equal(fs.readFileSync(path.join(EVAL_ROOT, 'MANIFEST.sha256'), 'utf8'), manifest());
  assert.equal(run('manifest', '--check').status, 0);
});

test('agent-evals: a changed fixture fails the manifest check', () => {
  const copy = path.join(tmpDir('evals-'), 'agent-evals');
  fs.cpSync(EVAL_ROOT, copy, { recursive: true });
  const before = manifest(copy);
  fs.appendFileSync(path.join(copy, 'cases.json'), ' ');
  assert.notEqual(manifest(copy), before);
});

test('agent-evals: list withholds expectations and held-out cases by default', () => {
  const dev = listCases();
  assert.ok(dev.length > 0 && dev.every((c) => c.split === 'dev' && !('expect' in c)));
  assert.ok(listCases(EVAL_ROOT, { split: 'all', agent: 'pm-verifier' }).every((c) => c.agent === 'pm-verifier'));
  assert.equal(run('list', '--split', 'nope').status, 64);
});

test('agent-evals: verdictOf reads the first verdict word', () => {
  assert.equal(verdictOf('**Verdict: FAIL**\n- criterion 1: PASS'), 'FAIL');
  assert.equal(verdictOf('STATUS: UNKNOWN'), 'UNKNOWN');
  assert.equal(verdictOf('looks fine'), null);
});

test('agent-evals: score needs the verdict and every pattern, and a missing trial fails', () => {
  const s = score(CASES, results({ a: ['FAIL: SQL injection', 'FAIL: bad naming', 'PASS injection'], b: ['FAIL'], c: ['PASS', 'CONCERNS', 'FAIL'] }));
  assert.deepEqual(s.cases.map((c) => [c.id, c.passed]), [['a', 1], ['b', 1], ['c', 2]]);
  assert.deepEqual(s.heldout, { passed: 3, trials: 6 });
  assert.deepEqual(s.seeded, { passed: 2, trials: 6 });
  assert.equal(s.cases.some((c) => c.id === 'z'), false);
});

test('agent-evals: compare accepts an equal run and a smaller prompt', () => {
  const base = score(CASES, results(GOOD));
  assert.equal(compare(base, score(CASES, results(GOOD, 900))).verdict, 'ACCEPT');
});

test('agent-evals: compare rejects a held-out loss, a broken reliable case, and a grown prompt', () => {
  const base = score(CASES, results(GOOD));
  const worse = compare(base, score(CASES, results({ ...GOOD, b: ['FAIL', 'PASS', 'FAIL'] })));
  assert.equal(worse.verdict, 'REJECT');
  assert.ok(worse.reasons.some((r) => /held-out/.test(r)) && worse.reasons.some((r) => /^b passed every base trial/.test(r)));
  const grown = compare(base, score(CASES, results(GOOD, 1101)));
  assert.deepEqual([grown.verdict, grown.reasons.length], ['REJECT', 1]);
  assert.match(compare(base, score(CASES, { ...results(GOOD), prompt_bytes: undefined })).reasons[0], /prompt_bytes/);
});

test('agent-evals: the CLI scores and compares files, exiting 1 on REJECT', () => {
  const d = tmpDir('evals-cli-');
  const cases = loadCases();
  const file = (name, agent, outputFor, bytes) => {
    const runs = cases.cases.filter((c) => c.agent === agent).flatMap((c) => [1, 2, 3].map((trial) => ({ case: c.id, trial, output: outputFor(c) })));
    const p = path.join(d, name);
    fs.writeFileSync(p, JSON.stringify({ agent, ref: name, prompt_bytes: bytes, runs }));
    return p;
  };
  const blank = file('blank.json', 'pm-verifier', () => 'no verdict here', 100);
  assert.equal(JSON.parse(run('score', blank).stdout).heldout.passed, 0);
  assert.equal(run('compare', blank, blank).status, 0);
  assert.equal(run('compare', blank, file('big.json', 'pm-verifier', () => 'no verdict here', 500)).status, 1);
  assert.equal(run('score', path.join(d, 'missing.json')).status, 66);
  assert.equal(run('compare', blank).status, 64);
});

test('agent-evals: a symlinked path to the script still runs the CLI', (t) => {
  const link = path.join(tmpDir('pmlinkbin-'), 'agent-evals.mjs');
  try { fs.symlinkSync(SCRIPT, link, 'file'); } catch { t.skip('symlinks are unavailable here'); return; }
  const r = spawnSync(process.execPath, [link, 'no-such-command'], { encoding: 'utf8', windowsHide: true });
  assert.equal(r.status, 64, r.stderr);
});
