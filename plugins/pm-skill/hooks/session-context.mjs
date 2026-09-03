#!/usr/bin/env node
// pm-skill SessionStart hook: inject a tiny resume pointer when the project is PM-managed.
//
// Fires on startup, resume, /clear, and post-compaction; stdout becomes context for the
// new session. Prints a `pm: phase=...` line, YOUR actor position (identity from git
// config), and active teammates (those with a current_story) as read-only one-liners.
// Completely SILENT (exit 0, no output) in any project that is not PM-managed. Fail-open
// throughout.
import fs from 'node:fs';
import path from 'node:path';

if (process.env.PM_SKILL_NO_ENFORCE === '1') process.exit(0);

// A damaged or missing lib.mjs must not block the session: fail open (silent).
let lib;
try { lib = await import('./lib.mjs'); } catch { process.exit(0); }
const { readHookInput, readJson, pmRoot, pmActorId, isDir, listDir, isRecord } = lib;

const input = readHookInput();
const cwd = pmRoot(typeof input?.cwd === 'string' && input.cwd ? input.cwd : process.cwd());
const out = [];
const say = (line) => out.push(line);
// Actor files are attacker-controllable content (another actor's JSON): strip control
// characters (including newlines) and cap length before this text becomes session context.
const sanitize = (s) => s.replace(/[\x00-\x1f\x7f]+/g, ' ').slice(0, 200);
const v = (x, d) => (x === undefined || x === null || x === false ? d : sanitize(String(x)));
const RESUME = 'To continue: run /pm-skill:resume.';

const state = path.join(cwd, 'pm', 'pm-state.json');
if (!fs.existsSync(state)) {
  if (fs.existsSync(path.join(cwd, 'tmp', 'pm-state.json'))) {
    say('pm-skill: state is in the legacy tmp/ location. Run /pm-skill:resume to migrate it.');
  }
  finish();
}

const st = readJson(state);
if (!isRecord(st)) {
  say(RESUME);
  finish();
}

say(`pm: phase=${v(st.phase, '?')} sprint=${v(st.current_sprint, '-')}/${v(st.total_sprints, '-')} signed_off=${st.signed_off === undefined || st.signed_off === null ? '?' : String(st.signed_off)}`);

const actorsDir = path.join(cwd, 'pm', 'actors');
if (!isDir(actorsDir)) {
  say(`you: story=${v(st.current_story, '-')} status=${v(st.current_story_status, '-')} builder=${v(st.resolved_builder, '-')} next=${v(st.next, '?')}`);
  say('Layout is flat single-actor (pre-0.9): /pm-skill:resume migrates it to pm/actors/.');
  say(RESUME);
  finish();
}

// Documented last-resort fallback: no derivable identity still gets a stable id.
const me = pmActorId(cwd) || 'unknown-actor';
const myFile = path.join(actorsDir, `${me}.json`);
const my = fs.existsSync(myFile) ? readJson(myFile) : null;
if (isRecord(my)) {
  say(`you (${v(my.actor, '?')}): story=${v(my.current_story, '-')} status=${v(my.current_story_status, '-')} builder=${v(my.resolved_builder, '-')} branch=${v(my.branch, '-')} next=${v(my.next, '?')}`);
  const hw = typeof my.handoff_written === 'string' ? my.handoff_written : '';
  const up = typeof my.updated === 'string' ? my.updated : '';
  if (fs.existsSync(path.join(actorsDir, `${me}.HANDOFF.md`)) && hw) {
    if (up && up > hw) say(`Your pm/actors/${me}.HANDOFF.md is STALE (state moved on): trust the state files + log.`);
    else say(`A current pm/actors/${me}.HANDOFF.md briefing exists: read it first; it replaces re-discovery.`);
  }
} else {
  say(`No actor file for you (${me}) yet; /pm-skill:resume creates pm/actors/${me}.json.`);
}

// A long-running project can collect dozens of actor files, and every line here costs
// context in every session. Show the five most recently updated and count the rest.
const TEAMMATE_LINES = 5;
const teammates = [];
for (const name of listDir(actorsDir).filter((n) => n.endsWith('.json')).sort()) {
  const other = sanitize(name.slice(0, -'.json'.length));
  if (other === me) continue;
  const o = readJson(path.join(actorsDir, name));
  if (!isRecord(o)) continue;
  if (o.current_story === null || o.current_story === undefined) continue;
  teammates.push({ other, o, updated: typeof o.updated === 'string' ? o.updated : '' });
}
// Newest first; the file-name sort above breaks ties, so the output is stable.
teammates.sort((a, b) => (a.updated < b.updated ? 1 : a.updated > b.updated ? -1 : 0));
for (const { other, o } of teammates.slice(0, TEAMMATE_LINES)) {
  say(`teammate ${v(o.actor, other)}: story=${v(o.current_story, '-')} status=${v(o.current_story_status, '-')} branch=${v(o.branch, '-')}`);
}
if (teammates.length > TEAMMATE_LINES) say(`teammates: ${teammates.length - TEAMMATE_LINES} more`);

say(RESUME);
finish();

function finish() {
  // Synchronous write: a stream write immediately followed by process.exit() can be truncated.
  if (out.length) fs.writeSync(1, out.join('\n') + '\n');
  process.exit(0);
}
