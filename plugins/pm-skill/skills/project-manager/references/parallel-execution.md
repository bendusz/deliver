# Parallel execution (`[P]` stories)

A delta on `implementation-loop.md`. Build several independent stories at once in isolated git
worktrees, then integrate them one at a time. The loop still owns routing, path scope checks, retry
and fix bounds, gates, review, verification, ship, and logging; only the differences below are new.
Parallel is never required: when worktrees are unsupported, setup fails, or a story misbehaves,
finish it sequentially.

Builders edit separate worktrees without committing. You run all git operations serially from the
main checkout.

## 1. Choose the batch (at sprint start)
A batch is the sprint's stories that are all of:
- build-ready by loop state 0, and marked `[P]`; and
- their `Depends on` stories are already merged; and
- they do not share a file domain. Compare each story's `pm-meta.touches`. If two would write the
  same files, **serialize** them: one this batch, the other after.

You need 2 or more stories after that filter, and `git worktree` must work. **Cap** concurrency at 3
by default; conflict and coordination cost grows roughly with the square of the batch size. Run
larger sets in waves.

## 2. Claim the whole batch, then build in parallel
- Resolve every `auto` builder by loop state 0 before dispatch. Then, in the clean integration
  checkout, claim **every** batch story at once: set each `assignments` entry, persist each resolved
  choice in its `parallel_batch` entry, append the choices and reasons to `pm/log.md`, and commit
  assignments, actor state, and log together.
- Give each story its own branch and worktree. Prefer the host's native worktree isolation if it
  offers any; otherwise
  `git worktree add tmp/worktrees/<slug> -b pm/S<sprint>-<n>-<slug> <integration_branch>`, having
  first confirmed `tmp/` is gitignored. Every dispatch for that story gets its worktree path.
- Run `--mode build --preflight` against every Codex worktree and story pair first. A failed
  preflight drops that story from the batch without consuming task quota.
- Dispatch the batch's builders together, as concurrent subagent calls in one step, each with its
  story file path and the absolute worktree root. Tell each to implement and self-check only, with
  no full test-suite run, because you run the authoritative gates serially next and shared ports and
  databases would collide.
- Run loop state 1's scope check per story against its own worktree, prefixing each git command with
  `-C <worktree>`.
- Leave each story's edits **uncommitted** in its own worktree and set its status to `built`. The
  tail gates and reviews that working tree, where the diff lives.
- A builder still blocked at loop state 1's retry cap gets its `parallel_batch` entry marked
  `blocked`. The rest of the batch carries on.

## 3. Integration tail, serial
Take one story at a time and land it before starting the next. Steps 1 to 3 run in that story's
worktree, so each git command takes `-C <worktree>`. Steps 4 and 5 run from the main checkout, since
git refuses to check the integration branch out twice.

1. Run loop states 2 to 5 in the worktree, in order, against the still-uncommitted changes. Set
   status `in-review`. The diff exists only while the changes are uncommitted, so do not commit
   before `PASS`. If the worktree lacks runtime deps such as `node_modules` or `.env`, install them
   first, **never** committing those artifacts.
2. On `pm-verifier` `PASS`, **commit** the checked path set to the story branch, scoped to those
   paths and **never** with `git add -A`. Record the commit in `parallel_batch`. Do not touch
   another worktree until this commit lands.
3. Merge the latest integration tip into the story branch, then re-gate the merged result per loop
   state 6. A failure re-enters loop state 4 in this worktree, and each fix is committed to the
   story branch before you move on. If the merge conflicts and you cannot resolve it cleanly,
   **stop** rather than forcing it: escalate to the user with the story and the conflicting paths,
   mark the story `blocked`, and move to the next.
4. Ship from the main checkout per loop state 6. Set status `merged`, then run loop state 7: log,
   update your actor file, and release the claim.
5. Remove the now-clean, merged worktree with `git worktree remove`.

A partial batch still checkpoints at the sprint boundary.

## Cleanup preconditions
- **Never** remove or prune a worktree that still holds uncommitted work. A stopped or `blocked`
  story keeps its worktree for inspection.
- Remove only with `git worktree remove`, **never** `rm -rf` and **never** `--force`. Check
  `git -C <wt> status --porcelain` first, then preserve and report.
- A dirty or blocked worktree **stays** until the user resolves it, then must go. Name any worktree
  you hold in `pm/log.md`; an unnamed one is an orphan.
- Give every worktree its own branch, and never run `git gc` while worktrees are active.
- The sign-off hook is satisfied inside a worktree: `pm/pm-state.json` is tracked, so the checkout
  carries it.

## State and resume
Track the batch in **your** `pm/actors/<you>.json` `parallel_batch`, each entry
`{story, branch, worktree, builder, commit, status, rounds, retries}` with status
`building|built|in-review|merged|blocked`. `rounds` and `retries` mirror the loop's counters, so its
caps survive a session loss. The batch is per-actor; cross-actor coordination happens through
`assignments`, never through another actor's batch.

On resume, from the main checkout:
- Continue each story with its persisted `builder`. Never resolve `auto` after a session loss.
- Reconcile `parallel_batch` against `git worktree list`. **Log** any worktree that vanished
  externally rather than moving on silently. Only work committed to the story branch survived, so
  check it before assuming the story is intact.
- A `building`, `built`, or `in-review` worktree with uncommitted changes is the expected state
  before the tail commits. Re-run the scope check, then re-enter the tail at step 1.
- For a `blocked` story, present the blocker to the user and re-enter the continuation its
  `pm/log.md` note calls for, resolving the tip-merge conflict from step 3 or re-running loop state
  4, before continuing the remaining unmerged stories.
- Then `git worktree prune` true orphans and continue the integration tail.
