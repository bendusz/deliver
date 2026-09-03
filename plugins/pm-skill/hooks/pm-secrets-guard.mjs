#!/usr/bin/env node
// pm-skill PreToolUse hook — block secret-shaped content from being written into pm/.
//
// pm/ is git-tracked, so a leaked credential there enters history. This guard scans
// Write.content, Edit.new_string, and MultiEdit.edits[].new_string targeting pm/ for
// high-confidence secret shapes and blocks with exit 2. FAIL-OPEN like the other hooks:
// kill switch, unparseable input, or a target outside pm/ all allow (exit 0).
import { readHookInput, pmRoot, pmRelpath, pmSecretScan } from './lib.mjs';

if (process.env.PM_SKILL_NO_ENFORCE === '1') process.exit(0);

const input = readHookInput();
const ti = input?.tool_input;
const file = ti?.file_path;
if (typeof file !== 'string' || file === '') process.exit(0);
const cwd = typeof input.cwd === 'string' && input.cwd ? input.cwd : process.cwd();
const root = pmRoot(cwd);

const rel = pmRelpath(root, file);
if (rel === null || !rel.startsWith('pm/')) process.exit(0);

const parts = [];
if (typeof ti.content === 'string' && ti.content) parts.push(ti.content);
if (typeof ti.new_string === 'string' && ti.new_string) parts.push(ti.new_string);
if (Array.isArray(ti.edits)) {
  for (const e of ti.edits) if (typeof e?.new_string === 'string' && e.new_string) parts.push(e.new_string);
}
const text = parts.join('\n');
if (!text) process.exit(0);

if (pmSecretScan(text)) {
  process.stderr.write(`pm-skill: blocked a write to ${rel} — the content contains a secret-shaped string.
pm/ is git-tracked; secrets there enter history permanently. Reference the secret's
LOCATION (e.g. ".env on the box"), never its value, then retry the write.
(Set PM_SKILL_NO_ENFORCE=1 to disable this guard.)
`);
  process.exit(2);
}
process.exit(0);
