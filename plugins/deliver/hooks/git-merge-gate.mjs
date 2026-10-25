#!/usr/bin/env node
// deliver's git-level ship gate. Git runs it from the `pre-merge-commit` hook, and from
// `pre-commit` while a merge is in progress, through the shim git-hook-install.mjs writes. Where the
// PreToolUse hook predicts a merge from command text, this judges the merge git is actually making,
// whatever shell form started it: the current branch (`git symbolic-ref -q HEAD`) is the target, and
// the merged commits are every SHA in MERGE_HEAD (`git rev-parse --git-path MERGE_HEAD`) and every
// `GITHEAD_<sha>` variable git merge exports. Git writes MERGE_HEAD only after pre-merge-commit
// runs (or when the merge stops for conflicts), so inside pre-merge-commit the GITHEAD_<sha>
// variables, which git merge sets for each head it merges, are the list; under pre-commit, when a
// stopped merge is committed by hand, MERGE_HEAD is. require-verified.mjs's judgeMerge() gives the
// verdict, so the rules are the PreToolUse hook's own.
//
// A deny prints the reason on stderr and exits 1: git refuses the merge commit and leaves the merge
// in progress, for `git merge --abort` or a commit once the cause is fixed. Exits 0 with
// DELIVER_NO_ENFORCE=1, outside a deliver project, for a target that is no project's integration
// branch, and on an internal error unless a story merge into an integration branch is certain, when
// judgeMerge denies with "cannot establish ...". Bypasses outside its reach: `--no-verify` (the
// PreToolUse hook blocks it on a story merge), a merge that creates no merge commit (`--ff-only`,
// `--squash`; the PreToolUse hook still judges those), `update-ref` or `push`, and deleting the
// hook.
import fs from 'node:fs';

if (process.env.DELIVER_NO_ENFORCE === '1') process.exit(0);

let verdict;
try {
  const { judgeMerge, mergeHeads } = await import('./require-verified.mjs');
  const { git, chomp } = await import('./lib.mjs');
  const top = chomp(git(process.cwd(), ['rev-parse', '--show-toplevel']) || '');
  if (!top) process.exit(0);
  const head = chomp(git(top, ['symbolic-ref', '-q', 'HEAD']) || '');
  // A merge onto a detached HEAD ships nothing.
  if (!head.startsWith('refs/heads/')) process.exit(0);
  const commits = new Set(mergeHeads(top) ?? []);
  for (const key of Object.keys(process.env)) {
    const m = key.match(/^GITHEAD_([0-9a-f]{40,64})$/);
    if (m) commits.add(m[1]);
  }
  if (!commits.size) process.exit(0);
  verdict = judgeMerge(top, { target: head.slice('refs/heads/'.length), commits: [...commits] });
} catch {
  process.exit(0);
}

if (verdict && !verdict.allow) {
  const reason = String(verdict.reason).replace(/[\x00-\x1f\x7f]+/g, ' ');
  fs.writeSync(2, `deliver blocked this merge commit: ${reason}.\nThe merge is still in progress: fix the cause and commit again, or run git merge --abort.\n`);
  process.exit(1);
}
process.exit(0);
