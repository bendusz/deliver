#!/usr/bin/env node
// deliver's git-level ship gate. Where the PreToolUse hook predicts a merge from command text, this
// judges the change git is actually making, whatever shell form started it.
//
//   node git-merge-gate.mjs reference-transaction
//     Git (2.28 or newer) runs it from the `reference-transaction` shim git-hook-install.mjs writes.
//     The shim passes, on stdin, only the `<old> <new> <ref>` lines of the `prepared` phase whose
//     ref is a deliver project's integration branch, so fetches and other ref updates never start
//     node. Each update is judged by require-verified.mjs's judgeRefUpdate(): a merge commit, a
//     fast-forward, a pull, a rebase, a reset, an update-ref, and a conflicted merge finished by
//     hand alike. A deny exits 1, and git aborts the whole transaction.
//   node git-merge-gate.mjs pre-merge-commit | pre-commit
//     The fallback for git older than 2.28, which has no reference-transaction hook: the current
//     branch (`git symbolic-ref -q HEAD`) is the target, and the merged commits are every SHA in
//     MERGE_HEAD and every `GITHEAD_<sha>` variable git merge exports (git writes MERGE_HEAD only
//     after pre-merge-commit runs). judgeMerge() gives the verdict. Fast-forwards are not gated.
//
// Exits 0 with DELIVER_NO_ENFORCE=1, outside a deliver project, for a ref that is no project's
// integration branch, and on an internal error unless a story merge into an integration branch is
// certain, when the verdict is "cannot establish ...": the PreToolUse hook's failure model.
import fs from 'node:fs';

if (process.env.DELIVER_NO_ENFORCE === '1') process.exit(0);

let verdict;
let inMerge = false;
let lib;
try {
  lib = await import('./lib.mjs');
  const { judgeMerge, judgeRefUpdate, mergeHeads } = await import('./require-verified.mjs');
  const { git, chomp } = lib;
  const top = chomp(git(process.cwd(), ['rev-parse', '--show-toplevel']) || '');
  if (!top) process.exit(0);
  const merged = new Set(mergeHeads(top) ?? []);
  for (const key of Object.keys(process.env)) {
    const m = key.match(/^GITHEAD_([0-9a-f]{40,64})$/);
    if (m) merged.add(m[1]);
  }
  inMerge = merged.size > 0;
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
    const head = chomp(git(top, ['symbolic-ref', '-q', 'HEAD']) || '');
    // A merge onto a detached HEAD ships nothing.
    if (!head.startsWith('refs/heads/') || !merged.size) process.exit(0);
    verdict = judgeMerge(top, { target: head.slice('refs/heads/'.length), commits: [...merged] });
  }
} catch {
  process.exit(0);
}

if (verdict && !verdict.allow) {
  const what = verdict.ref ? `the update of ${verdict.ref}` : 'this merge commit';
  const fix = inMerge ? 'Run git merge --abort, fix the cause, and merge again.' : 'Fix the cause and retry.';
  fs.writeSync(2, `deliver blocked ${what}: ${lib.oneLine(verdict.reason)}.\n${fix}\n`);
  process.exit(1);
}
process.exit(0);
