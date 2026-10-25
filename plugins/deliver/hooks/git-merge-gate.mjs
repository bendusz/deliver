#!/usr/bin/env node
// deliver's git-level ship gate. Where the PreToolUse hook predicts a merge from command text, this
// judges the change git is actually making, whatever shell form started it.
//
//   node git-merge-gate.mjs reference-transaction
//     Git (2.28 or newer) runs it from the `reference-transaction` shim git-hook-install.mjs writes.
//     The shim passes, on stdin, only the `<old> <new> <ref>` lines of the `prepared` phase whose
//     ref is a deliver project's integration branch, so fetches and other ref updates never start
//     node. Each update is judged by require-verified.mjs's judgeRefUpdate(): a merge commit, a
//     fast-forward, a pull, a rebase, a reset, an update-ref, a cherry-pick, a squash merge, and a
//     conflicted merge finished by hand alike. A deny exits 1, and git aborts the whole
//     transaction. A push into this repository (`git push . pm/X:main`) runs it too: receive-pack
//     runs hooks in the git directory, so the working tree is found from the git common directory.
//   node git-merge-gate.mjs pre-merge-commit | pre-commit
//     The fallback for git older than 2.28, which has no reference-transaction hook: the current
//     branch (`git symbolic-ref -q HEAD`) is the target, and the merged commits are every SHA in
//     MERGE_HEAD and every `GITHEAD_<sha>` variable git merge exports (git writes MERGE_HEAD only
//     after pre-merge-commit runs). judgeMerge() gives the verdict. Fast-forwards are not gated.
//     Such git has no `merge-tree --write-tree`, so the staged result is compared with the merge
//     only where git merges without a content merge: the index must equal `git read-tree -m` of
//     the merge base and the two heads, apart from the story file. Where a file needs a content
//     merge, only the verdicts are checked.
//
// Exits 0 with DELIVER_NO_ENFORCE=1, outside a deliver project, for a ref that is no project's
// integration branch, and on an internal error unless a story merge into an integration branch is
// certain, when the verdict is "cannot establish ...": the PreToolUse hook's failure model.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

if (process.env.DELIVER_NO_ENFORCE === '1') process.exit(0);

let verdict;
let inMerge = false;
let lib;
let top = '';
try {
  lib = await import('./lib.mjs');
  const { judgeMerge, judgeRefUpdate, mergeHeads } = await import('./require-verified.mjs');
  top = worktreeTop();
  if (!top) process.exit(0);
  const heads = mergeHeads(top) ?? [];
  inMerge = heads.length > 0;
  if (process.argv[2] === 'reference-transaction') {
    let input = '';
    try { input = fs.readFileSync(0, 'utf8'); } catch { input = ''; }
    for (const line of input.split(/\r?\n/)) {
      const [old, next, ref] = line.trim().split(/\s+/);
      if (!ref?.startsWith('refs/heads/')) continue;
      verdict = judgeRefUpdate(top, { target: ref.slice('refs/heads/'.length), old, new: next });
      if (!verdict.allow) { verdict.ref = ref; break; }
    }
  } else {
    const merged = new Set(heads);
    for (const key of Object.keys(process.env)) {
      const m = key.match(/^GITHEAD_([0-9a-f]{40,64})$/);
      if (m) merged.add(m[1]);
    }
    inMerge = true;
    const head = lib.chomp(lib.git(top, ['symbolic-ref', '-q', 'HEAD']) || '');
    // A merge onto a detached HEAD ships nothing.
    if (!head.startsWith('refs/heads/') || !merged.size) process.exit(0);
    verdict = judgeMerge(top, { target: head.slice('refs/heads/'.length), commits: [...merged] });
    if (verdict.allow && verdict.story && merged.size === 1 && verdict.judged[0]?.file && stagedDiffers(top, [...merged][0], verdict.judged[0].file)) {
      verdict = { allow: false, reason: 'the staged merge result differs from the automatic merge of the story; re-verify' };
    }
  }
} catch {
  process.exit(0);
}

if (verdict && !verdict.allow) {
  const what = verdict.ref ? `the update of ${verdict.ref}` : 'this merge commit';
  fs.writeSync(2, `deliver blocked ${what}: ${lib.oneLine(verdict.reason)}.\n${recovery()}\n`);
  process.exit(1);
}
process.exit(0);

// worktreeTop(): the working tree's top level. receive-pack runs hooks inside the git directory
// (with GIT_DIR=.), where --show-toplevel fails or names the git directory itself, so there the top
// level is the parent of the git common directory of a non-bare repository, and GIT_DIR is dropped
// so the gate's git calls find the repository from it. A bare repository has no working tree.
function worktreeTop() {
  const { git, chomp } = lib;
  const inGitDir = chomp(git(process.cwd(), ['rev-parse', '--is-inside-git-dir']) || '') === 'true';
  const here = inGitDir ? '' : chomp(git(process.cwd(), ['rev-parse', '--show-toplevel']) || '');
  if (here) return here;
  if (chomp(git(process.cwd(), ['rev-parse', '--is-bare-repository']) || '') === 'true') return '';
  const common = chomp(git(process.cwd(), ['rev-parse', '--git-common-dir']) || '');
  if (!common) return '';
  const parent = path.dirname(path.resolve(process.cwd(), common));
  delete process.env.GIT_DIR;
  delete process.env.GIT_WORK_TREE;
  return chomp(git(parent, ['rev-parse', '--show-toplevel']) || '');
}

// recovery(): what to run after a refusal, for the state git leaves. An in-progress merge
// (MERGE_HEAD) is aborted. A refused fast-forward, reset, or rebase step can leave the refused
// changes in the index and working tree with the branch unmoved; `git reset --merge` puts them
// back to HEAD and keeps unrelated local changes.
function recovery() {
  if (inMerge) return 'Run git merge --abort, fix the cause, and merge again.';
  const dirty = top && lib.git(top, ['diff', '--cached', '--quiet', 'HEAD', '--']) === null;
  if (dirty) return 'The refused changes may be left staged: run git reset --merge to return the index and working tree to HEAD, then fix the cause and retry.';
  return 'Fix the cause and retry.';
}

// stagedDiffers(top, mergeHead, file): true when the staged merge result differs, beyond the story
// file, from `git read-tree -m` of the merge base, HEAD, and mergeHead in a temporary index, where
// that merge needs no content merge; false when it matches or cannot be compared.
function stagedDiffers(top, mergeHead, file) {
  const { git, chomp } = lib;
  const base = chomp(git(top, ['merge-base', 'HEAD', mergeHead]) || '');
  if (!base) return false;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deliver-gate-'));
  const env = { ...process.env, GIT_INDEX_FILE: path.join(dir, 'index') };
  const run = (args) => spawnSync('git', ['-C', top, ...args], { env, encoding: 'utf8', windowsHide: true, timeout: 10000, maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  try {
    if (run(['read-tree', '-m', '-i', '--aggressive', base, 'HEAD', mergeHead]).status !== 0) return false;
    const unmerged = new Set((run(['ls-files', '-u', '-z']).stdout || '').split('\0').filter(Boolean).map((l) => l.split('\t')[1]));
    if ([...unmerged].some((p) => p !== file)) return false;
    if (unmerged.size && run(['update-index', '--force-remove', '--', file]).status !== 0) return false;
    const clean = chomp(run(['write-tree']).stdout || '');
    const staged = chomp(git(top, ['write-tree']) || '');
    if (!clean || !staged) return false;
    const r = spawnSync('git', ['-C', top, 'diff', '-z', '--name-only', clean, staged, '--'], { encoding: 'utf8', windowsHide: true, timeout: 10000, maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
    if (r.status !== 0) return false;
    return r.stdout.split('\0').filter(Boolean).some((p) => p !== file);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
