#!/usr/bin/env node
// pm-skill SessionStart hook — inject a tiny resume pointer when the project is PM-managed.
//
// Fires on startup, resume, /clear, and post-compaction; stdout becomes context for the
// new session. Prints the shared project position, YOUR actor position (identity from
// git config), and teammates as read-only one-liners. Completely SILENT (exit 0, no
// output) in any project that is not PM-managed. Fail-open throughout.
import fs from 'node:fs';
import path from 'node:path';
import { readHookInput, readJson, pmRoot, pmActorId } from './lib.mjs';

if (process.env.PM_SKILL_NO_ENFORCE === '1') process.exit(0);

const input = readHookInput();
const cwd = pmRoot(typeof input?.cwd === 'string' && input.cwd ? input.cwd : process.cwd());
const out = [];
const say = (line) => out.push(line);
const v = (x, d) => (x === undefined || x === null || x === false ? d : String(x));
const RESUME = 'To continue: run /pm-skill:resume (or read the pm/ files directly). Before ending a long session, offer /pm-skill:handoff.';

const state = path.join(cwd, 'pm', 'pm-state.json');
if (!fs.existsSync(state)) {
  if (fs.existsSync(path.join(cwd, 'tmp', 'pm-state.json'))) {
    say('pm-skill: PM-managed project with state in the legacy tmp/ location.');
    say('Run /pm-skill:resume to migrate it to the tracked pm/ directory and continue.');
  }
  finish();
}

say('pm-skill: this is a PM-managed project (pm/pm-state.json present).');
const st = readJson(state);
if (!st || typeof st !== 'object') {
  say('To continue: run /pm-skill:resume (or read the pm/ files directly).');
  finish();
}

say(`project: phase=${v(st.phase, '?')} sprint=${v(st.current_sprint, '-')}/${v(st.total_sprints, '-')} signed_off=${st.signed_off === undefined || st.signed_off === null ? '?' : String(st.signed_off)}`);

const actorsDir = path.join(cwd, 'pm', 'actors');
if (!fs.existsSync(actorsDir) || !fs.statSync(actorsDir).isDirectory()) {
  say(`you: story=${v(st.current_story, '-')} status=${v(st.current_story_status, '-')} builder=${v(st.resolved_builder, '-')} next=${v(st.next, '?')}`);
  say('Layout is flat single-actor (pre-0.9) — /pm-skill:resume migrates it to pm/actors/.');
  say(RESUME);
  finish();
}

// Documented last-resort fallback: no derivable identity still gets a stable id.
const me = pmActorId(cwd) || 'unknown-actor';
const myFile = path.join(actorsDir, `${me}.json`);
const my = fs.existsSync(myFile) ? readJson(myFile) : null;
if (my && typeof my === 'object') {
  say(`you (${v(my.actor, '?')}): story=${v(my.current_story, '-')} status=${v(my.current_story_status, '-')} builder=${v(my.resolved_builder, '-')} branch=${v(my.branch, '-')} next=${v(my.next, '?')}`);
  const hw = typeof my.handoff_written === 'string' ? my.handoff_written : '';
  const up = typeof my.updated === 'string' ? my.updated : '';
  if (fs.existsSync(path.join(actorsDir, `${me}.HANDOFF.md`)) && hw) {
    if (up && up > hw) say(`Your pm/actors/${me}.HANDOFF.md is STALE (state moved on) — trust the state files + log.`);
    else say(`A current pm/actors/${me}.HANDOFF.md briefing exists — read it first; it replaces re-discovery.`);
  }
} else {
  say(`No actor file for you (${me}) yet — /pm-skill:resume creates pm/actors/${me}.json.`);
}

for (const name of fs.readdirSync(actorsDir).filter((n) => n.endsWith('.json')).sort()) {
  const other = name.slice(0, -'.json'.length);
  if (other === me) continue;
  const o = readJson(path.join(actorsDir, name));
  if (!o || typeof o !== 'object') continue;
  say(`teammate ${v(o.actor, other)}: story=${v(o.current_story, '-')} status=${v(o.current_story_status, '-')} branch=${v(o.branch, '-')}`);
}

say(RESUME);
finish();

function finish() {
  if (out.length) process.stdout.write(out.join('\n') + '\n');
  process.exit(0);
}
