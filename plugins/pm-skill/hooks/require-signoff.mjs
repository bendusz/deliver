#!/usr/bin/env node
// pm-skill PreToolUse hook — block implementation writes until the plan is signed off.
//
// FAIL-OPEN by design. Exits 0 (allow) on any uncertainty: kill switch, no state file,
// unparseable JSON, or a target outside the project tree. Exits 2 (block, reason on
// stderr) only when a PM-managed project is certainly mid-flight and pre-sign-off and
// the write targets a non-planning path. Inert for anyone not running the PM skill.
import fs from 'node:fs';
import path from 'node:path';

if (process.env.PM_SKILL_NO_ENFORCE === '1') process.exit(0);

// A damaged or missing lib.mjs must not block writes — fail open.
let lib;
try { lib = await import('./lib.mjs'); } catch { process.exit(0); }
const { readHookInput, readJson, pmRoot, pmRelpath, isRecord } = lib;

const input = readHookInput();
const file = input?.tool_input?.file_path;
if (typeof file !== 'string' || file === '') process.exit(0);
const cwd = typeof input.cwd === 'string' && input.cwd ? input.cwd : process.cwd();
const root = pmRoot(cwd);

let state = path.join(root, 'pm', 'pm-state.json');
if (!fs.existsSync(state)) state = path.join(root, 'tmp', 'pm-state.json');
if (!fs.existsSync(state)) process.exit(0);

const st = readJson(state);
if (!isRecord(st) || st.signed_off !== false) process.exit(0);

const rel = pmRelpath(root, file);
if (rel === null) process.exit(0);

const ALLOWED_FILES = new Set(['CLAUDE.md', 'AGENTS.md', '.gitignore', '.gitattributes']);
const ALLOWED_PREFIXES = ['docs/', 'pm/', 'tmp/', '.git/', '.claude/rules/'];
if (ALLOWED_FILES.has(rel) || ALLOWED_PREFIXES.some((prefix) => rel.startsWith(prefix))) process.exit(0);

// Synchronous write: a stream write immediately followed by process.exit() can be truncated.
fs.writeSync(2, `pm-skill: implementation is blocked until the plan is signed off.
A PM-managed project is in planning (pm/pm-state.json: signed_off=false).
Get the user's explicit approval on docs/plan.md, record it, and set
signed_off=true in pm/pm-state.json — then implementation may proceed.
(Set PM_SKILL_NO_ENFORCE=1 to disable this gate.)
`);
process.exit(2);
