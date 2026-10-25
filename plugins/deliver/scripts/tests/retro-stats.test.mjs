import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { tmpDir, gitIn, PLUGIN_ROOT } from './helpers.mjs';
import { collect, render, auditLessons, renderAudit, trust, renderTrust, firingSprint } from '../retro-stats.mjs';
import { upperBound, CORPUS_ROOT, REVIEW_DEFAULTS } from '../assurance.mjs';

const SCRIPT = path.join(PLUGIN_ROOT, 'scripts', 'retro-stats.mjs');
const proj = () => {
  const d = tmpDir('retro-');
  fs.mkdirSync(path.join(d, 'docs', 'stories'), { recursive: true });
  return d;
};
const story = (p, id, exec) => {
  const lines = [`# ${id}: thing`, '<!-- pm-meta: {"builder":"auto","touches":["src"]} -->', '', '## Goal', 'x'];
  if (exec) lines.push('', '## Execution', `<!-- pm-exec: ${JSON.stringify(exec)} -->`);
  fs.writeFileSync(path.join(p, 'docs', 'stories', `${id}-thing.md`), lines.join('\n') + '\n');
};
const exec = (builder, rounds, retries, status = 'merged') => ({ owner: 'a', builder, branch: 'pm/x', status, rounds, retries, updated: '2026-10-01 10:00' });
const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', windowsHide: true });

test('retro-stats: counts per story and per builder', () => {
  const p = proj();
  story(p, 'S1-1', exec('expert-builder', 2, 1));
  story(p, 'S1-2', exec('codex-builder', 0, 0));
  story(p, 'S1-10', exec('codex-builder', 1, 0));
  const s = collect(p, 1);
  assert.deepEqual(s.stories.map((x) => x.id), ['S1-1', 'S1-2', 'S1-10']);
  assert.deepEqual(s.builders['expert-builder'], { stories: 1, rounds: 2, retries: 1, clean: 0 });
  assert.deepEqual(s.builders['codex-builder'], { stories: 2, rounds: 1, retries: 0, clean: 1 });
  assert.deepEqual(s.totals, { stories: 3, rounds: 3, retries: 1, unmerged: 0 });
});

test('retro-stats: --sprint keeps only that sprint', () => {
  const p = proj();
  story(p, 'S1-1', exec('expert-builder', 3, 0));
  story(p, 'S2-1', exec('expert-builder', 1, 0));
  assert.deepEqual(collect(p, 2).stories.map((x) => x.id), ['S2-1']);
  assert.equal(collect(p).stories.length, 2);
});

test('retro-stats: a story with no Execution block is not-started and counts for no builder', () => {
  const p = proj();
  story(p, 'S1-1', null);
  story(p, 'S1-2', exec('expert-builder', 0, 0, 'building'));
  const s = collect(p, 1);
  assert.equal(s.stories[0].status, 'not-started');
  assert.equal(s.stories[0].builder, null);
  assert.deepEqual(Object.keys(s.builders), ['expert-builder']);
  assert.equal(s.totals.unmerged, 2);
});

test('retro-stats: malformed counters read as zero', () => {
  const p = proj();
  story(p, 'S1-1', { ...exec('expert-builder', 0, 0), rounds: 'two', retries: -1 });
  const s = collect(p, 1);
  assert.equal(s.stories[0].rounds, 0);
  assert.equal(s.stories[0].retries, 0);
});

test('retro-stats: CLI prints a table, JSON with --json, and fails on bad input', () => {
  const p = proj();
  story(p, 'S1-1', exec('expert-builder', 1, 0));
  const table = run(p, '--sprint', '1');
  assert.equal(table.status, 0);
  assert.equal(table.stdout, render(collect(p, 1)));
  assert.match(table.stdout, /\| S1-1 \| expert-builder \| merged \| 1 \| 0 \|/);
  const json = run(p, '--json');
  assert.equal(JSON.parse(json.stdout).totals.rounds, 1);
  assert.equal(run().status, 64);
  assert.equal(run(p, '--sprint', 'x').status, 64);
  assert.equal(run(tmpDir('empty-')).status, 66);
});

test('retro-stats: groups stories by the deliver version stamped at the claim', () => {
  const p = proj();
  story(p, 'S1-1', { ...exec('expert-builder', 2, 0), deliver: '0.28.0' });
  story(p, 'S1-2', { ...exec('expert-builder', 0, 0), deliver: '0.29.0' });
  story(p, 'S1-3', exec('expert-builder', 1, 0));
  const s = collect(p);
  assert.deepEqual(s.versions, { '0.28.0': { stories: 1, rounds: 2, retries: 0, clean: 0 }, '0.29.0': { stories: 1, rounds: 0, retries: 0, clean: 1 } });
  assert.match(render(s), /\| 0\.29\.0 \| 1 \| 0 \| 0 \| 1 \|/);
  assert.equal(s.stories[2].deliver, null);
});

const lessonProject = () => {
  const p = proj();
  fs.mkdirSync(path.join(p, 'docs', 'retros'), { recursive: true });
  fs.writeFileSync(path.join(p, 'AGENTS.md'), ['# app', '## Gotchas', '- Dates are UTC at the API boundary. [L1-1]', '- Migrations never drop a column in the release that stops writing it. [L1-2]', '- Loose line with no record. [L2-9]', ''].join('\n'));
  const table = (rows) => ['## Lessons', '| id | line | evidence | review by |', '|----|------|----------|-----------|', ...rows, ''].join('\n');
  fs.writeFileSync(path.join(p, 'docs', 'retros', 'sprint-1.md'), table(['| L1-1 | Dates are UTC | S1-2 round 1 | sprint 3 |', '| L1-2 | Migrations | S1-4 round 2 | sprint 3 |']));
  fs.writeFileSync(path.join(p, 'docs', 'retros', 'sprint-2.md'), '## What recurred\n- UTC again, L1-1 cited by the reviewer in S2-3.\n');
  return p;
};

test('retro-stats --audit: a cited lesson is kept, an uncited one past its review is due, an unrecorded one is an orphan', () => {
  const a = auditLessons(lessonProject());
  assert.equal(a.sprint, 3);
  assert.equal(a.agents_lines, 5);
  assert.deepEqual(a.lessons.map((l) => [l.id, l.review_by, l.last_cited, l.status]), [['L1-1', 3, 2, 'keep'], ['L1-2', 3, null, 'due'], ['L2-9', null, null, 'orphan']]);
  assert.match(renderAudit(a), /\| L1-2 \| sprint 1 \| sprint 3 \| - \| due \|/);
});

test('retro-stats --audit: nothing is due before the review-by sprint, and the CLI prints JSON', () => {
  const p = lessonProject();
  assert.equal(auditLessons(p, 2).lessons[1].status, 'keep');
  const r = run(p, '--audit', '--json');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).lessons.length, 3);
});

// ---------- --trust ----------

const trustStory = (p, id, ex, notes = []) => {
  const lines = [`# ${id}: thing`, '<!-- pm-meta: {"builder":"auto","touches":["src"]} -->', '', '## Goal', 'x', '', '## Execution', `<!-- pm-exec: ${JSON.stringify(ex)} -->`, ...notes];
  fs.writeFileSync(path.join(p, 'docs', 'stories', `${id}-thing.md`), lines.join('\n') + '\n');
};
const fileSha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
// A current calibration: the corpus manifest and the code-integrity-reviewer prompt as they are now.
const PANELS = {
  stamp: {
    deliver: '0.29.0',
    corpusSha256: fileSha(path.join(CORPUS_ROOT, 'MANIFEST.sha256')),
    lenses: { 'code-integrity-reviewer': { model: 'claude-opus-5-5', effort: 'medium', promptSha256: fileSha(path.join(PLUGIN_ROOT, 'agents', 'code-integrity-reviewer.md')) } },
    codexArgsSha256: fileSha(path.join(PLUGIN_ROOT, 'scripts', 'codex', 'lib', 'args.mjs')),
    calibratedAt: '2026-10-01T00:00:00.000Z',
  },
  tiers: {
    T0: { status: 'measured', panel: [{ lens: 'code-integrity-reviewer', trials: 1 }], bound: 0.0488, certifyBound: 0.0488, target: 0.1, fpRate: 0.05, tokens: 9000 },
    T1: { status: 'unmeasured', panel: [], bestPanel: [{ lens: 'code-integrity-reviewer', trials: 1 }], bound: 0.0617, certifyBound: 0.0617, target: 0.05, fpRate: 0.1, tokens: 30000 },
    T2: { status: 'unmeasured', panel: [], bound: 0.08, certifyBound: null, target: 0.02, fpRate: null, tokens: 30000 },
  },
};
// The maximum panel an expert-builder story runs: every lens plus the opposite family.
const MAX = ['code-integrity-reviewer', 'architecture-reviewer', 'security-auditor', 'performance-reviewer', 'codex-reviewer'];
// ex(tier, ...): an Execution block in the documented 0.29 format: verdicts at a commit, the
// failure counters, the panel that ran on the first review, and `updated` in UTC.
const ex = (tier, rounds = 0, retries = 0, extra = {}) => ({
  ...exec('expert-builder', rounds, retries), tier, deliver: '0.29.0', updated: '2026-10-05 10:00',
  verifier: 'PASS 1a2b3c4d', ...(tier === 'T0' ? {} : { integrity: 'pass 1a2b3c4d' }),
  integrity_fails: 0, holdout_fails: 0, panel: tier === 'T2' ? [...MAX, 'code-integrity-reviewer'] : MAX, ...extra,
});
const gitProj = (p) => {
  gitIn(p, ['init', '-q']);
  gitIn(p, ['symbolic-ref', 'HEAD', 'refs/heads/main']);
  gitIn(p, ['config', 'user.email', 'casey@example.com']);
  gitIn(p, ['config', 'user.name', 'Casey Example']);
  gitIn(p, ['add', '-A']);
  gitIn(p, ['commit', '-qm', 'stories']);
};
const trustProject = () => {
  const p = proj();
  fs.writeFileSync(path.join(p, 'docs', 'plan.md'), '# Plan\n\n## Delivery mode\n- Integration branch: main\n');
  trustStory(p, 'S1-1', ex('T1'));
  trustStory(p, 'S1-2', ex('T1', 2, 0, { integrity_fails: 1 }), ['- 2026-10-01 10:00 integrity: fail, an assertion was removed from test/a.test.mjs.', '- 2026-10-01 11:00 integrity: pass after the fix.']);
  trustStory(p, 'S1-3', ex('T2', 1, 1, { holdout_fails: 1 }), ['- 2026-10-02 09:00 holdout FAIL: tmp/holdout/S1-3/limits.test.mjs.', '- 2026-10-02 10:00 holdout: 0 failures after the fix.']);
  trustStory(p, 'S1-4', ex('T0'));
  trustStory(p, 'S1-5', ex('T1'));
  trustStory(p, 'S2-1', ex('T1'));
  trustStory(p, 'S2-2', { ...ex('T2'), status: 'building' });
  fs.writeFileSync(path.join(p, 'panels.json'), JSON.stringify(PANELS));
  gitProj(p);
  gitIn(p, ['commit', '-q', '--allow-empty', '-m', 'fix(S2-1): page count rounds up\n\nThe last partial page was dropped.\n\nEscaped-From: S1-1']);
  gitIn(p, ['commit', '-q', '--allow-empty', '-m', 'fix(S2-1): and the empty list\n\nescaped-from: S1-1, S9-9']);
  gitIn(p, ['checkout', '-qb', 'side']);
  gitIn(p, ['commit', '-q', '--allow-empty', '-m', 'fix: elsewhere\n\nEscaped-From: S1-4']);
  gitIn(p, ['checkout', '-q', 'main']);
  return p;
};

test('retro-stats --trust: per tier shipped, panel, bound, first pass, rounds, integrity blocks, holdout failures', () => {
  const p = trustProject();
  const r = trust(p, { sprint: 1, panelsFile: path.join(p, 'panels.json') });
  assert.equal(r.branch, 'main');
  assert.deepEqual(r.panels.stale, []);
  assert.deepEqual(r.tiers.T1, {
    shipped: 3, panel: null, calibratedBound: null, bestBound: 0.0617, target: 0.05, belowPanel: 0, withheld: null, maximumForced: false, firstPass: 2, fixRounds: 2, integrityBlocks: 1, holdoutFailures: null,
    observed: { since: '2026-10-01T00:00:00.000Z', shipped: 4, escapedStories: 1, escapeCommits: 2, bound: upperBound(1, 4), overTarget: true },
    observedToDate: { shipped: 4, escapedStories: 1, escapeCommits: 2, bound: upperBound(1, 4), overTarget: true },
  });
  assert.deepEqual(r.tiers.T0.panel, [{ lens: 'code-integrity-reviewer', trials: 1 }]);
  assert.equal(r.tiers.T0.calibratedBound, 0.0488);
  assert.equal(r.tiers.T0.observed.escapedStories, 0, 'the side-branch trailer is not on the integration branch');
  assert.equal(r.tiers.T2.holdoutFailures, 1, '"holdout: 0 failures" is not a failure');
  assert.equal(r.tiers.T2.bestBound, null, 'a tier never certified shows no bound, never a select-split figure');
  assert.equal(r.tiers.T2.observed.shipped, 1, 'a story still building has not shipped');
  assert.deepEqual(r.unmapped.map((e) => e.story), ['S9-9']);
  const text = renderTrust(r);
  assert.match(text, /\| T0 \| 1 \| code-integrity-reviewer \| 4\.9% \| 10\.0% \| 1\/1 \| 0 \| 0 \| not recorded \|/);
  assert.match(text, /\| T1 \| 3 \| unmeasured, maximum panel \| unmeasured \(best 6\.2%\) \| 5\.0% \| 2\/3 \| 2 \| 1 \| not recorded \|/);
  assert.match(text, /\| T1 \| 4 \| 1 \| 2 \| \d+\.\d% \| 5\.0% \| OVER TARGET: maximum panel next sprint \| 1\/4, /);
  assert.match(text, /\| T0 \| 1 \| 0 \| 0 \| 95\.0% \| 10\.0% \| no escapes; too few stories to bound under target \|/);
  assert.match(text, /since the calibration of 2026-10-01T00:00:00\.000Z/);
  assert.match(text, /\| T2 \| 1 \| unmeasured, maximum panel \| - \|/);
  assert.match(text, /S9-9/);
});

test('retro-stats --trust: a stricter effective target turns a measured tier into the maximum panel', () => {
  const p = trustProject();
  const r = trust(p, { panelsFile: path.join(p, 'panels.json'), targets: { T0: 0.01 } });
  assert.equal(r.tiers.T0.panel, null);
  assert.equal(r.tiers.T0.calibratedBound, null);
  assert.equal(r.tiers.T0.bestBound, 0.0488);
  assert.match(renderTrust(r), /\| T0 \| \d+ \| unmeasured, maximum panel \| unmeasured \(best 4\.9%\) \| 1\.0% \|/);
});

test('retro-stats --trust: OVER TARGET counts only stories merged since the calibration in force', () => {
  const p = trustProject();
  const later = { ...PANELS, stamp: { ...PANELS.stamp, calibratedAt: '2026-10-10T00:00:00.000Z' } };
  fs.writeFileSync(path.join(p, 'later.json'), JSON.stringify(later));
  const r = trust(p, { panelsFile: path.join(p, 'later.json') });
  assert.deepEqual(r.tiers.T1.observed, { since: '2026-10-10T00:00:00.000Z', shipped: 0, escapedStories: 0, escapeCommits: 0, bound: 1, overTarget: false });
  assert.equal(r.tiers.T1.observedToDate.overTarget, true, 'the to-date figure is still shown');
});

// commitAt(p, message, iso): an empty commit whose committer time is iso.
const commitAt = (p, message, iso) => execFileSync('git', ['-C', p, 'commit', '-q', '--allow-empty', '-m', message], { env: { ...process.env, GIT_COMMITTER_DATE: iso, GIT_AUTHOR_DATE: iso }, stdio: 'ignore' });

test('retro-stats --trust: the window uses the merged commit time, exactly, and counts a story with no time', () => {
  const p = proj();
  fs.writeFileSync(path.join(p, 'docs', 'plan.md'), '- Integration branch: main\n');
  trustStory(p, 'S1-1', ex('T1', 0, 0, { updated: '2026-10-20 23:00' }));
  trustStory(p, 'S1-2', ex('T1', 0, 0, { updated: '2026-10-01 08:00' }));
  const { updated, ...noTime } = ex('T1');
  trustStory(p, 'S1-3', noTime);
  trustStory(p, 'S1-4', ex('T1', 0, 0, { updated: '2026-10-10 12:00' }));
  gitProj(p);
  // S1-1 merged in the morning of the calibration day; its `updated` field says otherwise.
  commitAt(p, 'chore(S1-1): merged', '2026-10-10T09:00:00Z');
  commitAt(p, 'chore(S1-1): merged', '2026-10-10T18:00:00Z');
  // S1-2 merged that evening, after the calibration, recorded in another time zone.
  commitAt(p, 'chore(S1-2): merged', '2026-10-10T17:00:00+02:00');
  commitAt(p, 'fix: x\n\nEscaped-From: S1-1', '2026-10-11T09:00:00Z');
  fs.writeFileSync(path.join(p, 'p.json'), JSON.stringify({ ...PANELS, stamp: { ...PANELS.stamp, calibratedAt: '2026-10-10T14:30:00.000Z' } }));
  const r = trust(p, { panelsFile: path.join(p, 'p.json') });
  // In the window: S1-2 (15:00 UTC from git) and S1-3 (no time at all, counted). Out: S1-1 (09:00
  // UTC from its first merged commit) and S1-4 (`updated` 12:00, read as UTC).
  assert.equal(r.tiers.T1.observed.shipped, 2);
  assert.equal(r.tiers.T1.observed.escapedStories, 0, 'S1-1 merged that morning, before the calibration');
  assert.equal(r.tiers.T1.observedToDate.escapedStories, 1);
});

test('retro-stats --trust: shipped stories come from the same ref as the trailers', () => {
  const p = trustProject();
  gitIn(p, ['checkout', '-q', 'side']);
  for (let i = 10; i < 40; i += 1) trustStory(p, `S3-${i}`, ex('T1'));
  gitIn(p, ['add', '-A']);
  gitIn(p, ['commit', '-qm', 'side stories']);
  const main = trust(p, { branch: 'main', panelsFile: path.join(p, 'panels.json') });
  assert.equal(main.tiers.T1.observed.shipped, 4, 'stories only on the checked-out side branch do not count for main');
  const side = trust(p, { branch: 'side', panelsFile: path.join(p, 'panels.json') });
  assert.equal(side.tiers.T1.observed.shipped, 34);
});

test('retro-stats --trust: a stale or missing calibration runs every tier at the maximum panel', () => {
  const p = trustProject();
  const write = (name, doc) => { fs.writeFileSync(path.join(p, name), JSON.stringify(doc)); return path.join(p, name); };
  const stale = trust(p, { panelsFile: write('stale.json', { ...PANELS, stamp: { ...PANELS.stamp, lenses: { 'code-integrity-reviewer': { promptSha256: 'old' } } } }) });
  assert.match(stale.panels.stale.join(), /code-integrity-reviewer prompt changed/);
  assert.equal(stale.tiers.T0.panel, null);
  assert.equal(stale.tiers.T0.bestBound, null, 'a stale calibration shows no bound at all');
  assert.equal(stale.tiers.T1.bestBound, null);
  assert.match(renderTrust(stale), /panels\.json is stale/);
  assert.match(renderTrust(stale), /\| T0 \| \d+ \| unmeasured, maximum panel \| - \|/);
  const corpus = trust(p, { panelsFile: write('corpus.json', { ...PANELS, stamp: { ...PANELS.stamp, corpusSha256: 'old' } }) });
  assert.match(corpus.panels.stale.join(), /corpus changed/);
  assert.equal(corpus.tiers.T0.panel, null);
  const bare = trust(p, { panelsFile: write('bare.json', { tiers: PANELS.tiers }) });
  assert.equal(bare.tiers.T0.panel, null, 'no stamp is no calibration');
  const none = trust(p, { panelsFile: path.join(p, 'missing.json') });
  assert.equal(none.panels.found, false);
  assert.match(renderTrust(none), /\| T0 \| \d+ \| unmeasured, maximum panel \| - \|/);
  assert.match(renderTrust(none), /every merged story to date/);
});

test('retro-stats --trust: integrity blocks and holdout failures come from the committed counters', () => {
  const p = proj();
  // Prose notes no longer count: only the counters and a recorded verdict do.
  trustStory(p, 'S1-1', ex('T2', 0, 0, { integrity_fails: 2, holdout_fails: 3 }), ['- 2026-10-01 holdout FAIL quoted', '- integrity: fail, quoted']);
  trustStory(p, 'S1-2', ex('T2', 0, 0, { holdout_fails: 0 }));
  const { integrity_fails, holdout_fails, ...noCounters } = ex('T1', 0, 0, { integrity: 'fail 1a2b3c4d' });
  trustStory(p, 'S1-3', noCounters);
  trustStory(p, 'S1-4', { ...noCounters, tier: 'T0', integrity: 'failing? no: pass 1a2b3c4d' });
  trustStory(p, 'S1-5', ex('T1', 0, 0, { integrity_fails: 1, integrity: 'fail 1a2b3c4d' }));
  gitProj(p);
  const r = trust(p, { panelsFile: path.join(p, 'none.json') });
  assert.equal(r.tiers.T2.integrityBlocks, 2);
  assert.equal(r.tiers.T2.holdoutFailures, 3);
  assert.equal(r.tiers.T1.integrityBlocks, 2, 'a fail verdict counts once without a counter; the counter wins when present');
  assert.equal(r.tiers.T0.integrityBlocks, 0, 'only a verdict that starts with the word fail counts');
  assert.equal(r.tiers.T1.holdoutFailures, null, 'no T2 story, so holdouts are not recorded');
  const zero = proj();
  trustStory(zero, 'S1-1', ex('T2'));
  gitProj(zero);
  const z = trust(zero, { panelsFile: path.join(zero, 'none.json') });
  assert.equal(z.tiers.T2.holdoutFailures, 0, 'a 0.29 T2 story with no failures records zero, not "not recorded"');
  assert.match(renderTrust(z), /\| T2 \| 1 \| .* \| 0 \| 0 \|$/m);
});

test('retro-stats --trust: a story whose recorded panel lacks a member of the panel in force runs below panel', () => {
  const p = trustProject();
  const panels = path.join(p, 'panels.json');
  const base = trust(p, { panelsFile: panels });
  assert.equal(base.tiers.T0.belowPanel, 0);
  assert.equal(base.tiers.T0.calibratedBound, 0.0488);
  // T0 is calibrated on code-integrity-reviewer: a story without it is below panel.
  trustStory(p, 'S1-6', ex('T0', 0, 0, { panel: ['codex-reviewer'] }));
  // T1 is unmeasured, so the maximum panel is in force: a missing lens is below panel.
  trustStory(p, 'S1-7', ex('T1', 0, 0, { panel: MAX.filter((l) => l !== 'performance-reviewer') }));
  // A codex-builder story's opposite family is code-integrity-reviewer, so it needs no codex-reviewer.
  trustStory(p, 'S1-8', ex('T1', 0, 0, { builder: 'codex-builder', panel: MAX.filter((l) => l !== 'codex-reviewer') }));
  gitIn(p, ['add', '-A']);
  gitIn(p, ['commit', '-qm', 'more stories']);
  const r = trust(p, { panelsFile: panels });
  assert.equal(r.tiers.T0.belowPanel, 1);
  assert.equal(r.tiers.T0.calibratedBound, null, 'the bound is withheld');
  assert.equal(r.tiers.T0.withheld, '1 story ran below panel');
  assert.equal(r.tiers.T1.belowPanel, 1);
  const text = renderTrust(r);
  assert.match(text, /\| T0 \| \d+ \| code-integrity-reviewer \| - \(1 story ran below panel\) \|/);
  assert.match(text, /^T0 below panel: 1$/m);
  assert.match(text, /^T1 below panel: 1$/m);
  assert.match(text, /^T2 below panel: 0$/m);
  // A 0.29 story with no panel recorded at all is below panel too; a pre-0.29 one is not judged.
  const { panel, ...noPanel } = ex('T0');
  trustStory(p, 'S1-6', noPanel);
  trustStory(p, 'S1-9', { ...noPanel, deliver: '0.28.1' });
  gitIn(p, ['add', '-A']);
  gitIn(p, ['commit', '-qm', 'no panel']);
  const m = trust(p, { panelsFile: panels });
  assert.equal(m.tiers.T0.belowPanel, 1);
  assert.equal(m.tiers.T0.withheld, '1 story ran below panel');
});

test('retro-stats --trust: the panel column shows the maximum panel for a tier OVER TARGET forced', () => {
  const p = trustProject();
  const r = trust(p, { branch: 'side', panelsFile: path.join(p, 'panels.json') });
  assert.equal(r.tiers.T0.observed.overTarget, true);
  assert.equal(r.tiers.T0.maximumForced, true);
  assert.match(renderTrust(r), /\| T0 \| \d+ \| maximum panel \(OVER TARGET\) \|/);
  const main = trust(p, { panelsFile: path.join(p, 'panels.json') });
  assert.equal(main.tiers.T0.maximumForced, false);
});

test('retro-stats --trust: project targets come from the plan or the defaults, never from panels.json', () => {
  const p = trustProject();
  // panels.json calibrated T1 at 20% against its own target of 20%.
  const loose = { ...PANELS, tiers: { ...PANELS.tiers, T1: { status: 'measured', panel: [{ lens: 'code-integrity-reviewer', trials: 1 }], bound: 0.2, certifyBound: 0.2, target: 0.2, fpRate: 0.1, tokens: 9000 } } };
  fs.writeFileSync(path.join(p, 'loose.json'), JSON.stringify(loose));
  const r = trust(p, { panelsFile: path.join(p, 'loose.json') });
  assert.equal(r.tiers.T1.target, 0.05, 'the project default, not the panels.json target');
  assert.equal(r.tiers.T1.calibratedBound, null, '20% does not meet the project\'s 5%');
  // The plan's Delivery mode names its own targets.
  fs.writeFileSync(path.join(p, 'docs', 'plan.md'), '# Plan\n\n## Delivery mode\n- Integration branch: main\n- Assurance targets: T0=0.10, T1=0.25, T2=0.02\n');
  gitIn(p, ['commit', '-qam', 'plan targets']);
  const planned = trust(p, { panelsFile: path.join(p, 'loose.json') });
  assert.equal(planned.tiers.T1.target, 0.25);
  assert.equal(planned.tiers.T1.calibratedBound, 0.2);
  const override = trust(p, { panelsFile: path.join(p, 'loose.json'), targets: { T1: 0.1 } });
  assert.equal(override.tiers.T1.target, 0.1, '--targets overrides the plan');
  assert.equal(override.tiers.T1.calibratedBound, null);
});

test('retro-stats --trust: CLI, JSON, a branch override, targets, refused refs, and no git history', () => {
  const p = trustProject();
  const panels = path.join(p, 'panels.json');
  const r = run(p, '--trust', '--sprint', '1', '--panels', panels);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^Trust report, sprint 1\./);
  const side = JSON.parse(run(p, '--trust', '--json', '--branch', 'side', '--panels', panels).stdout);
  assert.equal(side.tiers.T0.observed.escapedStories, 1);
  const loose = JSON.parse(run(p, '--trust', '--json', '--targets', 'T1=0.9', '--panels', panels).stdout);
  assert.equal(loose.tiers.T1.observed.overTarget, false);
  assert.equal(run(p, '--trust', '--targets', 'T1=lots').status, 64);
  assert.equal(run(p, '--trust', '--branch', '--all').status, 64);
  assert.throws(() => trust(p, { branch: '--output=x' }), /refusing ref/);
  assert.equal(run(p, '--audit', '--trust').status, 64);
  assert.equal(run(p, '--branch', 'main').status, 64);
  const bare = proj();
  trustStory(bare, 'S1-1', ex('T1'));
  const nogit = run(bare, '--trust');
  assert.equal(nogit.status, 0, nogit.stderr);
  assert.match(nogit.stdout, /Observed escapes: unknown, could not read history/);
  assert.match(nogit.stdout, /\| T1 \| 1 \|/, 'without git the working tree still gives the stories');
});

// --- WP-D follow-ups ---

test('retro-stats --trust: an unmeasured tier shows its best bound only when every lens behind it is current', () => {
  const p = trustProject();
  const stale = {
    ...PANELS,
    stamp: { ...PANELS.stamp, lenses: { ...PANELS.stamp.lenses, 'codex-reviewer': { model: 'gpt-old', effort: 'high', promptSha256: 'old' } } },
    tiers: { ...PANELS.tiers, T1: { ...PANELS.tiers.T1, bestPanel: [{ lens: 'code-integrity-reviewer', trials: 1 }, { lens: 'codex-reviewer', trials: 1 }] } },
  };
  fs.writeFileSync(path.join(p, 'best.json'), JSON.stringify(stale));
  const r = trust(p, { panelsFile: path.join(p, 'best.json') });
  assert.deepEqual(r.panels.stale, [], 'the measured T0 panel is current');
  assert.equal(r.tiers.T0.calibratedBound, 0.0488);
  assert.equal(r.tiers.T1.bestBound, null, 'a stale lens behind the bound hides it');
  assert.match(renderTrust(r), /\| T1 \| \d+ \| unmeasured, maximum panel \| - \|/);
});

test('retro-stats --trust: a calibratedAt that is not a strict ISO UTC time makes panels.json invalid', () => {
  const p = trustProject();
  for (const at of ['2026-10-10', '2026-10-10 14:30', '2026-10-10T14:30:00+02:00']) {
    fs.writeFileSync(path.join(p, 'odd.json'), JSON.stringify({ ...PANELS, stamp: { ...PANELS.stamp, calibratedAt: at } }));
    const r = trust(p, { panelsFile: path.join(p, 'odd.json') });
    assert.equal(r.panels.valid, false, at);
    assert.match(r.panels.stale.join(), /calibratedAt/, at);
    assert.equal(r.tiers.T0.calibratedBound, null, at);
  }
});

test('retro-stats: a symlinked path to the script still runs the CLI', (t) => {
  const link = path.join(tmpDir('pmlinkbin-'), 'retro-stats.mjs');
  try { fs.symlinkSync(SCRIPT, link, 'file'); } catch { t.skip('symlinks are unavailable here'); return; }
  const r = spawnSync(process.execPath, [link], { encoding: 'utf8', windowsHide: true });
  assert.equal(r.status, 64, r.stderr);
});

// --- fix round 1 ---

// A calibration whose T0 panel is codex-reviewer alone, stamped as the runner runs it now.
const CODEX_T0 = {
  ...PANELS,
  stamp: { ...PANELS.stamp, lenses: { ...PANELS.stamp.lenses, 'codex-reviewer': { model: REVIEW_DEFAULTS.model, effort: REVIEW_DEFAULTS.effort, promptSha256: fileSha(path.join(PLUGIN_ROOT, 'agents', 'codex-reviewer.md')) } } },
  tiers: { ...PANELS.tiers, T0: { ...PANELS.tiers.T0, panel: [{ lens: 'codex-reviewer', trials: 1 }] } },
};
const soloProject = (stories) => {
  const p = proj();
  fs.writeFileSync(path.join(p, 'docs', 'plan.md'), '# Plan\n\n## Delivery mode\n- Integration branch: main\n');
  for (const [id, e] of stories) trustStory(p, id, e);
  gitProj(p);
  return p;
};

test('retro-stats --trust: the panel in force always adds the builder\'s opposite-family lens', () => {
  const p = soloProject([['S1-1', ex('T0', 0, 0, { builder: 'codex-builder', panel: ['codex-reviewer'] })]]);
  fs.writeFileSync(path.join(p, 'codex.json'), JSON.stringify(CODEX_T0));
  const r = trust(p, { panelsFile: path.join(p, 'codex.json') });
  assert.deepEqual(r.panels.stale, []);
  assert.equal(r.tiers.T0.belowPanel, 1, 'a codex-builder story also needs code-integrity-reviewer');
  assert.equal(r.tiers.T0.calibratedBound, null);
  assert.equal(r.tiers.T0.withheld, '1 story ran below panel');
  const ok = soloProject([['S1-1', ex('T0', 0, 0, { builder: 'codex-builder', panel: ['codex-reviewer', 'code-integrity-reviewer'] })]]);
  const o = trust(ok, { panelsFile: path.join(p, 'codex.json') });
  assert.equal(o.tiers.T0.belowPanel, 0);
  assert.equal(o.tiers.T0.calibratedBound, 0.0488);
});

test('retro-stats --trust: a member at two trials needs two occurrences in the recorded panel', () => {
  const twice = { ...PANELS, tiers: { ...PANELS.tiers, T0: { ...PANELS.tiers.T0, panel: [{ lens: 'code-integrity-reviewer', trials: 2 }] } } };
  const once = soloProject([['S1-1', ex('T0', 0, 0, { panel: ['code-integrity-reviewer', 'codex-reviewer'] })]]);
  fs.writeFileSync(path.join(once, 'twice.json'), JSON.stringify(twice));
  const r = trust(once, { panelsFile: path.join(once, 'twice.json') });
  assert.equal(r.tiers.T0.belowPanel, 1);
  assert.equal(r.tiers.T0.calibratedBound, null);
  const both = soloProject([['S1-1', ex('T0', 0, 0, { panel: ['code-integrity-reviewer', 'codex-reviewer', 'code-integrity-reviewer'] })]]);
  assert.equal(trust(both, { panelsFile: path.join(once, 'twice.json') }).tiers.T0.belowPanel, 0);
  // The maximum panel at T2 runs code-integrity-reviewer twice.
  const t2 = soloProject([['S1-1', ex('T2', 0, 0, { panel: MAX })]]);
  assert.equal(trust(t2, { panelsFile: path.join(t2, 'none.json') }).tiers.T2.belowPanel, 1);
});

test('retro-stats --trust: OVER TARGET requires the maximum panel from the sprint after the first escape', () => {
  const measuredPlus = ['code-integrity-reviewer', 'codex-reviewer'];
  const p = soloProject([['S1-1', ex('T0', 0, 0, { panel: measuredPlus })], ['S1-2', ex('T0', 0, 0, { panel: measuredPlus })], ['S2-1', ex('T0', 0, 0, { panel: measuredPlus })], ['S2-2', ex('T0', 0, 0, { panel: MAX })]]);
  commitAt(p, 'chore(S1-1): merged', '2026-10-05T10:00:00Z');
  commitAt(p, 'fix: x\n\nEscaped-From: S1-1', '2026-10-06T10:00:00Z');
  // Same sprint as the escape: the measured panel was still in force.
  commitAt(p, 'chore(S1-2): merged', '2026-10-07T10:00:00Z');
  // The next sprint runs the maximum panel.
  commitAt(p, 'chore(S2-1): merged', '2026-10-09T10:00:00Z');
  commitAt(p, 'chore(S2-2): merged', '2026-10-09T11:00:00Z');
  fs.writeFileSync(path.join(p, 'p.json'), JSON.stringify(PANELS));
  const t = trust(p, { panelsFile: path.join(p, 'p.json') });
  assert.equal(t.tiers.T0.observed.overTarget, true);
  assert.equal(t.tiers.T0.belowPanel, 1, 'only S2-1, in the sprint after the escape, fell short of the maximum panel');
  assert.equal(t.tiers.T0.calibratedBound, null);
  const one = trust(p, { panelsFile: path.join(p, 'p.json'), sprint: 1 });
  assert.equal(one.tiers.T0.belowPanel, 0, 'sprint 1 kept the measured panel');
});

test('retro-stats --trust: an expert-builder story running codex-reviewer meets a codex-reviewer calibration', () => {
  const p = soloProject([['S1-1', ex('T0', 0, 0, { panel: ['codex-reviewer'] })]]);
  fs.writeFileSync(path.join(p, 'codex.json'), JSON.stringify(CODEX_T0));
  const r = trust(p, { panelsFile: path.join(p, 'codex.json') });
  assert.equal(r.tiers.T0.belowPanel, 0);
  assert.equal(r.tiers.T0.calibratedBound, 0.0488);
});

test('retro-stats --trust: the targets line is found by its label whatever it holds; duplicates keep the minimum', () => {
  const at = (line) => {
    const p = trustProject();
    fs.writeFileSync(path.join(p, 'docs', 'plan.md'), `# Plan\n\n## Delivery mode\n- Integration branch: main\n- Assurance targets: ${line}\n`);
    gitIn(p, ['commit', '-qam', 'targets']);
    return trust(p, { panelsFile: path.join(p, 'panels.json') });
  };
  const ticked = at('T0=0.01, T1=`5%`');
  assert.deepEqual([ticked.tiers.T0.target, ticked.tiers.T1.target, ticked.tiers.T2.target], [0.01, 0.05, 0.02]);
  assert.match(ticked.targetsProblem, /T1=5%/);
  const wrapped = at('`T0=0.10, T1=0.25, T2=0.02`');
  assert.equal(wrapped.targetsProblem, null);
  assert.equal(wrapped.tiers.T1.target, 0.25);
  const dup = at('T0=0.10, T0=0.01, T1=0.05, T2=0.02');
  assert.equal(dup.tiers.T0.target, 0.01);
  assert.match(dup.targetsProblem, /T0/);
});

test('retro-stats --trust: an Assurance targets line that does not parse fails closed per tier and says so', () => {
  const p = trustProject();
  fs.writeFileSync(path.join(p, 'docs', 'plan.md'), '# Plan\n\n## Delivery mode\n- Integration branch: main\n- Assurance targets: T0=0.20, T1=5%, T2=0.01\n');
  gitIn(p, ['commit', '-qam', 'odd targets']);
  const r = trust(p, { panelsFile: path.join(p, 'panels.json') });
  assert.deepEqual([r.tiers.T0.target, r.tiers.T1.target, r.tiers.T2.target], [0.1, 0.05, 0.01]);
  assert.match(r.targetsProblem, /T1=5%/);
  assert.match(renderTrust(r), /Assurance targets line in docs\/plan\.md does not parse \(T1=5%\)/);
  const good = trustProject();
  assert.equal(trust(good, { panelsFile: path.join(good, 'panels.json') }).targetsProblem, null);
});

test('retro-stats --trust: a missing counter is not recorded, never zero', () => {
  const { holdout_fails, ...noHoldout } = ex('T2');
  const p = soloProject([['S1-1', ex('T2', 0, 0, { holdout_fails: 1 })], ['S1-2', noHoldout]]);
  const r = trust(p, { panelsFile: path.join(p, 'none.json') });
  assert.equal(r.tiers.T2.holdoutFailures, null, 'one T2 story did not record its holdout counter');
  const { integrity_fails, ...noIntegrity } = ex('T1');
  const q = soloProject([['S1-1', ex('T1', 0, 0, { integrity_fails: 1 })], ['S1-2', noIntegrity], ['S1-3', { ...noIntegrity, tier: 'T0', integrity: undefined }]]);
  const t = trust(q, { panelsFile: path.join(q, 'none.json') });
  assert.equal(t.tiers.T1.integrityBlocks, null, 'a T1 pass verdict without the counter cannot say how many failures came first');
  assert.equal(t.tiers.T0.integrityBlocks, 0, 'T0 runs no integrity gate');
  assert.match(renderTrust(t), /\| T1 \| 2 \| .* \| not recorded \| not recorded \|$/m);
});

// --- fix round 3 ---

const measuredPlus = ['code-integrity-reviewer', 'codex-reviewer'];
const t0 = (updated, panel = measuredPlus) => ex('T0', 0, 0, { updated, panel });

test('retro-stats --trust: maximum panels start the sprint after OVER TARGET first fires, not after the first escape', () => {
  const stories = [];
  for (let i = 1; i <= 50; i += 1) stories.push([`S1-${i}`, t0('2026-10-05 10:00')]);
  for (let i = 1; i <= 10; i += 1) stories.push([`S2-${i}`, t0('2026-10-12 10:00')]);
  stories.push(['S3-1', t0('2026-10-20 10:00')], ['S3-2', t0('2026-10-20 10:00')]);
  const p = soloProject(stories);
  // 1 escape in 50 stays under 10%; the second, over 60 stories, tips it in sprint 2.
  commitAt(p, 'fix: one\n\nEscaped-From: S1-1', '2026-10-06T10:00:00Z');
  commitAt(p, 'fix: two\n\nEscaped-From: S2-1', '2026-10-13T10:00:00Z');
  fs.writeFileSync(path.join(p, 'p.json'), JSON.stringify(PANELS));
  const all = trust(p, { panelsFile: path.join(p, 'p.json') });
  assert.equal(all.tiers.T0.belowPanel, 2, 'only sprint 3 needed the maximum panel');
  assert.equal(all.tiers.T0.maximumForced, true, 'once fired, the tier stays forced until recalibration');
  const two = trust(p, { panelsFile: path.join(p, 'p.json'), sprint: 2 });
  assert.equal(two.tiers.T0.belowPanel, 0);
  assert.equal(two.tiers.T0.maximumForced, false, 'sprint 2 still ran the measured panel');
  assert.doesNotMatch(renderTrust(two), /maximum panel \(OVER TARGET\)/);
  assert.equal(trust(p, { panelsFile: path.join(p, 'p.json'), sprint: 3 }).tiers.T0.maximumForced, true);
});

test('retro-stats --trust: the sprint OVER TARGET fired in is the latest of the escaped story, the fix scope, merges, and claims by then', () => {
  const check = (label, build) => {
    const p = build();
    fs.writeFileSync(path.join(p, 'p.json'), JSON.stringify(PANELS));
    const r = trust(p, { panelsFile: path.join(p, 'p.json') });
    assert.equal(r.tiers.T0.belowPanel, 1, `${label}: only the sprint 3 story falls short`);
    assert.equal(trust(p, { panelsFile: path.join(p, 'p.json'), sprint: 2 }).tiers.T0.maximumForced, false, label);
  };
  check('fix scope', () => {
    const p = soloProject([['S1-1', t0('2026-10-05 10:00')], ['S2-1', t0('2026-10-12 10:00')], ['S3-1', t0('2026-10-20 10:00')]]);
    commitAt(p, 'fix(S2-3): x\n\nEscaped-From: S1-1', '2026-10-06T10:00:00Z');
    return p;
  });
  check('merged by then', () => {
    const p = soloProject([['S1-1', t0('2026-10-05 10:00')], ['S2-1', t0('2026-10-05 12:00')], ['S2-2', t0('2026-10-12 10:00')], ['S3-1', t0('2026-10-20 10:00')]]);
    commitAt(p, 'fix: x\n\nEscaped-From: S1-1', '2026-10-06T10:00:00Z');
    return p;
  });
  check('claimed by then', () => {
    const p = soloProject([['S1-1', t0('2026-10-05 10:00')], ['S2-1', t0('2026-10-12 10:00')], ['S3-1', t0('2026-10-20 10:00')]]);
    commitAt(p, 'chore(S2-1): claim', '2026-10-05T12:00:00Z');
    commitAt(p, 'fix: x\n\nEscaped-From: S1-1', '2026-10-06T10:00:00Z');
    return p;
  });
});

// --- WP-F ---

test('retro-stats --trust: a merged story with no known merge time counts in the OVER TARGET walk and can fire it', () => {
  const { updated, ...noTime } = t0('');
  const p = soloProject([['S1-1', noTime], ['S2-1', t0('2026-10-12 10:00')], ['S3-1', t0('2026-10-20 10:00')]]);
  // The only escape is from the story whose merge time is unknown; it counts from the window start.
  commitAt(p, 'fix(S2-1): x\n\nEscaped-From: S1-1', '2026-10-13T10:00:00Z');
  fs.writeFileSync(path.join(p, 'p.json'), JSON.stringify(PANELS));
  const r = trust(p, { panelsFile: path.join(p, 'p.json') });
  assert.equal(r.tiers.T0.observed.overTarget, true);
  assert.equal(r.tiers.T0.maximumForced, true, 'OVER TARGET fired, so the tier runs the maximum panel');
  assert.equal(r.tiers.T0.belowPanel, 1, 'only the sprint 3 story, after the firing sprint, fell short');
  assert.equal(trust(p, { panelsFile: path.join(p, 'p.json'), sprint: 2 }).tiers.T0.maximumForced, false, 'sprint 2 kept the measured panel');
});

test('retro-stats --trust: the shipped plan template\'s Assurance targets line parses, with or without its trailing comment', () => {
  const template = fs.readFileSync(path.join(PLUGIN_ROOT, 'templates', 'plan.md.template'), 'utf8');
  const line = template.split(/\r?\n/).find((l) => /^\s*-\s*Assurance targets:/.test(l));
  assert.ok(line, 'the template carries an Assurance targets line');
  const edited = line.replace(/T2=[0-9.]+%?/, 'T2=0.01');
  assert.notEqual(edited, line);
  for (const form of [edited, `${edited.replace(/\s*<!--.*?-->\s*$/, '')}   `, `${edited}  `]) {
    const p = trustProject();
    fs.writeFileSync(path.join(p, 'docs', 'plan.md'), `# Plan\n\n## Delivery mode\n- Integration branch: main\n${form}\n`);
    gitIn(p, ['commit', '-qam', 'targets']);
    const r = trust(p, { panelsFile: path.join(p, 'panels.json') });
    assert.equal(r.targetsProblem, null, form);
    assert.equal(r.tiers.T2.target, 0.01, form);
  }
});

// --- WP-F fix round 1 ---

test('retro-stats --trust: an undated story stays out of the walk\'s denominators, so 1 escape in 45 still fires', () => {
  const stories = [];
  for (let i = 1; i <= 45; i += 1) stories.push([`S1-${i}`, t0('2026-10-05 10:00')]);
  const { updated, ...noTime } = t0('');
  stories.push(['S2-1', noTime], ['S3-1', t0('2026-10-20 10:00')]);
  const p = soloProject(stories);
  commitAt(p, 'fix: one\n\nEscaped-From: S1-1', '2026-10-06T10:00:00Z');
  fs.writeFileSync(path.join(p, 'p.json'), JSON.stringify(PANELS));
  const r = trust(p, { panelsFile: path.join(p, 'p.json') });
  assert.equal(r.tiers.T0.observed.shipped, 47, 'the final figure still counts the undated story');
  assert.equal(r.tiers.T0.observed.overTarget, false);
  assert.equal(r.tiers.T0.maximumForced, true, '1 in 45 crossed 10% in sprint 1');
  assert.equal(r.tiers.T0.belowPanel, 2, 'S2-1 and S3-1 ran after the firing sprint');
  assert.equal(trust(p, { panelsFile: path.join(p, 'p.json'), sprint: 1 }).tiers.T0.maximumForced, false);
});

test('retro-stats: firingSprint counts an undated story\'s escapes from the window start, and dates by the earliest known sprint at or after the firing step', () => {
  const window = [{ id: 'S1-1', mergedAt: 1 }, { id: 'S1-2', mergedAt: 2 }, { id: 'S1-3', mergedAt: null }];
  const esc = (story, at, sprint) => ({ commit: `c${at}`, story, at, sprint });
  // The undated S1-3's escape counts from the start: 1 escape in 1 dated story fires at once.
  assert.equal(firingSprint(window, [esc('S1-3', 1.5, 2)], 0.1, (e) => e.sprint), 2);
  // The firing escape has no known sprint; the earliest known one after it wins, not the latest.
  const later = [esc('S1-1', 3, null), esc('S1-2', 4, 4), esc('S1-1', 5, 2)];
  assert.equal(firingSprint(window, later, 0.1, (e) => e.sprint), 2);
  assert.equal(firingSprint(window, [], 0.1, (e) => e.sprint), null);
});

// --- WP-F fix round 2 ---

test('retro-stats: firingSprint falls back to the latest known sprint at or before the firing step', () => {
  // 70 stories: the third escape crosses 10%; it and every later escape have no known sprint.
  const window = Array.from({ length: 70 }, (_, i) => ({ id: `S1-${i + 1}`, mergedAt: 0 }));
  const esc = (story, at, sprint) => ({ commit: `c${at}`, story, at, sprint });
  const escapes = [esc('S1-1', 1, 1), esc('S1-2', 2, 3), esc('S1-3', 3, null), esc('S1-4', 4, null)];
  assert.equal(firingSprint(window, escapes, 0.1, (e) => e.sprint), 3);
});
