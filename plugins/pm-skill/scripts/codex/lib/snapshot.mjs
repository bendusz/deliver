import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { gitOut } from './git.mjs';

const WIN = process.platform === 'win32';
const PROTECTED_DIRS = ['pm', 'docs/stories'];
const PROTECTED_FILES = ['docs/spec.md', 'docs/plan.md', 'docs/constitution.md'];
const hasControl = (s) => /[\x00-\x1f\x7f]/.test(s);
const toPosix = (p) => p.split(path.sep).join('/');

function walk(root, rel, out) {
  const abs = path.join(root, rel);
  let entries;
  try { entries = fs.readdirSync(abs, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const r = `${rel}/${e.name}`;
    if (e.isDirectory() && !e.isSymbolicLink()) walk(root, r, out);
    else out.add(r);
  }
}

function indexModes(root) {
  const m = new Map();
  if (!WIN) return m;
  for (const line of gitOut(root, ['ls-files', '-s', '-z']).split('\0')) {
    if (!line) continue;
    const [meta, rel] = line.split('\t');
    m.set(rel, meta.split(' ')[0]);
  }
  return m;
}

function fingerprint(root, rel, modes) {
  if (hasControl(rel)) throw new Error(`unsupported path name: ${rel}`);
  const abs = path.join(root, rel);
  let st;
  try { st = fs.lstatSync(abs); } catch { return 'missing'; }
  if (st.isSymbolicLink()) {
    const target = fs.readlinkSync(abs);
    return `symlink:${gitOut(root, ['hash-object', '--stdin'], target).trim()}`;
  }
  if (st.isFile()) {
    const mode = WIN ? (modes.get(rel) || '100644') : (st.mode & 0o111 ? '100755' : '100644');
    return `file:${mode}:${gitOut(root, ['hash-object', '--no-filters', '--', abs]).trim()}`;
  }
  if (st.isDirectory()) {
    let head;
    try { head = gitOut(abs, ['rev-parse', '--verify', 'HEAD']).trim(); } catch { head = 'UNBORN'; }
    let inside = false;
    try { inside = gitOut(abs, ['rev-parse', '--is-inside-work-tree']).trim() === 'true'; } catch { inside = false; }
    if (inside) return `gitlink:${head}`;
  }
  throw new Error(`unsupported path type: ${rel}`);
}

// snapshotWorktree(root) — rel path → fingerprint for tracked, untracked (respecting
// ignores), and protected PM paths (included even if a hostile ignore rule hides them).
export function snapshotWorktree(root) {
  const rels = new Set();
  for (const r of gitOut(root, ['ls-files', '-z']).split('\0')) if (r) rels.add(r);
  for (const r of gitOut(root, ['ls-files', '--others', '--exclude-standard', '-z']).split('\0')) if (r) rels.add(r);
  for (const d of PROTECTED_DIRS) walk(root, d, rels);
  for (const f of PROTECTED_FILES) rels.add(f);
  const modes = indexModes(root);
  const out = new Map();
  for (const rel of [...rels].map(toPosix).sort()) out.set(rel, fingerprint(root, rel, modes));
  return out;
}

export function changedPaths(before, after) {
  const changed = new Set();
  for (const [rel, fp] of after) if (!before.has(rel) || before.get(rel) !== fp) changed.add(rel);
  for (const rel of before.keys()) if (!after.has(rel)) changed.add(rel);
  return [...changed].sort();
}

const sha = (s) => createHash('sha1').update(s).digest('hex');
const safe = (root, args) => { try { return gitOut(root, args); } catch { return ''; } };

export function gitMetadataFingerprint(root) {
  const head = safe(root, ['rev-parse', '--verify', 'HEAD']).trim() || 'UNBORN';
  const ref = safe(root, ['symbolic-ref', '-q', 'HEAD']).trim() || 'DETACHED';
  const index = sha(safe(root, ['diff', '--cached', '--binary', '--no-ext-diff']));
  const refs = sha(safe(root, ['for-each-ref', '--format=%(refname)\t%(objectname)']).split('\n').sort().join('\n'));
  const config = sha(safe(root, ['config', '--local', '--null', '--list']));
  const worktrees = sha(safe(root, ['worktree', 'list', '--porcelain']));
  return [head, ref, index, refs, config, worktrees].join('\n');
}
