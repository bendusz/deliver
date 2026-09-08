#!/usr/bin/env node
// deliver PreToolUse hook: block implementation writes until the plan is approved.
//
// FAIL-OPEN by design. Exits 0 (allow) on any uncertainty: kill switch, no marker and no
// legacy state, unparseable JSON, or a target outside the project tree. Exits 2 (block,
// reason on stderr) only when a managed project is certainly not approved and the write
// targets a non-planning, non-spec (.sdd, .specdd/) path. Inert for anyone not running
// the PM skill.
//
// The gate reads docs/approval.json (status: pending | approved | revoked). A project
// managed before 0.24 has no marker yet; its pm/pm-state.json (or the older
// tmp/pm-state.json) signed_off field still carries the gate until /deliver:resume
// migrates it, so an upgrade never silently opens the gate.
import fs from 'node:fs';
import path from 'node:path';

// DELIVER_NO_ENFORCE is the documented kill switch.
if (process.env.DELIVER_NO_ENFORCE === '1') process.exit(0);

// A damaged or missing lib.mjs must not block writes: fail open.
let lib;
try { lib = await import('./lib.mjs'); } catch { process.exit(0); }
const { readHookInput, hookFile, pmRelpath, readApproval, legacyState, git, chomp, APPROVAL_REL } = lib;

const target = hookFile(readHookInput());
if (!target) process.exit(0);
const { file, root } = target;

const sanitize = (s) => String(s).replace(/[\x00-\x1f\x7f]+/g, ' ').slice(0, 40);
let reason;
if (fs.existsSync(path.join(root, 'docs', 'approval.json'))) {
  const a = readApproval(root);
  if (!a) process.exit(0);
  if (a.status === 'approved') {
    // An approved plan that changed since approval is not the approved plan. Fail open when
    // there is no digest, no plan file, or git cannot answer.
    const digest = typeof a.plan_digest === 'string' && a.plan_digest ? a.plan_digest : null;
    const now = digest ? chomp(git(root, ['hash-object', 'docs/plan.md']) || '') : '';
    if (!digest || !now || now === digest) process.exit(0);
    reason = 'docs/plan.md changed since approval (plan_digest mismatch); run /deliver:correct-course, or refresh plan_digest after a cosmetic edit';
  } else {
    reason = `${APPROVAL_REL} status is ${sanitize(a.status)}`;
  }
} else {
  const legacy = legacyState(root);
  if (!legacy || !legacy.state || legacy.state.signed_off !== false) process.exit(0);
  reason = `${legacy.file} has signed_off=false; it is pre-0.24 state that /deliver:resume migrates`;
}

const rel = pmRelpath(root, file);
if (rel === null) process.exit(0);

const ALLOWED_FILES = new Set(['CLAUDE.md', 'AGENTS.md', '.gitignore', '.gitattributes']);
const ALLOWED_PREFIXES = ['docs/', 'pm/', 'tmp/', '.git/', '.claude/rules/', '.specdd/'];
// SpecDD specs are planning artifacts: a skeleton may be written before code exists.
const isSpec = /\.sdd$/i.test(rel);
if (ALLOWED_FILES.has(rel) || isSpec || ALLOWED_PREFIXES.some((prefix) => rel.startsWith(prefix))) process.exit(0);

// Synchronous write: a stream write immediately followed by process.exit() can be truncated.
fs.writeSync(2, `deliver blocked ${rel}: the plan is not approved (${reason}).
Get the user's approval on docs/plan.md, set ${APPROVAL_REL} status to "approved", and retry.
(Set DELIVER_NO_ENFORCE=1 to disable this gate.)
`);
process.exit(2);
