#!/usr/bin/env node
// Print one sprint's loop counters from its story files, for the retrospective.
//   node retro-stats.mjs <project-root> [--sprint <n>] [--json] [--audit]
// Reads docs/stories/S<sprint>-<n>-*.md and each story's pm-exec Execution block. Read-only.
// Without --sprint it reports every sprint. --audit instead reports the learned lines in
// AGENTS.md against the retro records. Exit 64 usage, 66 no docs/stories directory.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseExec, listDir, readText } from '../hooks/lib.mjs';

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

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const die = (message, code) => { fs.writeSync(2, `${message}\n`); process.exit(code); };
  const usage = () => die('usage: retro-stats.mjs <project-root> [--sprint <n>] [--json] [--audit]', 64);
  const argv = process.argv.slice(2);
  let root = null;
  let sprint = null;
  let json = false;
  let audit = false;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--json') json = true;
    else if (argv[i] === '--audit') audit = true;
    else if (argv[i] === '--sprint') {
      i += 1;
      if (!/^\d+$/.test(argv[i] || '')) usage();
      sprint = Number(argv[i]);
    } else if (root === null && !argv[i].startsWith('--')) root = argv[i];
    else usage();
  }
  if (root === null) usage();
  if (!fs.existsSync(path.join(root, 'docs', 'stories'))) die(`retro-stats: no docs/stories under ${root}`, 66);
  if (audit) {
    const report = auditLessons(path.resolve(root), sprint);
    fs.writeSync(1, json ? JSON.stringify(report) + '\n' : renderAudit(report));
  } else {
    const stats = collect(path.resolve(root), sprint);
    fs.writeSync(1, json ? JSON.stringify(stats) + '\n' : render(stats));
  }
}
