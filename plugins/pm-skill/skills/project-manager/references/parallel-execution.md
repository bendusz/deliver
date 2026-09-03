# Parallel execution (`[P]` stories)

This is a delta on `implementation-loop.md`, not a replacement. Build several independent stories at
once in isolated git worktrees, then integrate them one at a time. The sequential loop still defines
routing, path scope checks, retry and fix bounds, gates, review, verification, ship, and logging.
Only the differences below apply. On any worktree trouble, finish the story sequentially.

This is safe because builders make no commits. You own git. The concurrent phase is pure
file-editing in separate directories, with zero git writes, so nothing contends for the shared
`.git`. Every git operation, meaning worktree add and remove, commit, and merge, is yours and
serial, and you run every worktree command from the main checkout.

## 1. Choose the batch (at sprint start)
A batch is the sprint's stories that are all of:
- build-ready, see `decomposition.md`, and marked `[P]`; and
- their `Depends on` stories are already merged; and
- they do not share a file domain. Compare each story's `pm-meta.touches`. If two would write the
  same files, **serialize** them: one this batch, the other after. A story with no bounded
  `pm-meta.touches` is not build-ready and cannot enter a batch.

You need 2 or more stories after that filter, and `git worktree` must work. Otherwise run the
sequential loop. **Cap** concurrency, default 3, and raise it only with care, because conflict and
coordination cost grows roughly with the square of the batch size. Run a larger set in waves.

## 2. Claim the whole batch, then build in parallel
- Resolve every `pm-meta` builder of `auto` by the sequential loop's rules before dispatch. Then, in
  the clean integration checkout, claim **every** batch story at once: set each `assignments` entry,
  persist each resolved choice in its `parallel_batch` entry, append the choices and reasons to
  `pm/log.md`, and commit assignments, actor state, and log together. Never leave route decisions
  only in prose.
- Give each story its own branch and worktree. Prefer the host's native worktree isolation if it
  offers any; otherwise
  `git worktree add tmp/worktrees/<slug> -b pm/S<sprint>-<n>-<slug> <integration_branch>`, having
  first confirmed `tmp/` is gitignored. Every builder and debugger dispatch for that story gets its
  worktree path and works there.
- Run `--mode build --preflight` against every Codex worktree and story pair first. A failed
  preflight drops that story from the batch without consuming task quota.
- Dispatch the batch's builders together, as concurrent subagent calls in one step, each with its
  story file path and the absolute worktree root. `expert-builder` must confirm the exact git root
  and use worktree-rooted paths for every edit and command. Tell each to implement and self-check
  only: no full or exclusive test-suite runs, because you run the authoritative gates serially next
  and this keeps parallel builders off shared ports and databases.
- Derive each run's changed paths from its worktree, not from the summary, with
  `git -C <worktree> diff --name-only --diff-filter=ACDMRTUXB HEAD --` plus
  `git -C <worktree> ls-files --others --exclude-standard`, then sort and deduplicate. The scope
  check is the loop's. On any out-of-scope, protected, or unexplained path, **stop** that story and
  preserve its worktree for inspection.
- Leave each story's edits **uncommitted** in its own worktree and set its status to `built`. The
  tail below runs the loop's gates and review against that working tree, which is where the diff
  lives, and commits only after `pm-verifier` passes. Nothing outside that worktree can see or
  disturb the edits meanwhile.
- A builder that stays blocked after the loop's retry cap gets its `parallel_batch` entry marked
  `blocked`. The rest of the batch carries on.

If the host serializes the dispatch, isolation still holds. You lose only the wall-clock win.

## 3. Integration tail, serial
Take one story at a time and land it before starting the next. Steps 1 to 3 run in that story's
worktree, so each git command takes `-C <worktree>`. Steps 4 and 5 run from the main checkout,
because the integration branch is checked out there and git refuses to check the same branch out
twice.

1. Run the loop's gate, review, fix, and verify steps in the worktree, in that order and against the
   still-uncommitted changes, exactly as the sequential loop runs them. Set status `in-review`.
   Re-derive and scope-check the changed paths as in section 2, diff **only** those paths, hand the
   panel that diff text, run the bounded fix rounds, then dispatch `pm-verifier`. The diff exists
   only while the changes are uncommitted, so do not commit before `PASS`. If the worktree lacks
   runtime deps such as `node_modules` or `.env`, bootstrap them first, installing only and **never**
   committing those artifacts. If that is not feasible, finish this story sequentially.
2. On `pm-verifier` `PASS`, **commit** the checked path set to the story branch, scoped to those
   paths and **never** with `git add -A`. Record the commit in `parallel_batch`. Do not touch another
   worktree until this commit lands.
3. Merge the latest integration tip into the story branch. If that conflicts and you cannot resolve
   it cleanly, **stop** rather than forcing it: escalate to the user with the story and the
   conflicting paths, mark the story `blocked`, and move to the next. Optionally enable `git rerere`
   so repeated resolutions are remembered. The tip has moved since your gates ran, so re-run the
   gates on the merged result, which is where a semantic conflict surfaces when two stories each
   passed alone but break together. A failure here re-enters the loop's fix rounds in this worktree,
   and each fix is committed to the story branch before you move on.
4. Ship from the main checkout, which already has the integration branch checked out: `--no-ff` merge
   the story branch, using `documentation.md`'s message format. Set status `merged`.
5. Remove the now-clean, merged worktree with `git worktree remove`, also from the main checkout.

A blocked story does not block the rest. A partial batch still checkpoints at the sprint boundary.

## Worktree safety
- Capture before cleanup: **never** remove or prune a worktree that still holds uncommitted work, and
  **commit** a story's edits to its branch before the integration tail moves on to the next story.
- Remove only with `git worktree remove`, **never** `rm -rf`. **Never** force-remove a worktree with
  uncommitted changes; check `git -C <wt> status --porcelain` first, then preserve and report.
- Remove every clean, merged worktree. A blocked or dirty worktree **stays** until the user has
  inspected it, and removing it is required once they have resolved it. Leaving one in place is a
  deliberate hold, so name it in `pm/log.md`; leaving one silently is an orphan.
- Give every worktree its own branch. Git refuses to check the same branch out twice, so do not
  `--force` past it. Do not run `git gc` while worktrees are active.
- The sign-off hook is satisfied inside a worktree: `pm/pm-state.json` is tracked, so the worktree's
  checkout carries it, and worktrees exist only after sign-off, when the committed `signed_off` is
  already `true`.

## State and resume
Track the batch in **your** `pm/actors/<you>.json` `parallel_batch`, each entry
`{story, branch, worktree, builder, commit, status, rounds, retries}` with status
`building|built|in-review|merged|blocked`. `rounds` and `retries` hold the loop's persisted fix and
retry counts for that story, so its caps survive a session loss. The batch is per-actor; cross-actor
coordination happens through `assignments`, never through another actor's batch. Release each claim
as its story merges.

On resume, from the main checkout:
- Continue each story with its persisted `builder`. Do not resolve `auto` again after a session loss.
- Reconcile `parallel_batch` against `git worktree list`. If a story's worktree directory is missing
  because something deleted it externally, **log** the anomaly rather than silently moving on. Only
  work already committed to the story branch survives, so check that branch before assuming the
  story is intact.
- A `building`, `built`, or `in-review` worktree with uncommitted changes is the expected state
  before the tail commits. Re-derive and scope-check its changed paths, then re-enter the tail at
  step 1. Never prune a dirty worktree.
- For a `blocked` story, present the blocker to the user and re-enter the continuation its
  `pm/log.md` note calls for, resolving the tip-merge conflict from step 1 or re-running the fix
  loop, before continuing the remaining unmerged stories.
- Then `git worktree prune` true orphans and continue the integration tail.

## Fallback
Parallel is never required. If worktrees are unsupported, setup fails, or a story misbehaves
mid-flight, finish it on the sequential `implementation-loop.md`. Sequential execution remains the
fallback.
