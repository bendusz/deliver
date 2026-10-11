import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpDir, PLUGIN_ROOT } from './helpers.mjs';
import { collect, render, auditLessons, renderAudit } from '../retro-stats.mjs';

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
