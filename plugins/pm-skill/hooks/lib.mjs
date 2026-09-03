#!/usr/bin/env node
// pm-skill hooks — shared library (Node ESM, zero dependencies).
// Also a tiny CLI:
//   git diff <range> | node lib.mjs scan        # exit 1 if secret-shaped content found
//   node lib.mjs actor-id [root]                # print this actor's id, exit 1 if none
// Everything here is fail-open friendly: functions return null instead of throwing,
// and callers treat null as "allow".
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// chomp(s) — strip only trailing newlines, mirroring bash command substitution
// (which strips trailing \n but leaves other whitespace, unlike String#trim()).
const chomp = (s) => s.replace(/(\r?\n)+$/, '');

// git(cwd, args) — stdout of `git -C cwd args...`, or null on any failure.
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

// pmRoot(cwd) — the PROJECT root, not the session cwd.
// Order: $CLAUDE_PROJECT_DIR (absolute + a directory) → git top level → cwd.
export function pmRoot(cwd) {
  const env = process.env.CLAUDE_PROJECT_DIR;
  if (env && path.isAbsolute(env) && isDir(env)) return env;
  const top = chomp(git(cwd, ['rev-parse', '--show-toplevel']) || '');
  if (top) return top;
  return cwd;
}

// pmRelpath(root, target) — canonical root-relative path (forward slashes) of a
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
  // directory), not project-relative — resolve it before treating it as a path.
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

// isRecord(x) — true for a non-null, non-array object (a JSON "object", not an array).
export const isRecord = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

// readHookInput() — the hook JSON from stdin, or null on empty/invalid input.
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

export function readJson(file) {
  try {
    // Refuse FIFOs, devices, etc. — reading them can hang or return garbage.
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

// pmActorId(root) — slug of the FULL git user.email (else user.name) plus a 12-hex
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
  const h2 = cksum(`${src}:pm-skill`).toString(16).padStart(8, '0');
  return `${slug}-${(h1 + h2).slice(0, 12)}`;
}

export const LIB_DIR = path.dirname(fileURLToPath(import.meta.url));

// pmSecretScan(text) — null when clean, else a reason. Never echoes the matched value.
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

// CLI mode.
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
  }
}
