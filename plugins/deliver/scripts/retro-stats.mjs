#!/usr/bin/env node
// Print one sprint's loop counters from its story files, for the retrospective.
//   node retro-stats.mjs <project-root> [--sprint <n>] [--json] [--audit]
//   node retro-stats.mjs <project-root> --trust [--sprint <n>] [--branch <ref>] [--panels <file>]
//       [--targets T0=0.10,T1=0.05,T2=0.02] [--json]
// Reads docs/stories/S<sprint>-<n>-*.md and each story's pm-exec Execution block. Read-only.
// Without --sprint it reports every sprint. --audit instead reports the learned lines in
// AGENTS.md against the retro records. --trust prints the trust report: per risk tier, what
// shipped, the panel it ran, the calibrated bound, and the escapes observed since, counted from
// `Escaped-From: <story-id>` trailers on the integration branch, or `Escaped-From:
// <project>/<story-id>` to name a project in a repository holding several. Targets are docs/plan.md's
// `- Assurance targets:` line, else 10/5/2%; --targets overrides. A shipped story whose recorded
// `panel` lacks a member of its tier's panel in force is counted below panel, and withholds the
// calibrated bound. Exit 64 usage, 66 no docs/stories directory.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseExec, listDir, readText, isMain, versionAtLeast } from '../hooks/lib.mjs';
import { upperBound, staleness, boundStaleness, parseUtc, parseTargets, DEFAULT_TARGETS, CORPUS_ROOT } from './assurance.mjs';

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

// The Claude review lenses; the maximum panel runs every one plus the opposite family.
export const LENSES = ['code-integrity-reviewer', 'architecture-reviewer', 'security-auditor', 'performance-reviewer'];

// maximumPanel(builder): the lens names of the maximum panel for a story its builder wrote. The
// opposite family of a codex-builder story is code-integrity-reviewer, already a lens; every other
// builder is Claude, so codex-reviewer joins.
export const maximumPanel = (builder) => (builder === 'codex-builder' ? [...LENSES] : [...LENSES, 'codex-reviewer']);

// The lens from the family that did not write the code: every panel carries it.
export const oppositeLens = (builder) => (builder === 'codex-builder' ? 'code-integrity-reviewer' : 'codex-reviewer');

// A stamp of 0.29.0 or later, or a tier with no stamp, which only 0.29 writes.
const isModern = (exec) => {
  if (!exec) return false;
  if (typeof exec.deliver !== 'string') return TIERS.includes(exec.tier);
  return versionAtLeast(exec.deliver, [0, 29, 0]) === true;
};

const counter = (v) => (Number.isInteger(v) && v >= 0 ? v : null);

// storyTexts(root, ref): [{ name, text }] for docs/stories at ref, read from git so the stories
// and the trailers come from the same history; the working tree when ref cannot be read.
function storyTexts(root, ref) {
  const named = (names) => names.filter((n) => /^S\d+-\d+-.*\.md$/.test(n));
  if (ref) {
    // -z: names in their real bytes, never quoted as core.quotePath would quote S1-1-café.md.
    const ls = gitRead(root, ['ls-tree', '-z', '--name-only', ref, 'docs/stories/']);
    if (ls !== null) {
      const names = named(ls.split('\0').filter(Boolean).map((p) => p.split('/').pop()));
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

// projectScope(root, ref): which project's history a commit belongs to, in a repository that may
// hold several deliver projects. A project is a directory with docs/stories/S<n>-<m>-*.md at ref,
// or root itself; `prefix` is root's path below the git top level, `a/b/` or ''. Each file belongs
// to the deepest project holding it, so a top-level project owns the files outside every nested
// one. `solo` when root is the only project, where every commit is its own.
export function projectScope(root, ref) {
  const prefix = (gitRead(root, ['rev-parse', '--show-prefix']) ?? '').trim();
  const projects = new Set([prefix]);
  const ls = ref ? gitRead(root, ['ls-tree', '-r', '-z', '--name-only', '--full-tree', ref]) : null;
  for (const p of (ls ?? '').split('\0')) {
    const m = p.match(/^((?:.*\/)?)docs\/stories\/S\d+-\d+-[^/]*\.md$/);
    if (m) projects.add(m[1]);
  }
  const deepest = [...projects].sort((a, b) => b.length - a.length);
  return { prefix, label: prefix.replace(/\/$/, ''), solo: projects.size === 1, owner: (file) => deepest.find((p) => file.startsWith(p)) ?? '' };
}

// touched(root, commits): sha to the paths, from the top level, that each { sha, parent } changes
// against its first parent (every path for a root commit), read NUL-delimited in one git call.
function touched(root, commits) {
  const out = new Map(commits.map((c) => [c.sha, []]));
  if (!commits.length) return out;
  const raw = gitRead(root, ['diff-tree', '-r', '-z', '--name-only', '--root', '--no-renames', '--stdin'], Buffer.from(commits.map((c) => (c.parent ? `${c.sha} ${c.parent}` : c.sha)).join('\n') + '\n'));
  if (raw === null) return out;
  const order = new Map(commits.map((c, i) => [c.sha, i]));
  let at = -1;
  for (const tok of raw.toString('utf8').split('\0')) {
    if (!tok) continue;
    if (order.has(tok) && order.get(tok) > at) { at = order.get(tok); continue; }
    if (at >= 0) out.get(commits[at].sha).push(tok);
  }
  return out;
}

// ownCommits(root, scope, commits): the shas among commits that count for scope's project: every
// one when it is the only project, else those changing a file the project owns.
function ownCommits(root, scope, commits) {
  if (scope.solo) return new Set(commits.map((c) => c.sha));
  const files = touched(root, commits);
  return new Set(commits.filter((c) => files.get(c.sha).some((f) => scope.owner(f) === scope.prefix)).map((c) => c.sha));
}

// recordTimes(root, ref, word, scope): story id to the committer time (ms, UTC) of the first
// `chore(<id>): <word>` commit on ref (`merged`, `claim`) that belongs to scope's project, or null
// when the history cannot be read. A batch commit naming several ids, `chore(S1-1,S1-2): merged`,
// counts for each.
function recordTimes(root, ref, word, scope = projectScope(root, ref)) {
  const log = gitRead(root, ['log', '-E', `--grep=^chore\\([^)]*\\): ${word}`, '--format=%H%x1f%P%x1f%cI%x1f%s', '--end-of-options', ref, '--']);
  if (log === null) return null;
  const rows = log.split(/\r?\n/).filter(Boolean).map((line) => {
    const [sha, parents = '', when = '', subject = ''] = line.split('\x1f');
    return { sha, parent: parents.split(' ')[0] || null, when, subject };
  });
  const own = ownCommits(root, scope, rows);
  const out = new Map();
  for (const { sha, when, subject } of rows) {
    const m = subject.match(new RegExp(`^chore\\(([^)]*)\\): ${word}\\b`));
    const at = Date.parse(when);
    if (!own.has(sha) || !m || !Number.isFinite(at)) continue;
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

// readStories(root, ref): every story with its tier, status, merge time, and counters. A story
// with no valid `tier` in its Execution block is `untiered`. The merge time is the first merged
// commit's committer time on ref, else the Execution block's `updated`, else null. Integrity
// blocks are the committed `integrity_fails` counter, else 1 for an `integrity` verdict of fail,
// else unknown (null) for a 0.29 T1 or T2 story, whose gate ran but whose count is lost, and 0
// otherwise. Holdout failures are `holdout_fails`, or null when it is missing. `panel` is the lens
// names that ran on every review round, one entry per trial, or null.
function readStories(root, ref, scope) {
  const merges = ref ? recordTimes(root, ref, 'merged', scope) : null;
  return storyTexts(root, ref).map(({ name, text }) => {
    const id = name.match(/^(S\d+-\d+)-/)[1];
    const exec = text === null ? null : parseExec(text);
    const merged = Boolean(exec && exec.status === 'merged');
    const tier = exec && TIERS.includes(exec.tier) ? exec.tier : 'untiered';
    const modern = isModern(exec);
    const integrityCount = counter(exec && exec.integrity_fails);
    const integrityFailed = Boolean(exec && typeof exec.integrity === 'string' && /^fail\b/.test(exec.integrity.trim()));
    return {
      id,
      sprint: Number(id.match(/^S(\d+)-/)[1]),
      tier,
      merged,
      mergedAt: !merged ? null : (merges && merges.has(id) ? merges.get(id) : updatedAt(exec.updated)),
      rounds: count(exec && exec.rounds),
      retries: count(exec && exec.retries),
      builder: exec && typeof exec.builder === 'string' ? exec.builder : null,
      modern,
      panel: exec && Array.isArray(exec.panel) && exec.panel.every((l) => typeof l === 'string') ? exec.panel : null,
      integrityBlocks: integrityCount !== null ? integrityCount : integrityFailed ? 1 : modern && (tier === 'T1' || tier === 'T2') ? null : 0,
      holdoutFailures: counter(exec && exec.holdout_fails),
    };
  });
}

// escapesOn(root, ref, scope): one { commit, story, at, sprint } per story of scope's project named
// on an `Escaped-From:` line in a commit message reachable from ref, or null when the history
// cannot be read. git does the filtering, so a long history never passes through here whole. A
// project-qualified id, `Escaped-From: packages/api/S1-1`, counts for the project at that path
// below the git top level (`./S1-1` for the top level) and no other. A bare id counts when the
// commit belongs to the project (ownCommits): with sibling projects in one repository, when it
// changes a file the project owns.
export function escapesOn(root, ref, scope = projectScope(root, ref)) {
  if (String(ref).startsWith('-')) throw new Error(`refusing ref ${ref}`);
  const log = gitRead(root, ['log', '-i', '-E', '--grep=^Escaped-From:', '--format=%H%x1f%P%x1f%cI%x1f%B%x1e', '--end-of-options', ref, '--']);
  if (log === null) return null;
  const entries = log.split('\x1e').map((entry) => {
    const [sha = '', parents = '', when = '', body = ''] = entry.replace(/^\s+/, '').split('\x1f');
    return { sha: sha.trim(), parent: parents.split(' ')[0] || null, when, body };
  }).filter((e) => e.sha);
  const own = ownCommits(root, scope, entries);
  const out = [];
  for (const { sha, when, body } of entries) {
    const at = Date.parse(when);
    const ids = new Set();
    for (const m of body.matchAll(/^Escaped-From:[ \t]*(.+)$/gim)) {
      for (const tok of m[1].split(/[,\s]+/)) {
        const q = tok.match(/^(?:(.*)\/)?(S\d+-\d+)$/);
        if (!q) continue;
        const where = q[1] === undefined ? null : q[1].replace(/^\.\/?/, '').replace(/\/+$/, '');
        if (where === null ? own.has(sha) : where === scope.label) ids.add(q[2]);
      }
    }
    // The sprint the fix commit's subject names, `fix(S2-1): ...`, when it names one.
    const fixScope = body.split(/\r?\n/)[0].match(/^[\w-]+!?\(\s*S(\d+)-\d+/);
    for (const story of ids) out.push({ commit: sha, story, at: Number.isFinite(at) ? at : null, sprint: fixScope ? Number(fixScope[1]) : null });
  }
  return out;
}

const planBranch = (root) => {
  const m = (readText(path.join(root, 'docs', 'plan.md')) || '').match(/^\s*-\s*Integration branch:\s*`?([A-Za-z0-9._/][A-Za-z0-9._/-]*)`?/m);
  return m ? m[1] : null;
};

// planTargets(text): { targets, problem } from docs/plan.md's Delivery mode line, found by its
// label `- Assurance targets:` whatever follows, such as `T0=0.10, T1=0.05, T2=0.02`. HTML
// comments (`<!-- ... -->`, as the plan template puts on the line), trailing whitespace, and
// backticks are dropped before parsing. No line gives { {}, null }. A line that does not parse whole, with
// a malformed part or a tier given twice, fails closed per tier: each tier takes the smallest of
// its default and every value for it that did parse, and `problem` names what was wrong.
export function planTargets(text) {
  const m = String(text ?? '').match(/^\s*-\s*Assurance targets:(.*)$/m);
  if (!m) return { targets: {}, problem: null };
  const values = {};
  const bad = [];
  const body = m[1].replace(/<!--[\s\S]*?-->/g, '').replace(/<!--.*$/, '').replace(/\s+$/, '');
  for (const raw of body.replace(/`/g, '').split(',')) {
    const part = raw.trim();
    let t = null;
    try { t = parseTargets(part); } catch { t = null; }
    const [k, v] = t ? Object.entries(t)[0] : [];
    if (!k || !TIERS.includes(k)) { bad.push(part || '(empty)'); continue; }
    (values[k] ||= []).push(v);
  }
  for (const [k, vs] of Object.entries(values)) if (vs.length > 1) bad.push(`${k} given ${vs.length} times`);
  if (!bad.length) return { targets: Object.fromEntries(Object.entries(values).map(([k, vs]) => [k, vs[0]])), problem: null };
  const targets = Object.fromEntries(TIERS.map((k) => [k, Math.min(DEFAULT_TARGETS[k], ...(values[k] || []))]));
  return { targets, problem: bad.join(', ') };
}

// observed(shipped, escapes, target, extra): the stories in `shipped`, or among the ids in
// `extra` (numerator only), that `escapes` name, over the stories shipped, with the one-sided 95%
// bound, and whether it is over `target`. Zero escapes over a few stories still leaves a wide
// bound; that is a small sample, not evidence against the calibration, so only an observed escape
// can put a tier over target.
function observed(shipped, escapes, target, extra = []) {
  const ids = new Set([...shipped.map((s) => s.id), ...extra]);
  const mine = escapes.filter((e) => ids.has(e.story));
  const escaped = new Set(mine.map((e) => e.story));
  const bound = upperBound(escaped.size, shipped.length);
  return { shipped: shipped.length, escapedStories: escaped.size, escapeCommits: new Set(mine.map((e) => e.commit)).size, bound, overTarget: escaped.size > 0 && target !== null && bound > target };
}

// firingSprint(window, escapes, target, sprintOfEscape): the sprint OVER TARGET first fired in, or
// null. Walking the window's escapes in time order, it fires at the first escape by which the
// dated stories merged so far, with the escapes so far, exceed the target. A story with no known
// merge time never enters a step's denominator, which would dilute the bound, but its escapes
// count from the window start. The firing step is dated by its escape's sprint, else by the
// earliest known sprint of an escape after it, else by the latest known sprint of one before it,
// so it is null while over target only when no escape's sprint is known; when no step fires but
// the whole window is over target, the last escape is the firing step.
export function firingSprint(window, escapes, target, sprintOfEscape) {
  const dated = window.filter((s) => s.mergedAt !== null);
  const undated = window.filter((s) => s.mergedAt === null).map((s) => s.id);
  const ids = new Set(window.map((s) => s.id));
  const mine = escapes.filter((e) => ids.has(e.story)).sort((a, b) => (a.at ?? Infinity) - (b.at ?? Infinity));
  let step = mine.findIndex((e) => {
    const upTo = e.at ?? Infinity;
    return observed(dated.filter((s) => s.mergedAt <= upTo), mine.filter((x) => (x.at ?? Infinity) <= upTo), target, undated).overTarget;
  });
  if (step < 0) {
    if (!mine.length || !observed(window, escapes, target).overTarget) return null;
    step = mine.length - 1;
  }
  const own = sprintOfEscape(mine[step]);
  if (own !== null) return own;
  const after = mine.slice(step + 1).map(sprintOfEscape).filter((n) => n !== null);
  if (after.length) return Math.min(...after);
  const before = mine.slice(0, step).map(sprintOfEscape).filter((n) => n !== null);
  return before.length ? Math.max(...before) : null;
}

// trust(root, opts): the trust report. Shipped, first pass, fix rounds, integrity blocks, and
// holdout failures cover the chosen sprint, or every sprint without one. Stories and trailers
// both come from the integration branch. A tier counts as calibrated only when panels.json is
// current, the tier is measured, and its certify bound meets the effective target. Any certify
// bound, an unmeasured tier's best one included, shows only when every lens behind it is current.
// OVER TARGET counts only stories merged at or after the calibration in force
// (`stamp.calibratedAt`, compared as full UTC times), so a recalibration starts a fresh window; a
// story with no known merge time is in the window and the final figure, and in the walk for when
// it fired only through its escapes (firingSprint). The to-date figure is informational.
export function trust(root, { sprint = null, branch = null, panelsFile = DEFAULT_PANELS, targets = null } = {}) {
  if (branch !== null && String(branch).startsWith('-')) throw new Error(`refusing ref ${branch}`);
  const ref = branch || planBranch(root) || 'HEAD';
  const resolved = gitRead(root, ['rev-parse', '--verify', '--quiet', '--end-of-options', `${ref}^{commit}`]) !== null;
  const scope = projectScope(root, resolved ? ref : null);
  const stories = readStories(root, resolved ? ref : null, scope);
  let panels = null;
  try { panels = JSON.parse(fs.readFileSync(panelsFile, 'utf8')); } catch { panels = null; }
  const docStale = panels ? staleness(panels) : [];
  const stale = [...docStale];
  // The calibration window starts at calibratedAt, so a stamp that is not a strict UTC time is no
  // calibration at all.
  if (panels && panels.stamp && !Number.isFinite(parseUtc(panels.stamp.calibratedAt))) stale.push(`calibratedAt ${JSON.stringify(panels.stamp.calibratedAt ?? null)} is not an ISO UTC time (YYYY-MM-DDTHH:MM:SS.sssZ)`);
  const valid = Boolean(panels && panels.tiers && stale.length === 0);
  // The project's targets: the plan's, read from the integration branch when it resolves, else the
  // defaults; --targets overrides. panels.json's own targets are what it was calibrated for, never
  // what the project requires.
  const planText = (resolved ? gitRead(root, ['show', `${ref}:./docs/plan.md`]) : null) ?? readText(path.join(root, 'docs', 'plan.md'));
  const fromPlan = planTargets(planText);
  const tgt = { ...DEFAULT_TARGETS, ...fromPlan.targets, ...(targets || {}) };
  const sinceMs = valid ? parseUtc(panels.stamp.calibratedAt) : NaN;
  const since = Number.isFinite(sinceMs) ? panels.stamp.calibratedAt : null;
  const escapes = resolved ? escapesOn(root, ref, scope) : null;
  const claims = resolved ? recordTimes(root, ref, 'claim', scope) : null;
  const sprintOf = (id) => Number(String(id).match(/^S(\d+)-/)?.[1] ?? NaN);
  // escapeSprint(e): the sprint an escape fell in: the latest of the escaped story's sprint, the
  // sprint its fix commit names, and every sprint with a story merged or claimed by then.
  const escapeSprint = (e) => {
    const by = e.at === null ? [] : [
      ...stories.filter((s) => s.merged && s.mergedAt !== null && s.mergedAt <= e.at).map((s) => s.sprint),
      ...(claims ? [...claims].filter(([, at]) => at <= e.at).map(([id]) => sprintOf(id)) : []),
    ];
    const all = [sprintOf(e.story), e.sprint ?? NaN, ...by].filter(Number.isFinite);
    return all.length ? Math.max(...all) : null;
  };
  const tierOf = new Map(stories.map((s) => [s.id, s.tier]));
  const tiers = {};
  for (const t of [...TIERS, 'untiered']) {
    const inSprint = stories.filter((s) => s.tier === t && s.merged && (sprint === null || s.sprint === sprint));
    const shippedAll = stories.filter((s) => s.tier === t && s.merged);
    if (t === 'untiered' && !inSprint.length && !shippedAll.length) continue;
    const entry = panels && panels.tiers ? panels.tiers[t] : null;
    // A bound shows only while every lens behind it, panel or best panel, is still the one measured.
    const certify = valid && entry && typeof entry.certifyBound === 'number' && boundStaleness(panels, t, { docReasons: docStale }).length === 0 ? entry.certifyBound : null;
    const calibrated = Boolean(valid && entry && entry.status === 'measured' && Array.isArray(entry.panel) && certify !== null && tgt[t] !== undefined && certify <= tgt[t]);
    let observedNow = null;
    // The sprint OVER TARGET first fired in (firingSprint). Maximum panels start the sprint after
    // it (retrospective.md) and hold until recalibration; that sprint and earlier ones kept the
    // measured panel.
    let firedSprint = null;
    if (escapes !== null && t !== 'untiered') {
      const window = since === null ? shippedAll : shippedAll.filter((s) => s.mergedAt === null || s.mergedAt >= sinceMs);
      observedNow = { since, ...observed(window, escapes, tgt[t] ?? null) };
      firedSprint = firingSprint(window, escapes, tgt[t] ?? null, escapeSprint);
    }
    // A story whose sprint cannot be read counts as after it.
    const forced = (s) => firedSprint !== null && !(Number.isFinite(s.sprint) && s.sprint <= firedSprint);
    // The panel in force, as lens to trials required. Calibrated and not forced: the measured panel
    // plus the builder's opposite-family lens. Otherwise the maximum panel: every lens plus the
    // opposite family, and at T2 code-integrity-reviewer twice. A 0.29 story whose recorded panel,
    // one entry per trial, falls short of it, or that records none, ran below panel, and the
    // calibrated bound does not cover it.
    const inForce = (s) => {
      const need = new Map();
      const add = (lens, n) => need.set(lens, Math.max(need.get(lens) || 0, n));
      if (calibrated && !forced(s)) {
        for (const m of entry.panel) add(m.lens, Number.isInteger(m.trials) && m.trials > 0 ? m.trials : 1);
        add(oppositeLens(s.builder), 1);
      } else {
        for (const l of maximumPanel(s.builder)) add(l, 1);
        if (t === 'T2') add('code-integrity-reviewer', 2);
      }
      return need;
    };
    const short = (s) => !s.panel || [...inForce(s)].some(([lens, n]) => s.panel.filter((l) => l === lens).length < n);
    const belowPanel = t === 'untiered' ? 0 : inSprint.filter((s) => s.modern && short(s)).length;
    const withheld = calibrated && belowPanel > 0 ? `${belowPanel} ${belowPanel === 1 ? 'story' : 'stories'} ran below panel` : null;
    // Unknown counts make the total unknown, never zero. Holdouts run at T2 only: with no 0.29 T2
    // story here, they were not recorded.
    const sumOrNull = (vals) => (vals.some((v) => v === null) ? null : vals.reduce((n, v) => n + v, 0));
    const modernT2 = inSprint.filter((s) => s.tier === 'T2' && s.modern);
    const holdoutFailures = modernT2.length ? sumOrNull(inSprint.map((s) => (s.tier === 'T2' && s.modern ? s.holdoutFailures : s.holdoutFailures ?? 0))) : null;
    const row = {
      shipped: inSprint.length,
      panel: calibrated ? entry.panel : null,
      calibratedBound: calibrated && !withheld ? certify : null,
      // Only a certify-split bound is ever shown; a select-split figure is not assurance.
      bestBound: !calibrated && valid ? certify : null,
      target: tgt[t] ?? null,
      belowPanel,
      withheld,
      maximumForced: false,
      firstPass: inSprint.filter((s) => s.rounds === 0 && s.retries === 0).length,
      fixRounds: inSprint.reduce((n, s) => n + s.rounds, 0),
      integrityBlocks: sumOrNull(inSprint.map((s) => s.integrityBlocks)),
      holdoutFailures,
      observed: null,
      observedToDate: null,
    };
    if (observedNow) {
      row.observed = observedNow;
      row.observedToDate = observed(shippedAll, escapes, row.target);
    }
    // The report names the maximum panel only for the sprints it was in force.
    row.maximumForced = firedSprint !== null && (sprint === null || sprint > firedSprint);
    if (t === 'untiered') delete row.belowPanel;
    tiers[t] = row;
  }
  const unmapped = escapes === null ? [] : escapes.filter((e) => !tierOf.has(e.story) || tierOf.get(e.story) === 'untiered');
  return { sprint, branch: ref, panels: { file: panelsFile, found: Boolean(panels), valid, stale, since }, targetsProblem: fromPlan.problem, tiers, escapes, unmapped };
}

const pctOf = (x) => (x === null || x === undefined ? '-' : `${(x * 100).toFixed(1)}%`);

export function renderTrust(r) {
  const out = [`Trust report, ${r.sprint === null ? 'all sprints' : `sprint ${r.sprint}`}.`];
  if (!r.panels.found) out.push(`No calibration at ${r.panels.file}: every tier is unmeasured and runs the maximum panel.`);
  else if (r.panels.stale.length) out.push(`panels.json is stale (${r.panels.stale.join('; ')}): every tier runs the maximum panel until /deliver:calibrate re-runs.`);
  if (r.targetsProblem) out.push(`The Assurance targets line in docs/plan.md does not parse (${r.targetsProblem}): each tier uses the stricter of its default and any value that parsed. Fix the line.`);
  out.push('', '| tier | shipped | panel | calibrated bound | target | first pass | fix rounds | integrity blocks | holdout failures |',
    '|------|---------|-------|------------------|--------|------------|------------|------------------|------------------|');
  for (const [t, row] of Object.entries(r.tiers)) {
    const panel = row.maximumForced && row.panel ? 'maximum panel (OVER TARGET)'
      : row.panel ? row.panel.map((m) => (m.trials > 1 ? `${m.lens} x${m.trials}` : m.lens)).join(' + ') : t === 'untiered' ? '-' : 'unmeasured, maximum panel';
    const bound = row.calibratedBound !== null ? pctOf(row.calibratedBound) : row.withheld ? `- (${row.withheld})` : row.bestBound !== null ? `unmeasured (best ${pctOf(row.bestBound)})` : '-';
    const holdout = row.holdoutFailures === null ? 'not recorded' : row.holdoutFailures;
    const integrity = row.integrityBlocks === null ? 'not recorded' : row.integrityBlocks;
    out.push(`| ${t} | ${row.shipped} | ${panel} | ${bound} | ${pctOf(row.target)} | ${row.firstPass}/${row.shipped} | ${row.fixRounds} | ${integrity} | ${holdout} |`);
  }
  out.push('');
  // A story whose recorded panel ran fewer lenses than its tier's panel in force is not covered by
  // that tier's calibration.
  for (const [t, row] of Object.entries(r.tiers)) if (row.belowPanel !== undefined) out.push(`${t} below panel: ${row.belowPanel}`);
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

// isMain compares real paths, so a symlinked path to this file still runs it.
if (isMain(import.meta.url)) {
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
