#!/usr/bin/env node
// deliver PreToolUse hook: block secret-shaped content from being written into pm/ or docs/wiki/.
//
// pm/ and docs/wiki/ are git-tracked, so a leaked credential there enters history. This
// guard scans Write.content, Edit.new_string, and MultiEdit.edits[].new_string targeting
// those paths for high-confidence secret shapes and blocks with exit 2. FAIL-OPEN like the
// other hooks: kill switch, unparseable input, or a target outside those paths all allow (exit 0).
import fs from 'node:fs';

// DELIVER_NO_ENFORCE is the documented kill switch; the old name is honoured until 0.22.
if (process.env.DELIVER_NO_ENFORCE === '1' || process.env.PM_SKILL_NO_ENFORCE === '1') process.exit(0);

// A damaged or missing lib.mjs must not block writes: fail open.
let lib;
try { lib = await import('./lib.mjs'); } catch { process.exit(0); }
const { readHookInput, hookFile, pmRelpath, pmSecretScan } = lib;

const input = readHookInput();
const target = hookFile(input);
if (!target) process.exit(0);
const { file, root } = target;
const ti = input.tool_input;

const rel = pmRelpath(root, file);
const prefix = rel === null ? null : ['pm/', 'docs/wiki/'].find((p) => rel.startsWith(p));
if (!prefix) process.exit(0);

const parts = [];
if (typeof ti.content === 'string' && ti.content) parts.push(ti.content);
if (typeof ti.new_string === 'string' && ti.new_string) parts.push(ti.new_string);
if (Array.isArray(ti.edits)) {
  for (const e of ti.edits) if (typeof e?.new_string === 'string' && e.new_string) parts.push(e.new_string);
}
const text = parts.join('\n');
if (!text) process.exit(0);

if (pmSecretScan(text)) {
  // Synchronous write: a stream write immediately followed by process.exit() can be truncated.
  fs.writeSync(2, `deliver blocked ${rel}: tracked ${prefix} files cannot hold secret-shaped values.
Store the value elsewhere, record only its path, and retry.
(Set DELIVER_NO_ENFORCE=1 to disable this guard.)
`);
  process.exit(2);
}
process.exit(0);
