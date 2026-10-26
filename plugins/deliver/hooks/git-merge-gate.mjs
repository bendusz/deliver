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
//     conflicted merge finished by hand alike. A deny exits REFUSED (86, lib.mjs), and git aborts the whole
//     transaction. A push into this repository (`git push . pm/X:main`) runs it too: receive-pack
//     runs hooks in the git directory, so the working tree is found from the git common directory.
//   node git-merge-gate.mjs pre-merge-commit | pre-commit
//     The fallback for git older than 2.28, which has no reference-transaction hook: the current
//     branch (`git symbolic-ref -q HEAD`) is the target, and the merged commits are every SHA in
//     MERGE_HEAD and every `GITHEAD_<sha>` variable git merge exports (git writes MERGE_HEAD only
//     after pre-merge-commit runs). judgeMerge() gives the verdict, strict on an unreadable
//     FETCH_HEAD line only when the merge may be of FETCH_HEAD (fetchedMerge). A story merged
//     with any other head is refused: merge one story at a time. Fast-forwards, squash merges, and
//     cherry-picks make no merge commit and are not gated.
//     Such git has no `merge-tree --write-tree`, so the staged result is compared with the merge
//     only where git merges without a content merge: the index must equal `git read-tree -m` of
//     the merge base and the two heads, apart from the story file. Where a file needs a content
//     merge, only the verdicts are checked.
//
// A refusal prints what to run: `git merge --abort`, `git rebase --abort`, or
// `git cherry-pick --abort` for an operation in progress; `git reset --merge` only when the index is
// exactly the refused commit's tree (a refused fast-forward, reset, or squash commit), never over
// staged work of the user's own (recovery).
//
// Exits 0 with DELIVER_NO_ENFORCE=1, outside a deliver project, for a ref that is no project's
// integration branch, and on an internal error unless a story merge into an integration branch is
// certain, when the verdict is "cannot establish ...": the PreToolUse hook's failure model.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

if (process.env.DELIVER_NO_ENFORCE === '1') process.exit(0);

let verdict;
let inMerge = false;
let lib;
let rv;
let top = '';
try {
  lib = await import('./lib.mjs');
  rv = await import('./require-verified.mjs');
  const { judgeMerge, judgeRefUpdate, mergeHeads, ONE_AT_A_TIME } = rv;
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
      if (!verdict.allow) { verdict.ref = ref; verdict.next = next; break; }
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
    verdict = judgeMerge(top, { target: head.slice('refs/heads/'.length), commits: [...merged], strictFetch: fetchedMerge(top, merged) });
    if (verdict.allow && verdict.story && merged.size > 1) verdict = { allow: false, reason: ONE_AT_A_TIME };
    else if (verdict.allow && verdict.story && verdict.judged[0]?.file && stagedDiffers(top, [...merged][0], verdict.judged[0].files)) {
      verdict = { allow: false, reason: 'the staged merge result differs from the automatic merge of the story; re-verify' };
    }
  }
} catch {
  process.exit(0);
}

if (verdict && !verdict.allow) {
  // A refusal always exits REFUSED, whatever throws while its message is built or printed: the shim
  // reads any other status as a gate that failed to run, and lets the update through.
  try {
    const what = verdict.ref ? `the update of ${verdict.ref}` : 'this merge commit';
    fs.writeSync(2, `deliver blocked ${what}: ${lib.oneLine(verdict.reason)}.\n${recovery({ inMerge, top, next: verdict.next })}\n`);
  } catch { /* the refusal stands without its message */ } finally {
    // lib.mjs is loaded: a verdict exists only after it loaded.
    process.exit(lib.REFUSED);
  }
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

// fetchedMerge(top, merged): the merge may be of FETCH_HEAD: a merged SHA appears in FETCH_HEAD's
// raw text, or GIT_REFLOG_ACTION or MERGE_MSG names FETCH_HEAD. Only then does an unreadable
// FETCH_HEAD line refuse the merge, since that line could be the story.
function fetchedMerge(top, merged) {
  const read = (name) => {
    const where = lib.chomp(lib.git(top, ['rev-parse', '--git-path', name]) || '');
    try { return where ? fs.readFileSync(path.resolve(top, where), 'utf8') : ''; } catch { return ''; }
  };
  const raw = read('FETCH_HEAD');
  if ([...merged].some((sha) => raw.includes(sha))) return true;
  return /FETCH_HEAD/.test(process.env.GIT_REFLOG_ACTION ?? '') || /FETCH_HEAD/.test(read('MERGE_MSG'));
}

// recovery({ inMerge, top, next }): what to run after a refusal, for the state git leaves. An
// in-progress merge (MERGE_HEAD), rebase, or cherry-pick is aborted. A refused fast-forward,
// reset, or squash commit leaves the refused tree staged with the branch unmoved: when the index
// is exactly the refused new commit's tree, `git reset --merge` puts it back to HEAD and keeps
// unrelated local changes. Any other staged work is the user's own, so nothing is suggested
// that would drop it.
function recovery({ inMerge: merging, top: root, next }) {
  if (merging) return 'Run git merge --abort, fix the cause, and merge again.';
  if (!root) return 'Fix the cause and retry.';
  const exists = (name) => {
    const where = lib.chomp(lib.git(root, ['rev-parse', '--git-path', name]) || '');
    return Boolean(where) && fs.existsSync(path.resolve(root, where));
  };
  if (exists('rebase-merge') || exists('rebase-apply')) return 'Run git rebase --abort, fix the cause, and rebase again.';
  if (exists('CHERRY_PICK_HEAD')) return 'Run git cherry-pick --abort, fix the cause, and retry.';
  const staged = lib.git(root, ['diff', '--cached', '--quiet', rv.NO_SUBMODULE_IGNORE, 'HEAD', '--']) === null;
  const isRefused = typeof next === 'string' && /^[0-9a-f]{40,64}$/.test(next) && lib.git(root, ['diff', '--cached', '--quiet', rv.NO_SUBMODULE_IGNORE, next, '--']) !== null;
  if (staged && isRefused) return 'The refused changes are staged: run git reset --merge to return the index and working tree to HEAD, then fix the cause and retry.';
  return 'Fix the cause and retry.';
}

// stagedDiffers(top, mergeHead, files): true when the staged merge result differs, beyond the story
// files (every claimant's, for a story several projects claim), from `git read-tree -m` of the merge base, HEAD, and mergeHead in a temporary index, where
// that merge needs no content merge; false when it matches or cannot be compared.
function stagedDiffers(root, mergeHead, files) {
  const record = (p) => files.includes(p);
  const { git, chomp } = lib;
  const base = chomp(git(root, ['merge-base', 'HEAD', mergeHead]) || '');
  if (!base) return false;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deliver-gate-'));
  const env = { ...process.env, GIT_INDEX_FILE: path.join(dir, 'index') };
  const run = (args) => rv.spawnGit(root, args, { env });
  try {
    if (run(['read-tree', '-m', '-i', '--aggressive', base, 'HEAD', mergeHead]).status !== 0) return false;
    const unmerged = new Set((run(['ls-files', '-u', '-z']).stdout || '').split('\0').filter(Boolean).map((l) => l.split('\t')[1]));
    if ([...unmerged].some((p) => !record(p))) return false;
    if (unmerged.size && run(['update-index', '--force-remove', '--', ...unmerged]).status !== 0) return false;
    const clean = chomp(run(['write-tree']).stdout || '');
    const staged = chomp(git(root, ['write-tree']) || '');
    if (!clean || !staged) return false;
    const r = rv.spawnGit(root, ['diff', rv.NO_SUBMODULE_IGNORE, '-z', '--name-only', clean, staged, '--']);
    if (r.status !== 0) return false;
    return r.stdout.split('\0').filter(Boolean).some((p) => !record(p));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
