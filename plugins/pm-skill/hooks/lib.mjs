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
