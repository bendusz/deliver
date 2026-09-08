# Resume procedure

`/deliver:resume` runs this. `state.md` owns what each file means.

## Read order
1. Pull or rebase first when a remote exists, because teammates' claims and ships become visible
   only after a fetch.
2. `docs/approval.json`. When it is absent and `pm/pm-state.json` or `tmp/pm-state.json` exists,
   migrate per `migrations.md` first, in its own commit.
3. `node "${CLAUDE_PLUGIN_ROOT}/hooks/lib.mjs" state .`, the derived position as JSON: phase and
   the reference to load, branch, the checked-out story's Execution block, claims, unmerged
   stories, worktrees, uncommitted count, and handoff freshness. Then
   `git log --first-parent -5 <integration branch>` for what shipped last.
4. On a `pm/S<sprint>-<n>-<slug>` branch, that story's file and its Execution block. On the
   integration branch, every story's Execution block, to see what is claimed and what is unmerged.
5. `docs/handoff/<you>.md` when it is current, meaning `git diff --name-only <BASE_COMMIT> HEAD`
   is empty or lists only that file, which is what its own commit leaves. Otherwise it is stale:
   skim it for gotchas and trust git and the story files.
6. `docs/wiki/index.md` when it exists, before any `docs/` scan.

The bundled `session-context.mjs` hook prints these facts into every new or freshly compacted
session, so a fresh session already carries the headline.

## Continue
First place the project by the `state` command's `phase`, which follows `state.md`'s derivation.
A `pending` or `revoked` marker, or an approved one whose plan changed, means planning: return to
`planning-and-signoff.md`'s sign-off gate or `/deliver:correct-course`. `retrospective` means a
completed sprint has no record yet: run `/deliver:retro <n>` for each sprint the `state` command
lists under `sprints_without_retro`, lowest first, before any claim. An `approved` marker
with no story files means decomposition, or the skeleton when the plan asks for one. Stories with
no Execution block at all mean the first claim. Only then continue from a story's Execution block `status`,
using its persisted `builder` and counters rather than re-deciding from memory:
- `claimed`: dispatch the build, loop state 1.
- `building`: a builder was dispatched and may have left uncommitted output. Re-run the scope
  check, commit what passes, then gate, state 2.
- `built`: gate, then review, states 2 and 3.
- `in-review`: `rounds` says how many fix rounds are spent; re-run the gates and the review on the
  committed diff.
- `blocked`: present the blocker and the Execution notes to the user before doing anything else.
- `merged`: take the next unclaimed, build-ready story.

With no story checked out and no sprint owed a retrospective, take the next unclaimed story in
sprint order. A story whose Execution
block names another owner is theirs. A story with no block whose `pm/<id>-*` branch is already
merged into the integration branch is done, not unclaimed: give it a `merged` block, commit, and
move on.

## Parallel batches
On resume from the main checkout, reconcile `git worktree list` against the Execution blocks whose
`branch` is unmerged:
- A worktree with uncommitted changes and status `building` is the expected state before the
  tail commits. Re-run the scope check, then re-enter `parallel-execution.md`'s integration tail
  at its step 1.
- A branch whose worktree vanished externally: record it in the story's Execution notes rather
  than moving on silently. Only work committed to the branch survived, so check it before assuming
  the story is intact.
- A `blocked` story: present the blocker and re-enter the continuation its notes call for.
- Then `git worktree prune` true orphans and continue the tail.
