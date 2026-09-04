import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { gitOut } from './git.mjs';

const WIN = process.platform === 'win32';
const PROTECTED_DIRS = ['pm', 'docs/stories', 'docs/wiki', '.specdd'];
const PROTECTED_FILES = ['docs/spec.md', 'docs/plan.md', 'docs/constitution.md'];
// The runner's own per-run TMPDIR churns constantly and is deleted before the second
// snapshot; .git is covered by gitMetadataFingerprint, not by file fingerprints.
const SKIP_IGNORED = ['tmp/codex-runtime/', '.git/'];
const hasControl = (s) => /[\x00-\x1f\x7f]/.test(s);
const toPosix = (p) => p.split(path.sep).join('/');
const sha = (s) => createHash('sha1').update(s).digest('hex');
const safe = (root, args) => { try { return gitOut(root, args); } catch { return ''; } };

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

function safeReaddir(root) {
  try { return fs.readdirSync(root, { withFileTypes: true }); } catch { return []; }
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

// classify(root, rel, modes): either a finished fingerprint, or a request to content-hash
// this regular file with the given index mode (batched by the caller).
function classify(root, rel, modes) {
  if (hasControl(rel)) throw new Error(`unsupported path name: ${rel}`);
  const abs = path.join(root, rel);
  let st;
  try { st = fs.lstatSync(abs); } catch { return { fp: 'missing' }; }
  if (st.isSymbolicLink()) {
    const target = fs.readlinkSync(abs);
    return { fp: `symlink:${gitOut(root, ['hash-object', '--stdin'], target).trim()}` };
  }
  if (st.isFile()) {
    // Owner exec bit only (0o100), matching git's index semantics and the original `[ -x ]` check.
    return { hash: true, mode: WIN ? (modes.get(rel) || '100644') : (st.mode & 0o100 ? '100755' : '100644') };
  }
  if (st.isDirectory()) {
    let head;
    try { head = gitOut(abs, ['rev-parse', '--verify', 'HEAD']).trim(); } catch { head = 'UNBORN'; }
    let inside = false;
    try { inside = gitOut(abs, ['rev-parse', '--is-inside-work-tree']).trim() === 'true'; } catch { inside = false; }
    // A nested repository's HEAD alone hides dirty content, so the porcelain status
    // of the submodule is part of the gitlink fingerprint.
    if (inside) {
      let status = '';
      try { status = gitOut(abs, ['status', '--porcelain']); } catch { status = 'UNREADABLE'; }
      return { fp: `gitlink:${head}:${sha(status)}` };
    }
  }
  throw new Error(`unsupported path type: ${rel}`);
}

// hashBatch(root, rels): one `git hash-object --stdin-paths` process for every regular
// file, instead of one process per file (which dominated snapshot cost on large trees).
function hashBatch(root, rels) {
  if (rels.length === 0) return [];
  const out = gitOut(root, ['hash-object', '--no-filters', '--stdin-paths'], `${rels.join('\n')}\n`).split('\n').filter((l) => l !== '');
  if (out.length !== rels.length) throw new Error('git hash-object returned an unexpected number of hashes');
  return out;
}

// snapshotWorktree(root): rel path → fingerprint for tracked files, untracked files
// (respecting ignores), protected PM paths (included even if a hostile ignore rule hides
// them), and ignored files (cheap stat fingerprint, no content hash: an ignored .env or
// build output is still outside a story's pm-meta.touches).
export function snapshotWorktree(root) {
  const rels = new Set();
  for (const r of gitOut(root, ['ls-files', '-z']).split('\0')) if (r) rels.add(r);
  for (const r of gitOut(root, ['ls-files', '--others', '--exclude-standard', '-z']).split('\0')) if (r) rels.add(r);
  for (const d of PROTECTED_DIRS) walk(root, d, rels);
  for (const f of PROTECTED_FILES) rels.add(f);
  for (const e of safeReaddir(root)) if (!e.isDirectory() && e.name.endsWith('.sdd')) rels.add(e.name);
  const modes = indexModes(root);
  const out = new Map();
  const sorted = [...rels].map(toPosix).sort();
  const toHash = [];
  const pending = [];
  for (const rel of sorted) {
    const c = classify(root, rel, modes);
    if (c.hash) { toHash.push(rel); pending.push([rel, c.mode]); out.set(rel, ''); } else out.set(rel, c.fp);
  }
  const hashes = hashBatch(root, toHash);
  pending.forEach(([rel, mode], i) => out.set(rel, `file:${mode}:${hashes[i].trim()}`));

  let ignored = '';
  try { ignored = gitOut(root, ['ls-files', '--others', '--ignored', '--exclude-standard', '-z']); } catch { ignored = ''; }
  for (const raw of ignored.split('\0')) {
    if (!raw) continue;
    const rel = toPosix(raw);
    if (out.has(rel)) continue;
    if (SKIP_IGNORED.some((p) => rel === p.slice(0, -1) || rel.startsWith(p))) continue;
    if (hasControl(rel)) throw new Error(`unsupported path name: ${rel}`);
    let st;
    try { st = fs.lstatSync(path.join(root, rel)); } catch { out.set(rel, 'missing'); continue; }
    out.set(rel, `ignored:${st.size}:${st.mtimeMs}:${st.ino}`);
  }
  return out;
}

export function changedPaths(before, after) {
  const changed = new Set();
  for (const [rel, fp] of after) if (!before.has(rel) || before.get(rel) !== fp) changed.add(rel);
  for (const rel of before.keys()) if (!after.has(rel)) changed.add(rel);
  return [...changed].sort();
}


// hookDirFingerprint(gitDir): names, sizes, and modes of <gitdir>/hooks. A run that
// installs or rewrites a git hook has changed protected repository state even though
// nothing in the worktree moved.
function hookDirFingerprint(gitDir) {
  let names;
  try { names = fs.readdirSync(path.join(gitDir, 'hooks')); } catch { return ''; }
  const lines = [];
  for (const n of names.sort()) {
    try {
      const st = fs.lstatSync(path.join(gitDir, 'hooks', n));
      lines.push(`${n}\t${st.size}\t${(st.mode & 0o7777).toString(8)}`);
    } catch { lines.push(`${n}\t?\t?`); }
  }
  return lines.join('\n');
}

export function gitMetadataFingerprint(root) {
  const head = safe(root, ['rev-parse', '--verify', 'HEAD']).trim() || 'UNBORN';
  const ref = safe(root, ['symbolic-ref', '-q', 'HEAD']).trim() || 'DETACHED';
  const index = sha(safe(root, ['diff', '--cached', '--binary', '--no-ext-diff']));
  const refs = sha(safe(root, ['for-each-ref', '--format=%(refname)\t%(objectname)']).split('\n').sort().join('\n'));
  const config = sha(safe(root, ['config', '--local', '--null', '--list']));
  const worktrees = sha(safe(root, ['worktree', 'list', '--porcelain']));
  // `ls-files -v` prefixes each entry with its status letter, so assume-unchanged (h),
  // skip-worktree (S), and intent-to-add flags show up here even when the cached diff
  // is identical.
  const indexFlags = sha(safe(root, ['ls-files', '-v', '-z']));
  const gitDirRaw = safe(root, ['rev-parse', '--git-dir']).replace(/(\r?\n)+$/, '');
  const gitDir = gitDirRaw ? path.resolve(root, gitDirRaw) : '';
  const hooks = sha(gitDir ? hookDirFingerprint(gitDir) : '');
  let exclude = '';
  if (gitDir) { try { exclude = fs.readFileSync(path.join(gitDir, 'info', 'exclude'), 'utf8'); } catch { exclude = ''; } }
  return [head, ref, index, refs, config, worktrees, indexFlags, hooks, sha(exclude)].join('\n');
}
