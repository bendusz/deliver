import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { tmpDir, gitIn, PLUGIN_ROOT } from './helpers.mjs';
import { collect, render, auditLessons, renderAudit, trust, renderTrust } from '../retro-stats.mjs';
import { upperBound, CORPUS_ROOT } from '../assurance.mjs';

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
const ex = (tier, rounds = 0, retries = 0, extra = {}) => ({ ...exec('expert-builder', rounds, retries), tier, updated: '2026-10-05 10:00', ...extra });
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
  trustStory(p, 'S1-2', ex('T1', 2, 0, { integrity: 'pass' }), ['- 2026-10-01 10:00 integrity: fail, an assertion was removed from test/a.test.mjs.', '- 2026-10-01 11:00 integrity: pass after the fix.']);
  trustStory(p, 'S1-3', ex('T2', 1, 1, { holdout: 'pass' }), ['- 2026-10-02 09:00 holdout FAIL: tmp/holdout/S1-3/limits.test.mjs.', '- 2026-10-02 10:00 holdout: 0 failures after the fix.']);
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
    shipped: 3, panel: null, calibratedBound: null, bestBound: 0.0617, target: 0.05, firstPass: 2, fixRounds: 2, integrityBlocks: 1, holdoutFailures: null,
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

test('retro-stats --trust: notes stop at the next heading', () => {
  const p = proj();
  trustStory(p, 'S1-1', ex('T2'), ['- 2026-10-01 holdout: 2 failures', '- 2026-10-01 holdout: 0 failed on the rerun', '- 2026-10-01 holdout pass, no failures', '', '## Later', '- integrity: fail, quoted from elsewhere', '- holdout FAIL quoted']);
  gitProj(p);
  const r = trust(p, { panelsFile: path.join(p, 'none.json') });
  assert.equal(r.tiers.T2.holdoutFailures, 1);
  assert.equal(r.tiers.T2.integrityBlocks, 0);
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
