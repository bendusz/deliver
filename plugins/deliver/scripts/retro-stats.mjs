#!/usr/bin/env node
// Print one sprint's loop counters from its story files, for the retrospective.
//   node retro-stats.mjs <project-root> [--sprint <n>] [--json] [--audit]
//   node retro-stats.mjs <project-root> --trust [--sprint <n>] [--branch <ref>] [--panels <file>]
//       [--targets T0=0.10,T1=0.05,T2=0.02] [--json]
// Reads docs/stories/S<sprint>-<n>-*.md and each story's pm-exec Execution block. Read-only.
// Without --sprint it reports every sprint. --audit instead reports the learned lines in
// AGENTS.md against the retro records. --trust prints the trust report: per risk tier, what
// shipped, the panel it ran, the calibrated bound, and the escapes observed since, counted from
// `Escaped-From: <story-id>` trailers on the integration branch. Exit 64 usage, 66 no
// docs/stories directory.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { parseExec, listDir, readText } from '../hooks/lib.mjs';
import { upperBound, staleness, parseTargets, DEFAULT_TARGETS, CORPUS_ROOT } from './assurance.mjs';

const count = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);

// collect(root, sprint): { stories, builders, totals }. A story with no Execution block was
// never claimed and is reported as not-started; an unreadable one as unreadable.
export function collect(root, sprint = null) {
  const dir = path.join(root, 'docs', 'stories');
  const stories = [];
  for (const name of listDir(dir).filter((n) => /^S\d+-\d+-.*\.md$/.test(n)).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))) {
    const id = name.match(/^(S\d+-\d+)-/)[1];
    const s = Number(id.match(/^S(\d+)-/)[1]);
    if (sprint !== null && s !== sprint) continue;
    const text = readText(path.join(dir, name));
    const exec = text === null ? null : parseExec(text);
    stories.push({
      id,
      sprint: s,
      builder: exec && typeof exec.builder === 'string' ? exec.builder : null,
      status: text === null ? 'unreadable' : exec && typeof exec.status === 'string' ? exec.status : 'not-started',
      rounds: count(exec && exec.rounds),
      retries: count(exec && exec.retries),
      deliver: exec && typeof exec.deliver === 'string' ? exec.deliver : null,
    });
  }
  const tally = (key) => {
    const groups = {};
    for (const st of stories) {
      if (!st[key]) continue;
      const g = groups[st[key]] || (groups[st[key]] = { stories: 0, rounds: 0, retries: 0, clean: 0 });
      g.stories += 1;
      g.rounds += st.rounds;
      g.retries += st.retries;
      if (st.rounds === 0 && st.retries === 0) g.clean += 1;
    }
    return groups;
  };
  const builders = tally('builder');
  // Stories claimed before 0.28 carry no stamp and are left out of this table.
  const versions = tally('deliver');
  const totals = { stories: stories.length, rounds: 0, retries: 0, unmerged: 0 };
  for (const st of stories) {
    totals.rounds += st.rounds;
    totals.retries += st.retries;
    if (st.status !== 'merged') totals.unmerged += 1;
  }
  return { sprint, stories, builders, versions, totals };
}

export function render(stats) {
  const out = ['| story | builder | status | rounds | retries |', '|-------|---------|--------|--------|---------|'];
  for (const s of stats.stories) out.push(`| ${s.id} | ${s.builder || '-'} | ${s.status} | ${s.rounds} | ${s.retries} |`);
  out.push('', '| builder | stories | rounds | retries | clean first pass |', '|---------|---------|--------|---------|------------------|');
  for (const [name, b] of Object.entries(stats.builders).sort(([a], [z]) => a.localeCompare(z))) {
    out.push(`| ${name} | ${b.stories} | ${b.rounds} | ${b.retries} | ${b.clean} |`);
  }
  if (Object.keys(stats.versions).length > 1) {
    out.push('', '| deliver | stories | rounds | retries | clean first pass |', '|---------|---------|--------|---------|------------------|');
    for (const [name, v] of Object.entries(stats.versions).sort(([a], [z]) => a.localeCompare(z, 'en', { numeric: true }))) {
      out.push(`| ${name} | ${v.stories} | ${v.rounds} | ${v.retries} | ${v.clean} |`);
    }
  }
  const t = stats.totals;
  out.push('', `Total: ${t.stories} stories, ${t.rounds} fix rounds, ${t.retries} retries, ${t.unmerged} not merged.`);
  return out.join('\n') + '\n';
}

// auditLessons(root, sprint): the learned lines in AGENTS.md, each tagged `[L<sprint>-<n>]`,
// against the Lessons tables in docs/retros/sprint-<n>.md. A lesson is `due` when its review-by
// sprint has arrived and no later retro cited its id, and `orphan` when no retro recorded it.
export function auditLessons(root, sprint = null) {
  const agents = readText(path.join(root, 'AGENTS.md')) || '';
  const lines = agents.split(/\r?\n/);
  const retroDir = path.join(root, 'docs', 'retros');
  const retros = [];
  for (const name of listDir(retroDir)) {
    const m = name.match(/^sprint-(\d+)\.md$/);
    if (m) retros.push({ sprint: Number(m[1]), text: readText(path.join(retroDir, name)) || '' });
  }
  const current = sprint !== null ? sprint : retros.reduce((max, r) => Math.max(max, r.sprint), 0) + 1;
  const lessons = [];
  for (const line of lines) {
    const tag = line.match(/\[(L(\d+)-\d+)\]/);
    if (!tag) continue;
    const id = tag[1];
    const added = Number(tag[2]);
    let reviewBy = null;
    let recorded = false;
    let lastCited = null;
    for (const r of retros) {
      const row = r.text.split(/\r?\n/).find((l) => l.startsWith('|') && l.split('|')[1].trim() === id);
      if (row && r.sprint === added) {
        recorded = true;
        const by = row.match(/sprint\s+(\d+)\s*\|\s*$/i);
        if (by) reviewBy = Number(by[1]);
      } else if (r.sprint > added && r.text.includes(id) && (lastCited === null || r.sprint > lastCited)) {
        lastCited = r.sprint;
      }
    }
    const status = !recorded ? 'orphan' : reviewBy !== null && current >= reviewBy && lastCited === null ? 'due' : 'keep';
    lessons.push({ id, added, review_by: reviewBy, last_cited: lastCited, status, line: line.trim() });
  }
  return { sprint: current, agents_lines: agents ? lines.length - (agents.endsWith('\n') ? 1 : 0) : 0, lessons };
}

export function renderAudit(audit) {
  const out = [`AGENTS.md: ${audit.agents_lines} lines, ${audit.lessons.length} learned. Audited for sprint ${audit.sprint}.`];
  if (audit.lessons.length) {
    out.push('', '| id | added | review by | last cited | status |', '|----|-------|-----------|------------|--------|');
    for (const l of audit.lessons) {
      out.push(`| ${l.id} | sprint ${l.added} | ${l.review_by === null ? '-' : `sprint ${l.review_by}`} | ${l.last_cited === null ? '-' : `sprint ${l.last_cited}`} | ${l.status} |`);
    }
  }
  return out.join('\n') + '\n';
}

// ---------- trust report ----------

export const TIERS = ['T0', 'T1', 'T2'];
const DEFAULT_PANELS = path.join(CORPUS_ROOT, 'panels.json');

// gitRead(root, args, input): git output, with room for a long history, or null on any failure.
function gitRead(root, args, input) {
  try {
    return execFileSync('git', ['-C', root, ...args], { encoding: input === undefined ? 'utf8' : 'buffer', input, stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true, timeout: 30000, maxBuffer: 256 * 1024 * 1024 });
  } catch {
    return null;
  }
}

// The Execution section's dated note lines: below the pm-exec comment, up to the next heading.
export function execNotes(text) {
  const lines = String(text).split(/\r?\n/);
  const at = lines.findIndex((l) => /^## Execution\s*$/.test(l));
  if (at < 0) return [];
  const out = [];
  for (const l of lines.slice(at + 1)) {
    if (/^#{1,2} /.test(l)) break;
    if (/^\s*-\s/.test(l)) out.push(l);
  }
  return out;
}

// A holdout note reports a failure when it says FAIL, failed, or failures, unless every such word
// follows a zero: "holdout: 0 failures", "0 failed", and "no failures" are passes.
const holdoutFailed = (l) => /\bfail(?:ed|ures?)?\b/i.test(String(l).replace(/\b(?:0|no|zero)\s+fail(?:ed|ures?)?\b/gi, ''));

// storyTexts(root, ref): [{ name, text }] for docs/stories at ref, read from git so the stories
// and the trailers come from the same history; the working tree when ref cannot be read.
function storyTexts(root, ref) {
  const named = (names) => names.filter((n) => /^S\d+-\d+-.*\.md$/.test(n));
  if (ref) {
    const ls = gitRead(root, ['ls-tree', '--name-only', ref, 'docs/stories/']);
    if (ls !== null) {
      const names = named(ls.split(/\r?\n/).filter(Boolean).map((p) => p.split('/').pop()));
      if (!names.length) return [];
      // `ref:./path` resolves against the working directory, as ls-tree's path above does, so a
      // project inside a larger repository reads its own docs/stories.
      const blob = gitRead(root, ['cat-file', '--batch'], Buffer.from(names.map((n) => `${ref}:./docs/stories/${n}`).join('\n') + '\n'));
      if (blob !== null) {
        const out = [];
        let pos = 0;
        for (const name of names) {
          const nl = blob.indexOf(0x0a, pos);
          const header = blob.subarray(pos, nl).toString('utf8');
          const m = header.match(/^\S+ blob (\d+)$/);
          if (!m) { out.push({ name, text: null }); pos = nl + 1; continue; }
          const size = Number(m[1]);
          out.push({ name, text: blob.subarray(nl + 1, nl + 1 + size).toString('utf8') });
          pos = nl + 1 + size + 1;
        }
        return out;
      }
    }
  }
  const dir = path.join(root, 'docs', 'stories');
  return named(listDir(dir)).map((name) => ({ name, text: readText(path.join(dir, name)) }));
}

// mergeTimes(root, ref): story id to the committer time (ms, UTC) of the first `chore(<id>):
// merged` commit on ref, or null when the history cannot be read. A batch commit naming several
// ids, `chore(S1-1,S1-2): merged`, counts for each.
function mergeTimes(root, ref) {
  const log = gitRead(root, ['log', '-E', '--grep=^chore\\([^)]*\\): merged', '--format=%cI%x1f%s', '--end-of-options', ref, '--']);
  if (log === null) return null;
  const out = new Map();
  for (const line of log.split(/\r?\n/)) {
    const [when, subject = ''] = line.split('\x1f');
    const m = subject.match(/^chore\(([^)]*)\): merged\b/);
    const at = Date.parse(when);
    if (!m || !Number.isFinite(at)) continue;
    for (const id of m[1].split(/[,\s]+/)) if (/^S\d+-\d+$/.test(id) && (!out.has(id) || at < out.get(id))) out.set(id, at);
  }
  return out;
}

// The Execution block's `updated`, `YYYY-MM-DD HH:MM`, read as UTC. A fallback only.
const updatedAt = (v) => {
  const m = typeof v === 'string' && v.match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}(?::\d{2})?))?/);
  if (!m) return null;
  const at = Date.parse(`${m[1]}T${m[2] || '00:00'}${m[2] && m[2].length === 5 ? ':00' : ''}Z`);
  return Number.isFinite(at) ? at : null;
};

// readStories(root, ref): every story with its tier, status, merge time, counters, and gate
// notes. A story with no valid `tier` in its Execution block is `untiered`. The merge time is the
// first merged commit's committer time on ref, else the Execution block's `updated`, else null.
function readStories(root, ref) {
  const merges = ref ? mergeTimes(root, ref) : null;
  return storyTexts(root, ref).map(({ name, text }) => {
    const id = name.match(/^(S\d+-\d+)-/)[1];
    const exec = text === null ? null : parseExec(text);
    const notes = text === null ? [] : execNotes(text);
    const integrityNotes = notes.filter((l) => /\bintegrity:\s*fail/i.test(l)).length;
    const holdoutNotes = notes.filter((l) => /\bholdout\b/i.test(l));
    const merged = Boolean(exec && exec.status === 'merged');
    return {
      id,
      sprint: Number(id.match(/^S(\d+)-/)[1]),
      tier: exec && TIERS.includes(exec.tier) ? exec.tier : 'untiered',
      merged,
      mergedAt: !merged ? null : (merges && merges.has(id) ? merges.get(id) : updatedAt(exec.updated)),
      rounds: count(exec && exec.rounds),
      retries: count(exec && exec.retries),
      integrityBlocks: integrityNotes || (exec && exec.integrity === 'fail' ? 1 : 0),
      holdoutRecorded: holdoutNotes.length > 0 || Boolean(exec && exec.holdout),
      holdoutFailures: holdoutNotes.filter(holdoutFailed).length || (exec && exec.holdout === 'fail' ? 1 : 0),
    };
  });
}

// escapesOn(root, ref): one { commit, story } per story named on an `Escaped-From:` line in a
// commit message reachable from ref, or null when the history cannot be read. git does the
// filtering, so a long history never passes through here whole.
export function escapesOn(root, ref) {
  if (String(ref).startsWith('-')) throw new Error(`refusing ref ${ref}`);
  const log = gitRead(root, ['log', '-i', '-E', '--grep=^Escaped-From:', '--format=%H%x1f%B%x1e', '--end-of-options', ref, '--']);
  if (log === null) return null;
  const out = [];
  for (const entry of log.split('\x1e')) {
    const [sha, body = ''] = entry.replace(/^\s+/, '').split('\x1f');
    if (!sha) continue;
    const ids = new Set();
    for (const m of body.matchAll(/^Escaped-From:[ \t]*(.+)$/gim)) {
      for (const id of m[1].split(/[,\s]+/)) if (/^S\d+-\d+$/.test(id)) ids.add(id);
    }
    for (const story of ids) out.push({ commit: sha.trim(), story });
  }
  return out;
}

const planBranch = (root) => {
  const m = (readText(path.join(root, 'docs', 'plan.md')) || '').match(/^\s*-\s*Integration branch:\s*`?([A-Za-z0-9._/][A-Za-z0-9._/-]*)`?/m);
  return m ? m[1] : null;
};

// observed(shipped, escapes, tierOf, tier, target): escaped stories over stories shipped, with
// the one-sided 95% bound. Zero escapes over a few stories still leaves a wide bound; that is a
// small sample, not evidence against the calibration, so only an observed escape can put a tier
// over target.
function observed(shipped, escapes, target) {
  const ids = new Set(shipped.map((s) => s.id));
  const mine = escapes.filter((e) => ids.has(e.story));
  const escaped = new Set(mine.map((e) => e.story));
  const bound = upperBound(escaped.size, shipped.length);
  return { shipped: shipped.length, escapedStories: escaped.size, escapeCommits: new Set(mine.map((e) => e.commit)).size, bound, overTarget: escaped.size > 0 && target !== null && bound > target };
}

// trust(root, opts): the trust report. Shipped, first pass, fix rounds, integrity blocks, and
// holdout failures cover the chosen sprint, or every sprint without one. Stories and trailers
// both come from the integration branch. A tier counts as calibrated only when panels.json is
// current, the tier is measured, and its certify bound meets the effective target. OVER TARGET
// counts only stories merged at or after the calibration in force (`stamp.calibratedAt`, compared
// as full UTC times), so a recalibration starts a fresh window; a story with no known merge time
// is counted, the conservative choice. The to-date figure is informational.
export function trust(root, { sprint = null, branch = null, panelsFile = DEFAULT_PANELS, targets = null } = {}) {
  if (branch !== null && String(branch).startsWith('-')) throw new Error(`refusing ref ${branch}`);
  const ref = branch || planBranch(root) || 'HEAD';
  const resolved = gitRead(root, ['rev-parse', '--verify', '--quiet', '--end-of-options', `${ref}^{commit}`]) !== null;
  const stories = readStories(root, resolved ? ref : null);
  let panels = null;
  try { panels = JSON.parse(fs.readFileSync(panelsFile, 'utf8')); } catch { panels = null; }
  const stale = panels ? staleness(panels) : [];
  const valid = Boolean(panels && panels.tiers && stale.length === 0);
  const tgt = { ...DEFAULT_TARGETS };
  if (panels && panels.tiers) for (const t of TIERS) if (panels.tiers[t] && typeof panels.tiers[t].target === 'number') tgt[t] = panels.tiers[t].target;
  Object.assign(tgt, targets || {});
  const sinceMs = valid ? Date.parse(panels.stamp.calibratedAt) : NaN;
  const since = Number.isFinite(sinceMs) ? panels.stamp.calibratedAt : null;
  const escapes = resolved ? escapesOn(root, ref) : null;
  const tierOf = new Map(stories.map((s) => [s.id, s.tier]));
  const tiers = {};
  for (const t of [...TIERS, 'untiered']) {
    const inSprint = stories.filter((s) => s.tier === t && s.merged && (sprint === null || s.sprint === sprint));
    const shippedAll = stories.filter((s) => s.tier === t && s.merged);
    if (t === 'untiered' && !inSprint.length && !shippedAll.length) continue;
    const entry = panels && panels.tiers ? panels.tiers[t] : null;
    const certify = entry && typeof entry.certifyBound === 'number' ? entry.certifyBound : null;
    const calibrated = Boolean(valid && entry && entry.status === 'measured' && certify !== null && tgt[t] !== undefined && certify <= tgt[t]);
    const row = {
      shipped: inSprint.length,
      panel: calibrated ? entry.panel : null,
      calibratedBound: calibrated ? certify : null,
      // Only a certify-split bound is ever shown; a select-split figure is not assurance.
      bestBound: !calibrated && valid ? certify : null,
      target: tgt[t] ?? null,
      firstPass: inSprint.filter((s) => s.rounds === 0 && s.retries === 0).length,
      fixRounds: inSprint.reduce((n, s) => n + s.rounds, 0),
      integrityBlocks: inSprint.reduce((n, s) => n + s.integrityBlocks, 0),
      holdoutFailures: inSprint.some((s) => s.holdoutRecorded) ? inSprint.reduce((n, s) => n + s.holdoutFailures, 0) : null,
      observed: null,
      observedToDate: null,
    };
    if (escapes !== null && t !== 'untiered') {
      const window = since === null ? shippedAll : shippedAll.filter((s) => s.mergedAt === null || s.mergedAt >= sinceMs);
      row.observed = { since, ...observed(window, escapes, row.target) };
      row.observedToDate = observed(shippedAll, escapes, row.target);
    }
    tiers[t] = row;
  }
  const unmapped = escapes === null ? [] : escapes.filter((e) => !tierOf.has(e.story) || tierOf.get(e.story) === 'untiered');
  return { sprint, branch: ref, panels: { file: panelsFile, found: Boolean(panels), valid, stale, since }, tiers, escapes, unmapped };
}

const pctOf = (x) => (x === null || x === undefined ? '-' : `${(x * 100).toFixed(1)}%`);

export function renderTrust(r) {
  const out = [`Trust report, ${r.sprint === null ? 'all sprints' : `sprint ${r.sprint}`}.`];
  if (!r.panels.found) out.push(`No calibration at ${r.panels.file}: every tier is unmeasured and runs the maximum panel.`);
  else if (r.panels.stale.length) out.push(`panels.json is stale (${r.panels.stale.join('; ')}): every tier runs the maximum panel until /deliver:calibrate re-runs.`);
  out.push('', '| tier | shipped | panel | calibrated bound | target | first pass | fix rounds | integrity blocks | holdout failures |',
    '|------|---------|-------|------------------|--------|------------|------------|------------------|------------------|');
  for (const [t, row] of Object.entries(r.tiers)) {
    const panel = row.panel ? row.panel.map((m) => (m.trials > 1 ? `${m.lens} x${m.trials}` : m.lens)).join(' + ') : t === 'untiered' ? '-' : 'unmeasured, maximum panel';
    const bound = row.calibratedBound !== null ? pctOf(row.calibratedBound) : row.bestBound !== null ? `unmeasured (best ${pctOf(row.bestBound)})` : '-';
    const holdout = row.holdoutFailures === null ? 'not recorded' : row.holdoutFailures;
    out.push(`| ${t} | ${row.shipped} | ${panel} | ${bound} | ${pctOf(row.target)} | ${row.firstPass}/${row.shipped} | ${row.fixRounds} | ${row.integrityBlocks} | ${holdout} |`);
  }
  out.push('');
  if (r.escapes === null) out.push(`Observed escapes: unknown, could not read history at ${r.branch}.`);
  else {
    const window = r.panels.since ? `stories merged since the calibration of ${r.panels.since}` : 'every merged story to date (no calibration in force)';
    out.push(`Observed escapes on ${r.branch}, ${window} (\`Escaped-From:\` trailers):`, '',
      '| tier | stories shipped | escaped stories | escape commits | 95% bound | target | flag | to date |',
      '|------|-----------------|-----------------|----------------|-----------|--------|------|---------|');
    for (const [t, row] of Object.entries(r.tiers)) {
      if (!row.observed) continue;
      const o = row.observed;
      const d = row.observedToDate;
      const flag = o.overTarget ? 'OVER TARGET: maximum panel next sprint'
        : o.escapedStories === 0 && row.target !== null && o.bound > row.target ? 'no escapes; too few stories to bound under target' : 'ok';
      out.push(`| ${t} | ${o.shipped} | ${o.escapedStories} | ${o.escapeCommits} | ${pctOf(o.bound)} | ${pctOf(row.target)} | ${flag} | ${d.escapedStories}/${d.shipped}, ${pctOf(d.bound)} |`);
    }
    if (r.unmapped.length) out.push('', `Escapes naming a story with no tier or no story file: ${[...new Set(r.unmapped.map((e) => e.story))].join(', ')}.`);
  }
  return out.join('\n') + '\n';
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const die = (message, code) => { fs.writeSync(2, `${message}\n`); process.exit(code); };
  const usage = () => die('usage: retro-stats.mjs <project-root> [--sprint <n>] [--json] [--audit | --trust [--branch <ref>] [--panels <file>] [--targets T0=0.10,T1=0.05,T2=0.02]]', 64);
  const argv = process.argv.slice(2);
  let root = null;
  let sprint = null;
  let json = false;
  let audit = false;
  let trustMode = false;
  const trustOpts = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--json') json = true;
    else if (argv[i] === '--audit') audit = true;
    else if (argv[i] === '--trust') trustMode = true;
    else if (['--branch', '--panels', '--targets'].includes(argv[i])) {
      const key = argv[i];
      i += 1;
      if (!argv[i]) usage();
      if (key === '--branch') { if (argv[i].startsWith('-')) usage(); trustOpts.branch = argv[i]; }
      else if (key === '--panels') trustOpts.panelsFile = path.resolve(argv[i]);
      else { try { trustOpts.targets = parseTargets(argv[i]); } catch { usage(); } }
    }
    else if (argv[i] === '--sprint') {
      i += 1;
      if (!/^\d+$/.test(argv[i] || '')) usage();
      sprint = Number(argv[i]);
    } else if (root === null && !argv[i].startsWith('--')) root = argv[i];
    else usage();
  }
  if (root === null || (audit && trustMode) || (Object.keys(trustOpts).length && !trustMode)) usage();
  if (!fs.existsSync(path.join(root, 'docs', 'stories'))) die(`retro-stats: no docs/stories under ${root}`, 66);
  if (trustMode) {
    const report = trust(path.resolve(root), { sprint, ...trustOpts });
    fs.writeSync(1, json ? JSON.stringify(report) + '\n' : renderTrust(report));
  } else if (audit) {
    const report = auditLessons(path.resolve(root), sprint);
    fs.writeSync(1, json ? JSON.stringify(report) + '\n' : renderAudit(report));
  } else {
    const stats = collect(path.resolve(root), sprint);
    fs.writeSync(1, json ? JSON.stringify(stats) + '\n' : render(stats));
  }
}
