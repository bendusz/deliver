#!/usr/bin/env node
// pm-skill PreToolUse hook: block writes to ANOTHER actor's state files under pm/actors/.
//
// Each person writes only their own pm/actors/<id>.json and <id>.HANDOFF.md; shared
// coordination happens in pm/pm-state.json and pm/log.md. FAIL-OPEN: kill switch, no git,
// no derivable identity, or a target outside pm/actors/ all allow (exit 0).
import fs from 'node:fs';

if (process.env.PM_SKILL_NO_ENFORCE === '1') process.exit(0);

// A damaged or missing lib.mjs must not block writes: fail open.
let lib;
try { lib = await import('./lib.mjs'); } catch { process.exit(0); }
const { readHookInput, hookFile, pmRelpath, pmActorId } = lib;

const write = hookFile(readHookInput());
if (!write) process.exit(0);
const { file, root } = write;

// Canonical path: a symlink named after us must not authorise a write to its target.
const rel = pmRelpath(root, file);
if (rel === null || !rel.startsWith('pm/actors/')) process.exit(0);

const base = rel.slice(rel.lastIndexOf('/') + 1);
let target;
if (base.endsWith('.HANDOFF.md')) target = base.slice(0, -'.HANDOFF.md'.length);
else if (base.endsWith('.json')) target = base.slice(0, -'.json'.length);
else process.exit(0);

const me = pmActorId(root);
if (!me || target === me) process.exit(0);

// Synchronous write: a stream write immediately followed by process.exit() can be truncated.
fs.writeSync(2, `pm-skill: blocked a write to pm/actors/${base}: that is '${target}'s state file and you are '${me}'.
Each actor writes only their own pm/actors/<id>.json and <id>.HANDOFF.md. Coordinate through
pm/pm-state.json (assignments) and pm/log.md instead.
(Set PM_SKILL_NO_ENFORCE=1 to disable this guard.)
`);
process.exit(2);
