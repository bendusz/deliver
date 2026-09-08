#!/usr/bin/env node
// deliver hooks: shared library (Node ESM, zero dependencies).
// Also a tiny CLI:
//   git diff <range> | node lib.mjs scan        # exit 1 if secret-shaped content found
//   node lib.mjs actor-id [root]                # print this actor's id (names docs/handoff/<id>.md), exit 1 if none
//   node lib.mjs state [root]                   # print the derived project position as JSON, exit 1 outside a managed project
// Everything here is fail-open friendly: functions return null instead of throwing,
// and callers treat null as "allow".
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// chomp(s): strip only trailing newlines, mirroring bash command substitution
// (which strips trailing \n but leaves other whitespace, unlike String#trim()).
export const chomp = (s) => s.replace(/(\r?\n)+$/, '');

// git(cwd, args): stdout of `git -C cwd args...`, or null on any failure.
export function git(cwd, args) {
  try {
    return execFileSync('git', ['-C', cwd, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
      timeout: 5000,
    });
  } catch {
    return null;
  }
}

export function isDir(p) {
  try { return fs.statSync(p).isDirectory(); } catch { return false; }
}
export function listDir(p) {
  try { return fs.readdirSync(p); } catch { return []; }
}
function isSymlink(p) {
  try { return fs.lstatSync(p).isSymbolicLink(); } catch { return false; }
}
export function realpath(p) {
  try { return fs.realpathSync.native(p); } catch { return null; }
}

// pmRoot(cwd): the PROJECT root, not the session cwd.
// Order: $CLAUDE_PROJECT_DIR (absolute + a directory) → git top level → cwd.
export function pmRoot(cwd) {
  const env = process.env.CLAUDE_PROJECT_DIR;
  if (env && path.isAbsolute(env) && isDir(env)) return path.resolve(env);
  const top = chomp(git(cwd, ['rev-parse', '--show-toplevel']) || '');
  // git prints forward slashes on Windows (e.g. C:/Users/...); resolve to a
  // native, normalised absolute path so it matches paths built with path.join.
  if (top) return path.resolve(top);
  return cwd;
}

// pmRelpath(root, target): canonical root-relative path (forward slashes) of a
// possibly not-yet-existing target, '.' for the root itself, or null when the
// target is outside the root. Resolves a final symlink chain (≤ 8 hops) and then
// canonicalises through the deepest EXISTING ancestor, so 'pm/../src/app.py'
// classifies as 'src/app.py' and a symlinked directory cannot alias one prefix
// to another. Traversal segments in the non-existing tail are rejected.
// Unlike the bash version, '..' through a symlinked directory resolves physically
// (what the kernel opens), which is the safer classification.
export function pmRelpath(root, target) {
  if (!target) return null;
  const realRoot = realpath(root);
  if (!realRoot) return null;
  // 'C:foo' is drive-relative on Windows (relative to that drive's own working
  // directory), not project-relative: resolve it before treating it as a path.
  if (process.platform === 'win32' && /^[A-Za-z]:(?![\\/])/.test(target)) target = path.resolve(target);
  // Concatenate rather than path.join so '..' is resolved by the filesystem, not lexically.
  let p = path.isAbsolute(target) ? target : `${realRoot}${path.sep}${target}`;
  let hops = 0;
  while (isSymlink(p)) {
    if (++hops > 8) return null;
    let link;
    try { link = fs.readlinkSync(p); } catch { return null; }
    // Concatenate (not path.join) so a '..' in the link is resolved by the filesystem
    // against the on-disk directory, not collapsed lexically before earlier symlinks
    // in the directory chain are followed.
    p = path.isAbsolute(link) ? link : `${path.dirname(p)}${path.sep}${link}`;
  }
  // Canonicalise an EXISTING final path so case-insensitive filesystems (macOS,
  // Windows) return on-disk casing rather than the caller's alias casing.
  const real = realpath(p);
  if (real) p = real;
  const rest = [];
  let dir = p;
  while (!isDir(dir)) {
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    rest.unshift(path.basename(dir));
    dir = parent;
  }
  if (rest.some((seg) => seg === '..' || seg === '.' || seg === '')) return null;
  const realDir = realpath(dir);
  if (!realDir) return null;
  const full = rest.length ? path.join(realDir, ...rest) : realDir;
  const rel = path.relative(realRoot, full);
  if (rel === '') return '.';
  if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) return null;
  return rel.split(path.sep).join('/');
}

export const isRecord = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

// readHookInput(): the hook JSON from stdin, or null on empty/invalid input.
export function readHookInput() {
  try {
    const raw = fs.readFileSync(0, 'utf8');
    if (!raw.trim()) return null;
    const v = JSON.parse(raw);
    return isRecord(v) ? v : null;
  } catch {
    return null;
  }
}

// hookFile(input) returns the write target and the roots every PreToolUse guard starts
// from, or null when the payload names no file. The callers treat null as "allow".
export function hookFile(input) {
  const file = input?.tool_input?.file_path;
  if (typeof file !== 'string' || file === '') return null;
  const cwd = typeof input.cwd === 'string' && input.cwd ? input.cwd : process.cwd();
  return { file, root: pmRoot(cwd) };
}

// readText(file): the contents of a regular file, or null. Refuses symlinks, FIFOs, and
// devices for the same reasons readJson does: a FIFO would hang a SessionStart hook.
export function readText(file) {
  try {
    if (fs.lstatSync(file).isSymbolicLink()) return null;
    if (!fs.statSync(file).isFile()) return null;
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

export function readJson(file) {
  try {
    // Refuse a symlink outright: the approval marker is an in-repo artifact, and a
    // link is a redirect to content this project does not own. Fail-open (null) as usual.
    if (fs.lstatSync(file).isSymbolicLink()) return null;
    // Refuse FIFOs, devices, etc.: reading them can hang or return garbage.
    const st = fs.statSync(file);
    if (!st.isFile()) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

// POSIX cksum: CRC-32, polynomial 0x04C11DB7, MSB first, length appended, complemented.
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = (i << 24) >>> 0;
    for (let k = 0; k < 8; k++) c = c & 0x80000000 ? ((c << 1) ^ 0x04c11db7) >>> 0 : (c << 1) >>> 0;
    t[i] = c;
  }
  return t;
})();

export function cksum(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input, 'utf8');
  let crc = 0;
  for (const b of buf) crc = (((crc << 8) >>> 0) ^ CRC_TABLE[((crc >>> 24) ^ b) & 0xff]) >>> 0;
  let len = buf.length;
  while (len > 0) {
    crc = (((crc << 8) >>> 0) ^ CRC_TABLE[((crc >>> 24) ^ (len & 0xff)) & 0xff]) >>> 0;
    len >>>= 8;
  }
  return ~crc >>> 0;
}

// pmActorId(root): slug of the FULL git user.email (else user.name) plus a 12-hex
// digest of two cksum values (raw, raw+salt). Byte-identical to the bash version.
// ASCII-only lowercasing mirrors `tr '[:upper:]' '[:lower:]'` in the C locale.
export function pmActorId(root) {
  let src = chomp(git(root, ['config', 'user.email']) || '');
  if (!src) src = chomp(git(root, ['config', 'user.name']) || '');
  if (!src) return null;
  src = src.replace(/[A-Z]/g, (c) => c.toLowerCase());
  const slug = src.replace(/[^a-z0-9]+/g, '-').replace(/^-+/, '').replace(/-+$/, '');
  if (!slug) return null;
  const h1 = cksum(src).toString(16).padStart(8, '0');
  // The ':pm-skill' salt keeps the plugin's historical name on purpose. It keyed every
  // pre-0.24 pm/actors/ file and now names docs/handoff/<id>.md; keep the ids stable.
  const h2 = cksum(`${src}:pm-skill`).toString(16).padStart(8, '0');
  return `${slug}-${(h1 + h2).slice(0, 12)}`;
}

// pmSecretScan(text): null when clean, else a reason. Never echoes the matched value.
// Token FORMATS are case-sensitive; credential ASSIGNMENTS are case-insensitive and match
// quoted or unquoted values. Placeholders never trip: values starting '$', '<', or '{'
// are outside the value character class.
const TOKEN_FORMATS = [
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY/,
  /gh[pousr]_[A-Za-z0-9]{30,}/,
  /github_pat_[A-Za-z0-9_]{22,}/,
  /xox[baprs]-[A-Za-z0-9-]{10,}/,
  /sk-[A-Za-z0-9_-]{20,}/,
  /AIza[0-9A-Za-z_-]{35}/,
  /eyJ[A-Za-z0-9_-]{17,}\.eyJ[A-Za-z0-9_-]{10,}/,
];
const ASSIGNMENTS = [
  /(api[_-]?key|secret|token|passw(or)?d|credential)["']?\s*[:=]\s*["'][A-Za-z0-9_/+=.-]{8,}["']/i,
  /(api[_-]?key|secret|token|passw(or)?d|credential)\s*[:=]\s*[A-Za-z0-9_/+=.-]{8,}/i,
];

export function pmSecretScan(text) {
  const lines = String(text).split(/\r?\n/);
  if (lines.some((l) => TOKEN_FORMATS.some((re) => re.test(l)))) return 'secret-shaped token format detected';
  if (lines.some((l) => ASSIGNMENTS.some((re) => re.test(l)))) return 'credential assignment with a real-looking value detected';
  return null;
}

// PHASES maps the derived phase to the one reference the PM loads for it (SKILL.md).
export const PHASES = {
  migration: 'references/migrations.md',
  discovery: 'references/discovery.md',
  retrospective: 'references/retrospective.md',
  specification: 'references/specification.md',
  planning: 'references/planning-and-signoff.md',
  decomposition: 'references/decomposition.md',
  implementation: 'references/implementation-loop.md',
  done: 'references/documentation.md',
};

// inspectState(root): the derived position of a managed project as one plain object. The
// session hook renders it, `node lib.mjs state` prints it, and doctor and resume read it
// instead of re-deriving the same git facts. null outside a managed project, meaning no
// docs/approval.json and no legacy pm-state.json. Every git failure degrades one field.
export function inspectState(root) {
  const hasMarker = fs.existsSync(path.join(root, 'docs', 'approval.json'));
  const legacy = hasMarker ? null : legacyState(root);
  if (!hasMarker && !legacy) return null;
  const out = { managed: true, legacy: legacy ? legacy.file : null, approval: null, phase: null, next_reference: null, actor: null, branch: null, story: null, unmerged: [], unreadable: [], claims: [], sprints_without_retro: [], worktrees: 0, uncommitted: null, handoff: null, wiki_entries: null };
  if (legacy) { out.phase = 'migration'; out.next_reference = PHASES.migration; return out; }
  const a = readApproval(root);
  if (!a) return out;
  const digestNow = chomp(git(root, ['hash-object', 'docs/plan.md']) || '');
  const digest = typeof a.plan_digest === 'string' && a.plan_digest ? a.plan_digest : null;
  out.approval = { status: a.status, approver: a.approver ?? null, approved_date: a.approved_date ?? null, plan_digest: digest, plan_changed: Boolean(a.status === 'approved' && digest && digestNow && digest !== digestNow) };

  const storiesDir = path.join(root, 'docs', 'stories');
  const stories = [];
  for (const name of listDir(storiesDir).filter((n) => /^S\d+-\d+-.*\.md$/.test(n)).sort()) {
    const id = name.match(/^(S\d+-\d+)-/)[1];
    const text = readText(path.join(storiesDir, name));
    // An unreadable story is unfinished until proven otherwise; dropping it would let one
    // merged story beside it read as a finished sprint.
    if (text === null) { out.unreadable.push(id); stories.push({ id, exec: null }); continue; }
    stories.push({ id, exec: parseExec(text) });
  }
  out.branch = chomp(git(root, ['branch', '--show-current']) || '') || 'DETACHED';
  const mine = stories.find((s) => s.exec && s.exec.branch === out.branch) || stories.find((s) => out.branch.startsWith(`pm/${s.id}-`));
  if (mine) out.story = { id: mine.id, exec: mine.exec };
  out.unmerged = stories.filter((s) => !s.exec || s.exec.status !== 'merged').map((s) => s.id);
  out.claims = stories.filter((s) => s !== mine && s.exec && s.exec.status && s.exec.status !== 'merged')
    .map((s) => ({ id: s.id, owner: s.exec.owner ?? null, status: s.exec.status, branch: s.exec.branch ?? null }));
  out.worktrees = Math.max(0, (git(root, ['worktree', 'list', '--porcelain']) || '').split(/\r?\n/).filter((l) => l.startsWith('worktree ')).length - 1);
  const porcelain = git(root, ['status', '--porcelain', '--untracked-files=all']);
  out.uncommitted = porcelain === null ? null : porcelain.split(/\r?\n/).filter(Boolean).length;

  const me = pmActorId(root);
  out.actor = me;
  if (me) {
    const rel = `docs/handoff/${me}.md`;
    const text = readText(path.join(root, 'docs', 'handoff', `${me}.md`));
    if (text !== null) {
      // Current when HEAD is BASE_COMMIT, or when every commit since touched nothing but this
      // file: the handoff commit cannot name its own hash.
      const base = (text.match(/^BASE_COMMIT:\s*([0-9a-f]{7,40})/m) || [])[1];
      const head = chomp(git(root, ['rev-parse', 'HEAD']) || '');
      let current = Boolean(base && head && head.startsWith(base));
      if (!current && base && head) {
        const changed = git(root, ['diff', '--name-only', base, 'HEAD', '--']);
        if (changed !== null) current = changed.split(/\r?\n/).filter(Boolean).every((p) => p === rel);
      }
      out.handoff = { path: rel, current };
    }
  }
  const index = readText(path.join(root, 'docs', 'wiki', 'index.md'));
  if (index !== null) out.wiki_entries = index.split(/\r?\n/).filter((l) => l.startsWith('- ')).length;

  // The phase is derived (references/state.md): no spec and no plan is discovery, a spec
  // without a plan is specification, an unapproved plan is planning, an approved plan with
  // no stories is decomposition, an unmerged story is implementation, all merged is done.
  // A completed sprint with no retro record is owed one, unless the plan's scale skips it.
  const sprintOf = (id) => Number(id.match(/^S(\d+)-/)[1]);
  const sprints = [...new Set(stories.map((s) => sprintOf(s.id)))].sort((x, y) => x - y);
  const plan = readText(path.join(root, 'docs', 'plan.md'));
  const scale = ((plan || '').match(/^- Scale:\s*([a-z]+)/m) || [])[1] || null;
  const retroSkipped = scale === 'tiny' || scale === 'small';
  for (const n of sprints) {
    const ofSprint = stories.filter((s) => sprintOf(s.id) === n);
    const complete = ofSprint.every((s) => s.exec && s.exec.status === 'merged');
    // A record is a readable regular file; a directory or FIFO in its place is no record.
    if (complete && !retroSkipped && readText(path.join(root, 'docs', 'retros', `sprint-${n}.md`)) === null) out.sprints_without_retro.push(n);
  }

  // Precedence: an unapproved or drifted marker halts everything, so it is planning whatever
  // else exists; then a completed sprint owed its retrospective; then stories outrank a
  // missing plan file, since they imply one was approved.
  const hasSpec = fs.existsSync(path.join(root, 'docs', 'spec.md'));
  const hasPlan = plan !== null;
  if (a.status !== 'approved' || out.approval.plan_changed) out.phase = hasSpec || hasPlan || stories.length ? 'planning' : 'discovery';
  else if (out.sprints_without_retro.length > 0) out.phase = 'retrospective';
  else if (stories.length > 0) out.phase = out.unmerged.length > 0 ? 'implementation' : 'done';
  else if (!hasSpec && !hasPlan) out.phase = 'discovery';
  else if (!hasPlan) out.phase = 'specification';
  else out.phase = 'decomposition';
  out.next_reference = PHASES[out.phase];
  return out;
}

const invoked = process.argv[1] ? realpath(process.argv[1]) : null;
if (invoked && invoked === realpath(fileURLToPath(import.meta.url))) {
  const cmd = process.argv[2];
  if (cmd === 'scan') {
    let text = '';
    try { text = fs.readFileSync(0, 'utf8'); } catch { text = ''; }
    const reason = pmSecretScan(text);
    // Synchronous write: a stream write immediately followed by process.exit() can
    // be truncated if the fd is non-blocking (e.g. piped output on some platforms).
    if (reason) { fs.writeSync(2, `${reason}\n`); process.exit(1); }
    process.exit(0);
  } else if (cmd === 'actor-id') {
    const id = pmActorId(process.argv[3] || process.cwd());
    if (!id) process.exit(1);
    fs.writeSync(1, `${id}\n`);
    process.exit(0);
  } else if (cmd === 'state') {
    // An explicit root is authoritative: pmRoot() would let CLAUDE_PROJECT_DIR override it and
    // report another checkout. Without one, resolve the project root as the hooks do.
    const explicit = process.argv[3];
    const top = explicit ? chomp(git(path.resolve(explicit), ['rev-parse', '--show-toplevel']) || '') : '';
    const st = inspectState(explicit ? (top ? path.resolve(top) : path.resolve(explicit)) : pmRoot(process.cwd()));
    if (!st) { fs.writeSync(2, 'not a managed project: no docs/approval.json and no legacy pm-state.json\n'); process.exit(1); }
    fs.writeSync(1, `${JSON.stringify(st, null, 2)}\n`);
    process.exit(0);
  }
}

// The approval marker: the one tracked file the sign-off gate reads. `status` is
// pending, approved, or revoked. Everything else about a project's position is derived
// from git and the story files (see references/state.md).
export const APPROVAL_REL = 'docs/approval.json';

// readApproval(root): the parsed marker when it is a JSON object with a string status,
// else null. Callers that must tell "absent" from "unreadable" check the path first.
export function readApproval(root) {
  const a = readJson(path.join(root, 'docs', 'approval.json'));
  return isRecord(a) && typeof a.status === 'string' ? a : null;
}

// legacyState(root): a pre-0.24 pm-state.json under pm/ or tmp/, as { file, state }
// with state null when unreadable, or null when neither exists. Only the sign-off hook,
// the session hook, and the runner's migration message still look at it.
export function legacyState(root) {
  for (const rel of ['pm/pm-state.json', 'tmp/pm-state.json']) {
    const f = path.join(root, ...rel.split('/'));
    if (!fs.existsSync(f)) continue;
    const st = readJson(f);
    return { file: rel, state: isRecord(st) ? st : null };
  }
  return null;
}

// parseExec(text): a story's `<!-- pm-exec: {...} -->` Execution block as an object, or
// null when the story has none or it does not parse.
export function parseExec(text) {
  const m = String(text).match(/<!--\s*pm-exec:\s*(\{[^\n]*?\})\s*-->/);
  if (!m) return null;
  try {
    const v = JSON.parse(m[1]);
    return isRecord(v) ? v : null;
  } catch {
    return null;
  }
}
