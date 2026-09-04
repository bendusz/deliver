#!/usr/bin/env node
// deliver PreToolUse hook: block implementation writes until the plan is signed off.
//
// FAIL-OPEN by design. Exits 0 (allow) on any uncertainty: kill switch, no state file,
// unparseable JSON, or a target outside the project tree. Exits 2 (block, reason on
// stderr) only when a PM-managed project is certainly mid-flight and pre-sign-off and
// the write targets a non-planning, non-spec (.sdd, .specdd/) path. Inert for anyone not
// running the PM skill.
import fs from 'node:fs';
import path from 'node:path';

// DELIVER_NO_ENFORCE is the documented kill switch; the old name is honoured until 0.22.
if (process.env.DELIVER_NO_ENFORCE === '1' || process.env.PM_SKILL_NO_ENFORCE === '1') process.exit(0);

// A damaged or missing lib.mjs must not block writes: fail open.
let lib;
try { lib = await import('./lib.mjs'); } catch { process.exit(0); }
const { readHookInput, readJson, hookFile, pmRelpath, isRecord } = lib;

const target = hookFile(readHookInput());
if (!target) process.exit(0);
const { file, root } = target;

let state = path.join(root, 'pm', 'pm-state.json');
if (!fs.existsSync(state)) state = path.join(root, 'tmp', 'pm-state.json');
if (!fs.existsSync(state)) process.exit(0);

const st = readJson(state);
if (!isRecord(st) || st.signed_off !== false) process.exit(0);

const rel = pmRelpath(root, file);
if (rel === null) process.exit(0);

const ALLOWED_FILES = new Set(['CLAUDE.md', 'AGENTS.md', '.gitignore', '.gitattributes']);
const ALLOWED_PREFIXES = ['docs/', 'pm/', 'tmp/', '.git/', '.claude/rules/', '.specdd/'];
// SpecDD specs are planning artifacts: a skeleton may be written before code exists.
const isSpec = /\.sdd$/i.test(rel);
if (ALLOWED_FILES.has(rel) || isSpec || ALLOWED_PREFIXES.some((prefix) => rel.startsWith(prefix))) process.exit(0);

// Synchronous write: a stream write immediately followed by process.exit() can be truncated.
fs.writeSync(2, `deliver blocked ${rel}: the plan is not signed off (pm/pm-state.json signed_off=false).
Get the user's approval on docs/plan.md, set signed_off=true, and retry.
(Set DELIVER_NO_ENFORCE=1 to disable this gate.)
`);
process.exit(2);
