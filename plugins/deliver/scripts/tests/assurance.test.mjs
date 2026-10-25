import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync, execFileSync } from 'node:child_process';
import { tmpDir, PLUGIN_ROOT } from './helpers.mjs';
import {
  CORPUS_ROOT, CLASSES, upperBound, incBeta, loadCases, listCases, manifest, enumeratePanels,
  calc, selectTier, parseTargets, panelsDoc, staleness, readTrials, checkCase, MAX_SLOTS, ceil4,
  certifyCasesNeeded, certifyPlan, renderCalc, REVIEW_DEFAULTS, boundStaleness, parseUtc,
} from '../assurance.mjs';

const SCRIPT = path.join(PLUGIN_ROOT, 'scripts', 'assurance.mjs');
const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', windowsHide: true });
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

// An independent route to the Clopper-Pearson upper bound: the p at which P(X <= x | n, p) = 0.05,
// summing the binomial distribution directly and bisecting on p.
function binomCdf(x, n, p) {
  let lnC = 0;
  let sum = 0;
  for (let k = 0; k <= x; k += 1) {
    if (k > 0) lnC += Math.log(n - k + 1) - Math.log(k);
    sum += Math.exp(lnC + k * Math.log(p) + (n - k) * Math.log1p(-p));
  }
  return sum;
}
function binomUpper(x, n) {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 100; i += 1) {
    const mid = (lo + hi) / 2;
    if (binomCdf(x, n, mid) > 0.05) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

test('assurance: Clopper-Pearson upper bounds match known values and a binomial computation', () => {
  assert.equal(upperBound(0, 60).toFixed(4), '0.0487');
  assert.ok(Math.abs(upperBound(0, 60) - (1 - 0.05 ** (1 / 60))) < 1e-12);
  assert.equal(upperBound(2, 100).toFixed(4), '0.0616');
  assert.equal(upperBound(5, 20).toFixed(4), '0.4556');
  for (const [x, n] of [[0, 60], [2, 100], [5, 20], [1, 30], [7, 150], [0, 300], [40, 80]]) {
    assert.ok(Math.abs(upperBound(x, n) - binomUpper(x, n)) < 1e-6, `x=${x} n=${n}`);
  }
  assert.equal(upperBound(0, 0), 1);
  assert.equal(upperBound(5, 5), 1);
  assert.ok(Math.abs(incBeta(0.5, 2, 2) - 0.5) < 1e-12);
  assert.ok(Math.abs(incBeta(0.3, 1, 1) - 0.3) < 1e-12);
  assert.equal(ceil4(0.04870291), 0.0488, 'stored bounds round up, never down');
  assert.equal(ceil4(0.05), 0.05);
});

// A synthetic corpus. Seeded ids: s<n> (select), c<n> (certify). Clean ids: k<n> (select), q<n> (certify).
const corpus = ({ sel = 0, cert = 0, selClean = 0, certClean = 0 } = {}) => [
  ...Array.from({ length: sel }, (_, i) => ({ id: `s${i}`, class: 'correctness', kind: 'seeded', split: 'select' })),
  ...Array.from({ length: cert }, (_, i) => ({ id: `c${i}`, class: 'correctness', kind: 'seeded', split: 'certify' })),
  ...Array.from({ length: selClean }, (_, i) => ({ id: `k${i}`, class: 'data', kind: 'clean', split: 'select' })),
  ...Array.from({ length: certClean }, (_, i) => ({ id: `q${i}`, class: 'data', kind: 'clean', split: 'certify' })),
];
// records(lens, cases, opts): one record per case for one trial, phase taken from the case's split.
const records = (lens, cases, { miss = [], fp = [], trial = 1, tokens = 100, hash = `h-${lens}`, model = 'm', effort = 'medium', at = '2026-10-24T10:00:00.000Z', corpusHash = 'corp-1' } = {}) => cases.map((c) => ({
  lens, model, effort, promptSha256: hash, corpusSha256: corpusHash, recordedAt: at, phase: c.split, case: c.id, trial,
  caught: c.kind === 'seeded' && !miss.includes(c.id), falsePositive: c.kind === 'clean' && fp.includes(c.id), tokens,
}));
const ids = (prefix, from, to) => Array.from({ length: to - from }, (_, i) => `${prefix}${from + i}`);
const SMALL = corpus({ sel: 10, selClean: 2 });
const lookup = (recs, cases = SMALL) => {
  const r = calc(recs, cases, { T: 0.5 });
  return (key) => r.results.find((x) => x.key === key);
};

test('assurance: joint escape counts shared misses once, never the product of rates', () => {
  const panel = lookup([...records('a', SMALL, { miss: ['s1', 's2', 's3'] }), ...records('b', SMALL, { miss: ['s1', 's2', 's3'] })]);
  assert.equal(panel('ax1').escapes, 3);
  assert.equal(panel('ax1+bx1').escapes, 3, 'two lenses with the same blind spot escape together');
  assert.equal(panel('ax1+bx1').bound, upperBound(3, 10));
  const partly = lookup([...records('a', SMALL, { miss: ['s1', 's2', 's3'] }), ...records('b', SMALL, { miss: ['s1', 's2', 's4'] })]);
  assert.equal(partly('ax1+bx1').escapes, 2);
  assert.equal(partly('ax1+bx1').escapeRate, 0.2);
});

test('assurance: a lens never run on a case counts as missing it', () => {
  const specialist = records('sec', SMALL.filter((c) => c.id === 's0' || c.kind === 'clean'));
  const panel = lookup([...records('a', SMALL, { miss: ['s0', 's5'] }), ...specialist]);
  assert.equal(panel('secx1').escapes, 9);
  assert.equal(panel('ax1+secx1').escapes, 1);
});

test('assurance: a second trial counts only for a member at two trials, and only where trial 2 covers trial 1', () => {
  const panel = lookup([...records('a', SMALL, { miss: ['s1', 's2'] }), ...records('a', SMALL, { miss: ['s2'], trial: 2 })]);
  assert.equal(panel('ax1').escapes, 2);
  assert.equal(panel('ax2').escapes, 1);
  assert.equal(panel('ax2').tokens, 200);
  assert.equal(panel('ax2').slots, 2);
  const partial = lookup([...records('a', SMALL), ...records('a', SMALL.slice(0, 5), { trial: 2 })]);
  assert.equal(partial('ax2'), undefined, 'a lens whose trial 2 skips cases is never offered at two trials');
  assert.ok(partial('ax1'));
});

test('assurance: panels are every lens subset at one or two trials within the slot cap', () => {
  assert.equal(enumeratePanels(['a', 'b']).length, 8);
  assert.equal(enumeratePanels(['a', 'b'], MAX_SLOTS, new Set(['a'])).length, 5);
  const seven = enumeratePanels(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
  assert.ok(seven.every((p) => p.reduce((s, m) => s + m.trials, 0) <= MAX_SLOTS));
  assert.ok(seven.some((p) => p.length === 6));
  assert.equal(new Set(seven.map((p) => p.map((m) => `${m.lens}${m.trials}`).join())).size, seven.length);
});

// The batch 1 sizes: 35 select and 65 certify seeded cases, 10 select and 15 certify clean cases.
const TWO_STAGE = corpus({ sel: 35, cert: 65, selClean: 10, certClean: 15 });
const split = (name) => TWO_STAGE.filter((c) => c.split === name);
// twoStage: every select line, then every certify line, the order trial-record writes them in.
const twoStage = (certMissFor = {}) => {
  const sel = [];
  const cert = [];
  for (const [lens, tokens, selMiss, fp] of [['cheap', 100, ids('s', 0, 2), []], ['dear', 1000, ids('s', 2, 4), ['k0']]]) {
    sel.push(...records(lens, split('select'), { miss: selMiss, fp, tokens }));
    sel.push(...records(lens, split('select'), { miss: selMiss, fp, tokens, trial: 2 }));
    if (certMissFor[lens] !== null) cert.push(...records(lens, split('certify'), { miss: certMissFor[lens] || [], tokens }));
  }
  return [...sel, ...cert];
};

test('assurance: at the batch 1 sizes a perfect panel certifies T1 at 4.5042%', () => {
  const recs = [...records('perfect', split('select')), ...records('perfect', split('certify'))];
  const t1 = calc(recs, TWO_STAGE, { T1: 0.05 }).tiers.T1;
  assert.equal(t1.status, 'measured');
  assert.deepEqual(t1.panel, [{ lens: 'perfect', trials: 1 }]);
  assert.equal((t1.certifyBound * 100).toFixed(4), '4.5042');
  assert.equal(t1.bound, t1.certifyBound);
  assert.deepEqual([t1.selectEscapes, t1.nSelect, t1.nCertify], [0, 35, 65]);
});

test('assurance: select chooses on the observed escape rate, and certify alone gives the bound', () => {
  const r = calc(twoStage(), TWO_STAGE, { T0: 0.10, T1: 0.05 });
  assert.deepEqual(r.tiers.T0.panel, [{ lens: 'cheap', trials: 1 }], '2 of 35 is 5.7%, within 10%, and cheapest');
  assert.equal(r.tiers.T0.selectRate, 2 / 35);
  const t1 = r.tiers.T1;
  assert.deepEqual(t1.panel, [{ lens: 'cheap', trials: 1 }, { lens: 'dear', trials: 1 }], 'neither lens alone is within 5% on the select split');
  assert.equal(t1.status, 'measured');
  assert.equal(t1.certifyBound, upperBound(0, 65));
  assert.equal(t1.fpRate, 0, 'the reported false-positive rate is the certify split alone');
  assert.equal(t1.tokens, 1100);
  assert.ok(!('selectBound' in t1), 'no select-split bound is computed, so none can be quoted as assurance');
});

test('assurance: a panel lucky on the select split does not certify (selection bias)', () => {
  const r = calc(twoStage({ cheap: ids('c', 0, 40), dear: ids('c', 0, 40) }), TWO_STAGE, { T1: 0.05 });
  assert.equal(r.tiers.T1.status, 'unmeasured');
  assert.equal(r.tiers.T1.selectEscapes, 0);
  assert.equal(r.tiers.T1.certifyBound, upperBound(40, 65));
  assert.deepEqual(r.tiers.T1.panel, []);
  assert.deepEqual(r.tiers.T1.bestPanel, [{ lens: 'cheap', trials: 1 }, { lens: 'dear', trials: 1 }]);
});

test('assurance: missing or partial certify trials leave the tier unmeasured', () => {
  const missing = calc(twoStage({ dear: null }), TWO_STAGE, { T1: 0.05 });
  assert.equal(missing.tiers.T1.status, 'unmeasured');
  assert.match(missing.tiers.T1.reason, /certify/);
  assert.equal(missing.tiers.T1.bound, null, 'without certify trials there is no bound to show');
  const partial = twoStage().filter((x) => !(x.lens === 'dear' && x.case === 'c7'));
  assert.equal(calc(partial, TWO_STAGE, { T1: 0.05 }).tiers.T1.status, 'unmeasured');
});

test('assurance: a tier the certify split cannot reach is skipped, with the cases it needs', () => {
  assert.equal(certifyCasesNeeded(0.02), 149);
  assert.equal(certifyCasesNeeded(0.05), 59);
  assert.equal(certifyCasesNeeded(0.10), 29);
  for (const t of [0.02, 0.05, 0.1, 0.01, 0.2]) {
    const n = certifyCasesNeeded(t);
    assert.ok(upperBound(0, n) <= t && upperBound(0, n - 1) > t, `t=${t}`);
  }
  const r = calc(twoStage(), TWO_STAGE, { T0: 0.10, T1: 0.05, T2: 0.02 });
  assert.equal(r.tiers.T2.status, 'unmeasured');
  assert.equal(r.tiers.T2.reason, 'corpus too small: needs ≥ 149 certify cases');
  assert.equal(r.tiers.T2.certifyBound, null);
  assert.deepEqual(r.plan, [{ lens: 'cheap', trials: 1 }, { lens: 'dear', trials: 1 }]);
  assert.match(renderCalc(r), /Certify plan: cheap, dear, on every certify case/);
  const plan = certifyPlan({
    T0: { reachable: true, chosen: { panel: [{ lens: 'a', trials: 1 }] } },
    T1: { reachable: true, chosen: { panel: [{ lens: 'a', trials: 2 }, { lens: 'b', trials: 1 }] } },
    T2: { reachable: false, chosen: { panel: [{ lens: 'c', trials: 1 }] } },
    T3: { reachable: true, chosen: null },
  });
  assert.deepEqual(plan, [{ lens: 'a', trials: 2 }, { lens: 'b', trials: 1 }], 'the reachable tiers\' lenses once, at the most trials any needs');
});

test('assurance: unknown token costs rank after every priced panel, never as free', () => {
  const cases = corpus({ sel: 100, selClean: 10 });
  const recs = [...records('priced', cases, { tokens: 5000 }), ...records('unpriced', cases, { tokens: null })];
  const r = calc(recs, cases, { T1: 0.05 });
  assert.deepEqual(r.tiers.T1.bestPanel, [{ lens: 'priced', trials: 1 }]);
  assert.equal(r.results.find((x) => x.key === 'unpricedx1').tokens, null);
  const row = (key, extra) => ({ panel: [{ lens: key, trials: 1 }], key, escapes: 0, n: 35, tokens: null, fpRate: 0, members: 1, slots: 1, ...extra });
  const pick = selectTier([row('u'), row('v', { slots: 2, members: 2 }), row('x', { fpRate: 0.1 }), row('y', { escapes: 1 })], 0.05);
  assert.deepEqual(pick.panel, [{ lens: 'u', trials: 1 }], 'among unpriced panels: fewer escapes, then lower FP, then fewer slots');
});

test('assurance: a member without trials on every clean case has unknown FP and cannot be selected', () => {
  const cases = corpus({ sel: 100, selClean: 10 });
  const recs = [...records('full', cases, { tokens: 900 }), ...records('nofp', cases.filter((c) => c.kind === 'seeded'), { tokens: 10 })];
  const r = calc(recs, cases, { T1: 0.05 });
  assert.equal(r.results.find((x) => x.key === 'nofpx1').fpRate, null);
  assert.equal(r.results.find((x) => x.key === 'fullx1+nofpx1').fpRate, null);
  assert.deepEqual(r.tiers.T1.bestPanel, [{ lens: 'full', trials: 1 }]);
});

test('assurance: equal cost breaks on select escapes, then false positives, then fewer slots', () => {
  const row = (key, extra) => ({ panel: [{ lens: key, trials: 1 }], key, escapes: 0, n: 35, tokens: 10, fpRate: 0, members: 1, slots: 1, ...extra });
  assert.deepEqual(selectTier([row('a', { escapes: 1 }), row('b', { fpRate: 0.2 })], 0.05).panel[0].lens, 'b');
  assert.deepEqual(selectTier([row('a', { fpRate: 0.1 }), row('b', { slots: 2 })], 0.05).panel[0].lens, 'b');
  assert.deepEqual(selectTier([row('a', { slots: 2 }), row('b', { tokens: 11 })], 0.05).panel[0].lens, 'a', 'cost first');
  assert.equal(selectTier([row('a', { escapes: 2 })], 0.05).chosen, null, '2 of 35 is over 5%');
});

test('assurance: calc rejects bad, duplicate, orphaned, mixed, or foreign-corpus trials', () => {
  assert.throws(() => calc([...records('a', SMALL), ...records('a', SMALL)], SMALL), /duplicate/);
  assert.throws(() => calc(records('a', SMALL, { trial: 3 }), SMALL), /trial/);
  assert.throws(() => calc(records('a', SMALL, { trial: 2 }), SMALL), /trial 2 without trial 1/);
  assert.throws(() => calc(records('a', SMALL).map((x) => ({ ...x, phase: 'certify' })), SMALL), /phase/);
  assert.throws(() => calc([...records('a', SMALL), ...records('a', SMALL, { trial: 2, model: 'other' })], SMALL), /mix/);
  assert.throws(() => calc([...records('a', SMALL), ...records('a', SMALL, { trial: 2, hash: 'h2' })], SMALL), /mix/);
  assert.throws(() => calc(records('a', SMALL).map(({ promptSha256, ...x }) => x), SMALL), /promptSha256/);
  assert.throws(() => calc(records('a', SMALL).map(({ recordedAt, ...x }) => x), SMALL), /recordedAt/);
  assert.throws(() => calc(records('a', SMALL), SMALL, { T: 0.5 }, { corpusSha256: 'corp-2' }), /corpus/);
  assert.doesNotThrow(() => calc(records('a', SMALL), SMALL, { T: 0.5 }, { corpusSha256: 'corp-1' }));
  for (const at of ['2026-10-24T10:00:00Z', '2026-10-24T10:00:00.5Z', '2026-10-24T10:00:00.123456Z', '2026-10-24T10:00:00.000+01:00']) {
    assert.throws(() => calc(records('a', SMALL, { at }), SMALL), /recordedAt/, at);
  }
});

test('assurance: a select trial recorded after certify began is refused (phase ordering)', () => {
  const sel = TWO_STAGE.filter((c) => c.split === 'select');
  const cert = TWO_STAGE.filter((c) => c.split === 'certify');
  const ordered = [...records('a', sel, { at: '2026-10-24T10:00:00.000Z' }), ...records('a', cert, { at: '2026-10-24T11:00:00.000Z' })];
  assert.doesNotThrow(() => calc(ordered, TWO_STAGE, { T1: 0.05 }));
  // Before the certify lines in the file, but later in time.
  const late = [...records('a', sel, { at: '2026-10-24T10:00:00.000Z' }), ...records('a', sel, { trial: 2, at: '2026-10-24T12:00:00.000Z' }), ...records('a', cert, { at: '2026-10-24T11:00:00.000Z' })];
  assert.throws(() => calc(late, TWO_STAGE, { T1: 0.05 }), /select trial .* after certify began/);
});

test('assurance: codex-reviewer trials carry the runner defaults hash, and the stamp takes it from them', () => {
  const recs = (args) => records('codex-reviewer', SMALL).map((x) => ({ ...x, codexArgsSha256: args }));
  assert.equal(panelsDoc(calc(recs('args-1'), SMALL, { T: 0.5 })).stamp.codexArgsSha256, 'args-1');
  const mixed = [...recs('args-1'), ...records('codex-reviewer', SMALL, { trial: 2 }).map((x) => ({ ...x, codexArgsSha256: 'args-2' }))];
  assert.throws(() => calc(mixed, SMALL), /mix/);
  assert.throws(() => calc(records('codex-reviewer', SMALL), SMALL), /codexArgsSha256/);
});

test('assurance: panels.json stamps what the trials recorded, and the same trials give the same stamp', () => {
  assert.deepEqual(parseTargets('T0=0.10,T1=0.05,T2=0.02'), { T0: 0.1, T1: 0.05, T2: 0.02 });
  assert.throws(() => parseTargets('T1=5%'));
  const recs = twoStage();
  const last = recs.length - 1;
  assert.equal(recs[last].phase, 'certify');
  recs[last] = { ...recs[last], recordedAt: '2026-10-25T08:30:00.000Z' };
  recs[last - 1] = { ...recs[last - 1], recordedAt: '2026-10-24T23:59:59.999Z' };
  const doc = panelsDoc(calc(recs, TWO_STAGE, { T1: 0.05 }));
  assert.equal(doc.stamp.deliver, JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json'), 'utf8')).version);
  assert.deepEqual(doc.stamp.lenses.cheap, { model: 'm', effort: 'medium', promptSha256: 'h-cheap' }, 'the hash the trials were recorded under, not the file today');
  assert.equal(doc.stamp.corpusSha256, 'corp-1', 'the corpus the trials ran on, not the corpus today');
  assert.equal(doc.stamp.calibratedAt, '2026-10-25T08:30:00.000Z', 'the latest trial, not the time calc ran');
  assert.equal(doc.stamp.codexArgsSha256, null, 'no codex-reviewer trials, so no runner defaults to stamp');
  assert.deepEqual(panelsDoc(calc(recs, TWO_STAGE, { T1: 0.05 })), doc);
  assert.equal(doc.tiers.T1.bound, ceil4(upperBound(0, 65)));
  for (const k of ['status', 'panel', 'bound', 'target', 'fpRate', 'tokens', 'selectEscapes', 'selectRate', 'certifyBound', 'nSelect', 'nCertify']) assert.ok(k in doc.tiers.T1, k);
});

test('assurance: a stale stamp is any changed or unstamped panel lens, a changed corpus, or a changed Codex review default', () => {
  const agent = 'code-integrity-reviewer';
  const current = (lens) => sha(fs.readFileSync(path.join(PLUGIN_ROOT, 'agents', `${lens}.md`)));
  const corpusSha256 = sha(fs.readFileSync(path.join(CORPUS_ROOT, 'MANIFEST.sha256')));
  const codexArgsSha256 = sha(fs.readFileSync(path.join(PLUGIN_ROOT, 'scripts', 'codex', 'lib', 'args.mjs')));
  const tiers = { T1: { status: 'measured', panel: [{ lens: agent, trials: 1 }] } };
  const doc = (lenses, extra = {}, t = tiers) => ({ stamp: { deliver: 'x', calibratedAt: '2026-10-24T10:00:00.000Z', corpusSha256, codexArgsSha256, lenses, ...extra }, tiers: t });
  assert.deepEqual(staleness(doc({ [agent]: { promptSha256: current(agent) } })), []);
  assert.match(staleness(doc({ [agent]: { promptSha256: 'old' } })).join(), /code-integrity-reviewer/);
  assert.match(staleness(doc({ [agent]: { promptSha256: current(agent) } }, { corpusSha256: 'old' })).join(), /corpus/);
  assert.match(staleness(doc({})).join(), /code-integrity-reviewer/);
  assert.match(staleness({ stamp: { corpusSha256 }, tiers }).join(), /lens/);
  assert.match(staleness(doc({ 'code-integrity-reveiwer': { promptSha256: null } })).join(), /code-integrity-reviewer/);
  const typo = doc({ 'no-such-lens': { promptSha256: null } }, {}, { T1: { status: 'measured', panel: [{ lens: 'no-such-lens', trials: 1 }] } });
  assert.match(staleness(typo).join(), /no-such-lens/, 'a null hash never matches a missing file');
  assert.deepEqual(staleness(doc({}, {}, { T1: { status: 'unmeasured', panel: [] } })), []);
  assert.match(staleness(null).join(), /stamp/);
  const codexTiers = { T1: { status: 'measured', panel: [{ lens: 'codex-reviewer', trials: 1 }] } };
  const codex = (stamp, extra = {}) => doc({ 'codex-reviewer': { promptSha256: current('codex-reviewer'), ...stamp } }, extra, codexTiers);
  assert.deepEqual(staleness(codex({ model: REVIEW_DEFAULTS.model, effort: REVIEW_DEFAULTS.effort })), []);
  assert.match(staleness(codex({ model: 'gpt-old', effort: REVIEW_DEFAULTS.effort })).join(), /codex-reviewer.*model/);
  assert.match(staleness(codex({ model: REVIEW_DEFAULTS.model, effort: 'low' })).join(), /codex-reviewer.*effort/);
  assert.match(staleness(codex({ model: REVIEW_DEFAULTS.model, effort: REVIEW_DEFAULTS.effort }, { codexArgsSha256: 'old' })).join(), /args\.mjs/);
});

test('assurance: the example corpus is well formed and matches its manifest', () => {
  const cases = loadCases();
  assert.equal(cases.length, new Set(cases.map((c) => c.id)).size);
  for (const c of cases) {
    assert.ok(CLASSES.includes(c.class), c.id);
    assert.ok(['select', 'certify'].includes(c.split), c.id);
    assert.match(c.batch, /^batch-\d+$/);
    assert.ok(fs.existsSync(path.join(CORPUS_ROOT, 'fixtures', c.id, 'story.md')), c.id);
  }
  assert.ok(cases.some((c) => c.kind === 'clean'));
  assert.ok(new Set(cases.filter((c) => c.kind === 'seeded').map((c) => c.class)).size >= 2);
  assert.equal(fs.readFileSync(path.join(CORPUS_ROOT, 'MANIFEST.sha256'), 'utf8'), manifest());
  assert.equal(run('manifest', '--check').status, 0);
});

test('assurance: list filters and never prints a witness or a patch', () => {
  assert.ok(listCases(CORPUS_ROOT, { kind: 'clean' }).every((c) => c.kind === 'clean'));
  assert.ok(listCases(CORPUS_ROOT, { split: 'select' }).every((c) => c.split === 'select'));
  const r = run('list', '--class', 'security');
  assert.equal(r.status, 0);
  const rows = JSON.parse(r.stdout);
  assert.ok(rows.length > 0 && rows.every((c) => c.class === 'security'));
  assert.doesNotMatch(run('list').stdout, /witness|patch|diff --git/);
  assert.equal(run('list', '--kind', 'nope').status, 64);
  assert.equal(run('list', '--split', 'nope').status, 64);
});

// The three examples only, so this stays fast as batches grow; validate.sh runs the whole corpus.
test('assurance: witness passes on the three example cases', () => {
  for (const [id, line] of [['a001-page-count', /1 seeded witnesses .*; 0 clean/], ['a002-upload-path', /1 seeded witnesses .*; 0 clean/], ['a003-slugify', /0 seeded witnesses .*; 1 clean patches apply/]]) {
    const r = run('witness', '--id', id);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, line);
  }
  assert.equal(run('witness', '--id', 'no-such-case').status, 66);
});

// exampleCorpus(prefix): a corpus of only the three batch-0 example cases, copied from the real one
// with its own manifest, so tests that write into a corpus do not change with later batches.
const EXAMPLES = ['a001-page-count', 'a002-upload-path', 'a003-slugify'];
function exampleCorpus(prefix) {
  const copy = path.join(tmpDir(prefix), 'assurance');
  fs.mkdirSync(path.join(copy, 'fixtures'), { recursive: true });
  for (const id of EXAMPLES) fs.cpSync(path.join(CORPUS_ROOT, 'fixtures', id), path.join(copy, 'fixtures', id), { recursive: true });
  const cases = loadCases().filter((c) => EXAMPLES.includes(c.id));
  assert.equal(cases.length, EXAMPLES.length, 'the batch-0 examples are in cases.json');
  fs.writeFileSync(path.join(copy, 'cases.json'), JSON.stringify(cases, null, 2) + '\n');
  fs.writeFileSync(path.join(copy, 'MANIFEST.sha256'), manifest(copy));
  return copy;
}

test('assurance: witness rejects a defect the witness cannot see, and a missing witness', () => {
  const copy = exampleCorpus('assure-');
  const pristine = manifest(copy);
  const dir = path.join(copy, 'fixtures', 'a001-page-count');
  fs.copyFileSync(path.join(dir, 'clean.patch'), path.join(dir, 'defect.patch'));
  fs.rmSync(path.join(copy, 'fixtures', 'a002-upload-path', 'witness.test.mjs'));
  const r = run('witness', '--corpus', copy);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /a001-page-count: the witness passes with defect\.patch applied/);
  assert.match(r.stderr, /a002-upload-path: missing witness\.test\.mjs/);
  assert.notEqual(manifest(copy), pristine);
});

// buildCase(root, id, files): a fixture whose patches come from real git diffs against base/.
function buildCase(root, id, { base, clean, defect, witness }) {
  const dir = path.join(root, 'fixtures', id);
  const write = (d, files) => { for (const [rel, text] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(d, rel)), { recursive: true }); fs.writeFileSync(path.join(d, rel), text); } };
  const diff = (files) => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'assure-diff-'));
    write(d, base);
    const g = (...a) => execFileSync('git', ['-C', d, '-c', 'user.email=t@x', '-c', 'user.name=t', '-c', 'core.autocrlf=false', '-c', 'commit.gpgsign=false', ...a], { encoding: 'utf8' });
    g('init', '-q'); g('add', '-A'); g('commit', '-qm', 'base');
    write(d, files);
    g('add', '-A');
    const out = g('diff', '--cached');
    fs.rmSync(d, { recursive: true, force: true });
    return out;
  };
  write(path.join(dir, 'base'), base);
  fs.writeFileSync(path.join(dir, 'story.md'), `# ${id}\n`);
  fs.writeFileSync(path.join(dir, 'clean.patch'), diff(clean));
  fs.writeFileSync(path.join(dir, 'defect.patch'), diff(defect));
  fs.writeFileSync(path.join(dir, 'witness.test.mjs'), witness);
  return { id, class: 'correctness', kind: 'seeded', split: 'select', batch: 'batch-9' };
}

test('assurance: a witness that crashes on load or runs no test proves nothing', async () => {
  const root = tmpDir('assure-broken-');
  const scratch = tmpDir('assure-scratch-');
  const base = { 'package.json': '{ "type": "module" }\n', 'src/a.mjs': 'export const f = () => 1;\n' };
  // Codex's repro: identical behaviour in both variants, but the witness imports a support module
  // only the clean variant creates, so the defect run fails at import, not at an assertion.
  const crash = buildCase(root, 'b1-support', {
    base,
    clean: { 'src/support.mjs': 'export const one = 1;\n' },
    defect: { 'src/other.mjs': 'export const one = 1;\n' },
    witness: "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { one } from './src/support.mjs';\nimport { f } from './src/a.mjs';\ntest('f', () => assert.equal(f(), one));\n",
  });
  const problems = await checkCase(crash, root, scratch);
  assert.ok(problems.some((p) => /defect\.patch/.test(p) && /no assertion failed|ran no test/.test(p)), problems.join('\n'));
  assert.ok(!problems.some((p) => /clean\.patch/.test(p)), 'the clean variant is fine');
  const thrown = buildCase(root, 'b2-throw', {
    base,
    clean: { 'src/a.mjs': 'export const f = () => 1;\nexport const g = 2;\n' },
    defect: { 'src/a.mjs': 'export const f = () => 1;\nexport const g = 3;\n' },
    witness: "import { test } from 'node:test';\nimport { g } from './src/a.mjs';\ntest('g', () => { if (g !== 2) throw new Error('bad'); });\n",
  });
  assert.ok((await checkCase(thrown, root, scratch)).some((p) => /no assertion failed/.test(p)), 'a plain throw is not an assertion failure');
  const empty = buildCase(root, 'b3-empty', {
    base,
    clean: { 'src/a.mjs': 'export const f = () => 2;\n' },
    defect: { 'src/a.mjs': 'export const f = () => 3;\n' },
    witness: "// no tests\n",
  });
  const emptyProblems = await checkCase(empty, root, scratch);
  assert.ok(emptyProblems.some((p) => /no test/.test(p)), emptyProblems.join('\n'));
});

test('assurance: prepare stages a variant in an opaque temporary repository', () => {
  const r = run('prepare', '--id', 'a002-upload-path', '--variant', 'defect');
  assert.equal(r.status, 0, r.stderr);
  const { dir, diff } = JSON.parse(r.stdout);
  try {
    assert.equal(path.dirname(dir), fs.realpathSync(os.tmpdir()), 'under the system temporary directory, never the deliver checkout');
    assert.doesNotMatch(path.basename(dir), /a002|upload|assurance|calibrate|deliver|benchmarks/i, 'the path names no case and no corpus');
    assert.match(diff, /target\.startsWith\(base\)\)/);
    assert.ok(!fs.existsSync(path.join(dir, 'witness.test.mjs')));
    assert.ok(fs.existsSync(path.join(dir, 'docs', 'story.md')));
    assert.match(fs.readFileSync(path.join(dir, '.gitignore'), 'utf8'), /\/codex\//);
    assert.doesNotMatch(diff, /docs\/story\.md|\.gitignore/, 'the story and ignore file are committed, never part of the diff');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  assert.equal(run('prepare', '--id', 'a003-slugify', '--variant', 'defect').status, 66);
  assert.equal(run('prepare', '--id', 'a002-upload-path', '--variant', 'defect', '--dir', '/tmp/x').status, 64, 'the caller cannot choose a telling path');
});

test('assurance: prepare removes its repository when a git step fails', () => {
  const copy = exampleCorpus('assure-prepfail-');
  fs.writeFileSync(path.join(copy, 'fixtures', 'a002-upload-path', 'defect.patch'), 'diff --git a/nope b/nope\n--- a/nope\n+++ b/nope\n@@ -1 +1 @@\n-x\n+y\n');
  const scratch = tmpDir('assure-tmp-');
  const env = { ...process.env, TMPDIR: scratch, TMP: scratch, TEMP: scratch };
  const r = spawnSync(process.execPath, [SCRIPT, 'prepare', '--corpus', copy, '--id', 'a002-upload-path', '--variant', 'defect'], { encoding: 'utf8', env, windowsHide: true });
  assert.equal(r.status, 66);
  assert.deepEqual(fs.readdirSync(scratch), [], 'no half-built repository is left behind');
});

test('assurance: trial-record stamps each line, refuses bad input, and calc --write builds panels.json', () => {
  const copy = exampleCorpus('assure-calc-');
  const pristine = manifest(copy);
  const out = path.join(copy, 'results', 'trials.jsonl');
  const lens = 'code-integrity-reviewer';
  const rec = (c, caught, fp, extra = [], trial = '1') => run('trial-record', '--corpus', copy, '--lens', lens, '--model', 'claude-opus-5-5', '--effort', 'medium',
    '--case', c, '--trial', trial, '--caught', caught, '--false-positive', fp, '--tokens', '1200', ...extra);
  assert.equal(rec('a001-page-count', 'true', 'false').status, 0);
  assert.equal(rec('a003-slugify', 'false', 'false').status, 0);
  assert.equal(rec('a001-page-count', 'true', 'false').status, 1, 'a duplicate trial');
  assert.equal(run('trial-record', '--corpus', copy, '--lens', 'security-auditor', '--model', 'm', '--effort', 'e', '--case', 'a001-page-count', '--trial', '2', '--caught', 'true', '--false-positive', 'false').status, 1, 'trial 2 without trial 1');
  assert.equal(rec('a002-upload-path', 'true', 'false').status, 64, 'a certify case recorded in the select phase');
  assert.equal(rec('a002-upload-path', 'true', 'false', ['--phase', 'certify']).status, 0);
  assert.equal(rec('a002-upload-path', 'true', 'false', ['--phase', 'certify'], '2').status, 0);
  const lateSelect = rec('a001-page-count', 'true', 'false', [], '2');
  assert.equal(lateSelect.status, 1, 'no select trial once certify has begun');
  assert.match(lateSelect.stderr, /certify/);
  assert.equal(run('trial-record', '--corpus', copy, '--phase', 'certify', '--lens', 'codex-reviewer', '--model', 'gpt-6.1-sol', '--effort', 'high', '--case', 'a002-upload-path', '--trial', '1', '--caught', 'true', '--false-positive', 'false').status, 0);
  assert.equal(rec('no-such-case', 'true', 'false').status, 64);
  assert.equal(rec('a001-page-count', 'yes', 'false').status, 64);
  assert.equal(rec('a001-page-count', 'true', 'false', [], '3').status, 64);
  assert.equal(run('trial-record', '--corpus', copy, '--lens', 'code-integrity-reveiwer', '--model', 'm', '--effort', 'e', '--case', 'a001-page-count', '--trial', '1', '--caught', 'true', '--false-positive', 'false').status, 64, 'an unknown lens');
  const all = readTrials(out);
  assert.equal(all.length, 5);
  const codexLine = all.pop();
  assert.equal(codexLine.codexArgsSha256, sha(fs.readFileSync(path.join(PLUGIN_ROOT, 'scripts', 'codex', 'lib', 'args.mjs'))), 'a codex-reviewer line records the runner defaults it ran under');
  fs.writeFileSync(out, all.map((x) => JSON.stringify(x)).join('\n') + '\n');
  const rows = readTrials(out);
  assert.equal(rows.length, 4);
  assert.ok(!('codexArgsSha256' in rows[0]), 'only codex-reviewer lines carry it');
  const hash = sha(fs.readFileSync(path.join(PLUGIN_ROOT, 'agents', `${lens}.md`)));
  const corpusHash = sha(fs.readFileSync(path.join(copy, 'MANIFEST.sha256')));
  const { recordedAt, ...first } = rows[0];
  assert.deepEqual(first, { lens, model: 'claude-opus-5-5', effort: 'medium', promptSha256: hash, corpusSha256: corpusHash, phase: 'select', case: 'a001-page-count', trial: 1, caught: true, falsePositive: false, tokens: 1200 });
  assert.match(recordedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  const r = run('calc', '--corpus', copy, '--write', '--targets', 'T0=0.99,T1=0.05');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /\| T1 \| 5\.0% \| unmeasured \|/);
  const doc = JSON.parse(fs.readFileSync(path.join(copy, 'panels.json'), 'utf8'));
  assert.equal(doc.tiers.T0.status, 'measured');
  assert.equal(doc.tiers.T0.certifyBound, ceil4(upperBound(0, 1)));
  assert.equal(doc.tiers.T1.reason, 'corpus too small: needs ≥ 59 certify cases');
  assert.equal(doc.stamp.lenses[lens].promptSha256, hash);
  assert.equal(doc.stamp.calibratedAt, rows.map((x) => x.recordedAt).sort().at(-1));
  assert.equal(manifest(copy), pristine, 'results/ and panels.json stay outside the manifest');
  // Trials from another corpus are refused rather than restamped with the corpus today.
  fs.appendFileSync(path.join(copy, 'MANIFEST.sha256'), '0000  extra\n');
  assert.equal(run('calc', '--corpus', copy).status, 1);
  fs.writeFileSync(path.join(copy, 'MANIFEST.sha256'), manifest(copy));
  // A trial line recorded under an older prompt is refused rather than re-stamped.
  fs.appendFileSync(out, JSON.stringify({ ...rows[0], promptSha256: 'old', trial: 2 }) + '\n');
  assert.equal(run('calc', '--corpus', copy).status, 1);
  assert.equal(run('calc', '--corpus', copy, '--targets', 'T1=lots').status, 64);
  assert.equal(run('calc', '--corpus', copy, '--in', path.join(copy, 'missing.jsonl')).status, 66);
});

// --- WP-D follow-ups ---

test('assurance: a select line after the first certify line in the file is refused, whatever its time', () => {
  const sel = split('select');
  const cert = split('certify');
  const recs = [...records('a', sel.slice(0, 20), { at: '2026-10-24T10:00:00.000Z' }), ...records('a', cert, { at: '2026-10-24T11:00:00.000Z' }), ...records('a', sel.slice(20), { at: '2026-10-24T09:00:00.000Z' })];
  assert.throws(() => calc(recs, TWO_STAGE, { T1: 0.05 }), /after the first certify line/);
});

test('assurance: a select trial in the same millisecond as the first certify trial is accepted', () => {
  const at = '2026-10-24T10:00:00.000Z';
  const recs = [...records('a', split('select'), { at }), ...records('a', split('certify'), { at })];
  assert.doesNotThrow(() => calc(recs, TWO_STAGE, { T1: 0.05 }));
});

test('assurance: parseUtc accepts only what toISOString writes', () => {
  assert.equal(parseUtc('2026-10-24T10:00:00.000Z'), Date.UTC(2026, 9, 24, 10));
  for (const bad of ['2026-10-24', '2026-10-24T10:00:00Z', '2026-10-24 10:00', '2026-10-24T10:00:00.000+01:00', null, 42]) assert.ok(Number.isNaN(parseUtc(bad)), String(bad));
});

test('assurance: a tier bound shows only when every lens behind it, measured panel or best panel, is current', () => {
  const current = (lens) => sha(fs.readFileSync(path.join(PLUGIN_ROOT, 'agents', `${lens}.md`)));
  const stamp = {
    deliver: 'x', calibratedAt: '2026-10-24T10:00:00.000Z',
    corpusSha256: sha(fs.readFileSync(path.join(CORPUS_ROOT, 'MANIFEST.sha256'))),
    codexArgsSha256: sha(fs.readFileSync(path.join(PLUGIN_ROOT, 'scripts', 'codex', 'lib', 'args.mjs'))),
    lenses: {
      'code-integrity-reviewer': { model: 'm', effort: 'medium', promptSha256: current('code-integrity-reviewer') },
      'codex-reviewer': { model: 'gpt-old', effort: REVIEW_DEFAULTS.effort, promptSha256: current('codex-reviewer') },
    },
  };
  const best = (lens) => ({ status: 'unmeasured', panel: [], bestPanel: [{ lens, trials: 1 }], certifyBound: 0.06 });
  const doc = { stamp, tiers: { T0: best('code-integrity-reviewer'), T1: best('codex-reviewer'), T2: { status: 'unmeasured', panel: [], certifyBound: 0.06 } } };
  assert.deepEqual(staleness(doc), [], 'no measured tier, so the document as a whole is current');
  assert.deepEqual(boundStaleness(doc, 'T0'), []);
  assert.match(boundStaleness(doc, 'T1').join(), /codex-reviewer.*model/);
  assert.match(boundStaleness(doc, 'T2').join(), /no lens/);
  assert.match(boundStaleness({ ...doc, stamp: { ...stamp, corpusSha256: 'old' } }, 'T0').join(), /corpus/);
});
