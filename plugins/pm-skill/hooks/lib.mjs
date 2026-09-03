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

// git(cwd, args) — stdout of `git -C cwd args...`, or null on any failure.
export function git(cwd, args) {
  try {
    return execFileSync('git', ['-C', cwd, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    });
  } catch {
    return null;
  }
}

function isDir(p) {
  try { return fs.statSync(p).isDirectory(); } catch { return false; }
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
  const top = git(cwd, ['rev-parse', '--show-toplevel']);
  if (top && top.trim()) return top.trim();
  return cwd;
}

// pmRelpath(root, target) — canonical root-relative path (forward slashes) of a
// possibly not-yet-existing target, '.' for the root itself, or null when the
// target is outside the root. Resolves a final symlink chain (≤ 8 hops) and then
// canonicalises through the deepest EXISTING ancestor, so 'pm/../src/app.py'
// classifies as 'src/app.py' and a symlinked directory cannot alias one prefix
// to another. Traversal segments in the non-existing tail are rejected.
export function pmRelpath(root, target) {
  if (!target) return null;
  const realRoot = realpath(root);
  if (!realRoot) return null;
  // Concatenate rather than path.join so '..' is resolved by the filesystem, not lexically.
  let p = path.isAbsolute(target) ? target : `${realRoot}${path.sep}${target}`;
  let hops = 0;
  while (isSymlink(p)) {
    if (++hops > 8) return null;
    let link;
    try { link = fs.readlinkSync(p); } catch { return null; }
    p = path.isAbsolute(link) ? link : path.join(path.dirname(p), link);
  }
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

// readHookInput() — the hook JSON from stdin, or null on empty/invalid input.
export function readHookInput() {
  try {
    const raw = fs.readFileSync(0, 'utf8');
    if (!raw.trim()) return null;
    const v = JSON.parse(raw);
    return v && typeof v === 'object' ? v : null;
  } catch {
    return null;
  }
}

export function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
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
  let src = (git(root, ['config', 'user.email']) || '').trim();
  if (!src) src = (git(root, ['config', 'user.name']) || '').trim();
  if (!src) return null;
  src = src.replace(/[A-Z]/g, (c) => c.toLowerCase());
  const slug = src.replace(/[^a-z0-9]+/g, '-').replace(/^-+/, '').replace(/-+$/, '');
  if (!slug) return null;
  const h1 = cksum(src).toString(16).padStart(8, '0');
  const h2 = cksum(`${src}:pm-skill`).toString(16).padStart(8, '0');
  return `${slug}-${(h1 + h2).slice(0, 12)}`;
}

export const LIB_DIR = path.dirname(fileURLToPath(import.meta.url));
