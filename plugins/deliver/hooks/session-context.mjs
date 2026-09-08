#!/usr/bin/env node
// deliver SessionStart hook: a short, git-derived resume pointer for a managed project.
//
// Fires on startup, resume, /clear, and post-compaction; stdout becomes context for the
// new session. Renders lib.mjs's inspectState(): the approval status, the derived phase
// and the reference to load, the checked-out story and its Execution block, other claimed
// stories, worktrees, the uncommitted path count, handoff freshness, and the wiki line.
// SILENT (exit 0, no output) outside a managed project. Fail-open throughout: any git or
// file failure drops that one line, never the session.
import fs from 'node:fs';

// DELIVER_NO_ENFORCE is the documented kill switch.
if (process.env.DELIVER_NO_ENFORCE === '1') process.exit(0);

// A damaged or missing lib.mjs must not block the session: fail open (silent).
let lib;
try { lib = await import('./lib.mjs'); } catch { process.exit(0); }
const { readHookInput, pmRoot, inspectState, APPROVAL_REL } = lib;

const input = readHookInput();
const cwd = pmRoot(typeof input?.cwd === 'string' && input.cwd ? input.cwd : process.cwd());
const out = [];
const say = (line) => out.push(line);
// Story and marker fields are repository content another actor wrote: strip control
// characters (including newlines) and cap length before this text becomes session context.
const sanitize = (s) => String(s).replace(/[\x00-\x1f\x7f]+/g, ' ').slice(0, 200);
const v = (x, d) => (x === undefined || x === null || x === '' ? d : sanitize(x));
const RESUME = 'To continue: run /deliver:resume.';

let st = null;
try { st = inspectState(cwd); } catch { st = null; }
if (!st) finish();
if (st.legacy) {
  say(`deliver: pre-0.24 state in ${st.legacy}. Run /deliver:resume to migrate it to ${APPROVAL_REL} and story Execution blocks.`);
  finish();
}
if (!st.approval) {
  say(`deliver: ${APPROVAL_REL} is unreadable.`);
  say(RESUME);
  finish();
}
const a = st.approval;
if (a.status === 'approved') say(`approval: approved by ${v(a.approver, '?')} on ${v(a.approved_date, '?')}`);
else say(`approval: ${v(a.status, '?')} (no implementation writes until approved)`);
if (a.plan_changed) say('plan: docs/plan.md changed since approval (digest mismatch); implementation writes are blocked until /deliver:correct-course runs or plan_digest is refreshed.');
say(`phase: ${st.phase} · load ${st.next_reference}`);

if (st.story) {
  const e = st.story.exec || {};
  const notYou = st.actor && e.owner && e.owner !== st.actor ? ' (not you)' : '';
  say(`branch: ${sanitize(st.branch)} · story ${st.story.id} status=${v(e.status, '?')} builder=${v(e.builder, '-')} rounds=${v(e.rounds, '0')}/3 retries=${v(e.retries, '0')}/2 owner=${v(e.owner, '-')}${notYou}`);
} else {
  const n = st.unmerged.length;
  const list = n ? ` (${st.unmerged.slice(0, 5).join(', ')}${n > 5 ? ', ...' : ''})` : '';
  say(`branch: ${sanitize(st.branch)} · no story checked out · ${n} unmerged ${n === 1 ? 'story' : 'stories'}${list}`);
}

// Other stories with an unmerged Execution block are claims, whoever holds them. Cap the
// lines, since every line here costs context in every session.
const CLAIM_LINES = 5;
for (const c of st.claims.slice(0, CLAIM_LINES)) say(`claimed: ${c.id} by ${v(c.owner, '?')} status=${v(c.status, '?')} branch=${v(c.branch, '-')}`);
if (st.claims.length > CLAIM_LINES) say(`claimed: ${st.claims.length - CLAIM_LINES} more`);
if (st.worktrees > 0) say(`worktrees: ${st.worktrees} besides the main checkout (git worktree list)`);
if (st.uncommitted) say(`uncommitted: ${st.uncommitted} ${st.uncommitted === 1 ? 'path' : 'paths'} (git status)`);
if (st.handoff) {
  if (st.handoff.current) say(`handoff: ${st.handoff.path} is current; read it first.`);
  else say(`handoff: ${st.handoff.path} is STALE (HEAD moved past its BASE_COMMIT); trust git and the story files.`);
}
if (st.wiki_entries !== null) say(`wiki: docs/wiki/index.md (${st.wiki_entries} entries)`);

say(RESUME);
finish();

function finish() {
  // Synchronous write: a stream write immediately followed by process.exit() can be truncated.
  if (out.length) fs.writeSync(1, out.join('\n') + '\n');
  process.exit(0);
}
