#!/usr/bin/env node
// deliver SessionStart hook: a short, git-derived resume pointer for a managed project.
//
// Fires on startup, resume, /clear, and post-compaction; stdout becomes context for the
// new session. Prints the approval status, the checked-out story and its Execution block,
// other claimed stories, worktrees, the uncommitted path count, handoff freshness, and the
// wiki line. SILENT (exit 0, no output) outside a managed project, meaning no
// docs/approval.json and no legacy pm-state.json. Fail-open throughout: any git or file
// failure drops that one line, never the session.
import fs from 'node:fs';
import path from 'node:path';

// DELIVER_NO_ENFORCE is the documented kill switch.
if (process.env.DELIVER_NO_ENFORCE === '1') process.exit(0);

// A damaged or missing lib.mjs must not block the session: fail open (silent).
let lib;
try { lib = await import('./lib.mjs'); } catch { process.exit(0); }
const { readHookInput, pmRoot, pmActorId, git, listDir, readApproval, legacyState, parseExec, readText, APPROVAL_REL } = lib;

const input = readHookInput();
const cwd = pmRoot(typeof input?.cwd === 'string' && input.cwd ? input.cwd : process.cwd());
const out = [];
const say = (line) => out.push(line);
// Story and marker fields are repository content another actor wrote: strip control
// characters (including newlines) and cap length before this text becomes session context.
const sanitize = (s) => String(s).replace(/[\x00-\x1f\x7f]+/g, ' ').slice(0, 200);
const v = (x, d) => (x === undefined || x === null || x === '' ? d : sanitize(x));
const chomp = (s) => (s || '').replace(/(\r?\n)+$/, '');
const RESUME = 'To continue: run /deliver:resume.';

if (!fs.existsSync(path.join(cwd, 'docs', 'approval.json'))) {
  const legacy = legacyState(cwd);
  if (legacy) say(`deliver: pre-0.24 state in ${legacy.file}. Run /deliver:resume to migrate it to ${APPROVAL_REL} and story Execution blocks.`);
  finish();
}

const a = readApproval(cwd);
if (!a) {
  say(`deliver: ${APPROVAL_REL} is unreadable.`);
  say(RESUME);
  finish();
}
if (a.status === 'approved') say(`approval: approved by ${v(a.approver, '?')} on ${v(a.approved_date, '?')}`);
else say(`approval: ${v(a.status, '?')} (no implementation writes until approved)`);
const digest = chomp(git(cwd, ['hash-object', 'docs/plan.md']));
if (a.status === 'approved' && typeof a.plan_digest === 'string' && digest && a.plan_digest !== digest) {
  say('plan: docs/plan.md changed since approval (digest mismatch); /deliver:doctor reports it.');
}

const branch = chomp(git(cwd, ['branch', '--show-current'])) || 'DETACHED';
const storiesDir = path.join(cwd, 'docs', 'stories');
const stories = [];
for (const name of listDir(storiesDir).filter((n) => /^S\d+-\d+-.*\.md$/.test(n)).sort()) {
  const text = readText(path.join(storiesDir, name));
  if (text === null) continue;
  stories.push({ id: name.match(/^(S\d+-\d+)-/)[1], exec: parseExec(text) });
}
const me = pmActorId(cwd);
const mine = stories.find((s) => s.exec && s.exec.branch === branch) || stories.find((s) => branch.startsWith(`pm/${s.id}-`));
if (mine) {
  const e = mine.exec || {};
  const notYou = me && e.owner && e.owner !== me ? ' (not you)' : '';
  say(`branch: ${sanitize(branch)} · story ${mine.id} status=${v(e.status, '?')} builder=${v(e.builder, '-')} rounds=${v(e.rounds, '0')}/3 retries=${v(e.retries, '0')}/2 owner=${v(e.owner, '-')}${notYou}`);
} else {
  const unmerged = stories.filter((s) => !s.exec || s.exec.status !== 'merged').map((s) => s.id);
  const list = unmerged.length ? ` (${unmerged.slice(0, 5).join(', ')}${unmerged.length > 5 ? ', ...' : ''})` : '';
  say(`branch: ${sanitize(branch)} · no story checked out · ${unmerged.length} unmerged ${unmerged.length === 1 ? 'story' : 'stories'}${list}`);
}

// Other stories with an unmerged Execution block are claims, whoever holds them. Cap the
// lines, since every line here costs context in every session.
const CLAIM_LINES = 5;
const claims = stories.filter((s) => s !== mine && s.exec && s.exec.status && s.exec.status !== 'merged');
for (const s of claims.slice(0, CLAIM_LINES)) say(`claimed: ${s.id} by ${v(s.exec.owner, '?')} status=${v(s.exec.status, '?')} branch=${v(s.exec.branch, '-')}`);
if (claims.length > CLAIM_LINES) say(`claimed: ${claims.length - CLAIM_LINES} more`);

const worktrees = (git(cwd, ['worktree', 'list', '--porcelain']) || '').split(/\r?\n/).filter((l) => l.startsWith('worktree ')).length;
if (worktrees > 1) say(`worktrees: ${worktrees - 1} besides the main checkout (git worktree list)`);

const porcelain = git(cwd, ['status', '--porcelain', '--untracked-files=all']);
if (porcelain !== null) {
  const n = porcelain.split(/\r?\n/).filter(Boolean).length;
  if (n) say(`uncommitted: ${n} ${n === 1 ? 'path' : 'paths'} (git status)`);
}

if (me) {
  const rel = `docs/handoff/${me}.md`;
  const text = readText(path.join(cwd, 'docs', 'handoff', `${me}.md`));
  if (text !== null) {
    // Current when HEAD is BASE_COMMIT, or when the only commits since it touched nothing but
    // this handoff file: the handoff commit cannot name its own hash.
    const base = (text.match(/^BASE_COMMIT:\s*([0-9a-f]{7,40})/m) || [])[1];
    const head = chomp(git(cwd, ['rev-parse', 'HEAD']));
    let current = Boolean(base && head && head.startsWith(base));
    if (!current && base && head) {
      const changed = git(cwd, ['diff', '--name-only', base, 'HEAD', '--']);
      if (changed !== null) {
        const paths = changed.split(/\r?\n/).filter(Boolean);
        // An empty diff (an empty commit since) changes nothing the handoff describes.
        current = paths.every((p) => p === rel);
      }
    }
    if (current) say(`handoff: ${rel} is current; read it first.`);
    else say(`handoff: ${rel} is STALE (HEAD moved past its BASE_COMMIT); trust git and the story files.`);
  }
}

// One line for the project wiki when it exists: the index is one entry per line.
const index = readText(path.join(cwd, 'docs', 'wiki', 'index.md'));
if (index !== null) say(`wiki: docs/wiki/index.md (${index.split(/\r?\n/).filter((l) => l.startsWith('- ')).length} entries)`);

say(RESUME);
finish();

function finish() {
  // Synchronous write: a stream write immediately followed by process.exit() can be truncated.
  if (out.length) fs.writeSync(1, out.join('\n') + '\n');
  process.exit(0);
}
