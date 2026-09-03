# Parallel execution (`[P]` stories)

An opt-in, best-effort fast path: build several independent stories at once in isolated git
worktrees, then integrate them one at a time. If anything is unavailable or goes wrong, fall back to
the sequential `implementation-loop.md`. Every git rule from the hard rules still holds.

Why it is safe: builders make no commits, because you own git. The concurrent phase is pure
file-editing in separate directories, with zero git writes, so nothing contends for the shared
`.git`. Every git operation (worktree add and remove, commit, merge) is yours and serial, and you run
every worktree command from the main checkout.

## 1. Choose the parallel batch (at sprint start)
A batch is the stories in the sprint that are all of:
- build-ready, see `decomposition.md`, and marked `[P]`; and
- their `depends-on` are already merged; and
- they do not share a file domain. Compare each story's authoritative `pm-meta.touches`; the visible
  Touches is its human-readable copy, so flag any mismatch. If two would write the same files,
  **serialize** them: one this batch, the other after. A story with no bounded Touches is not
  build-ready and cannot enter a batch.

You need 2 or more stories after that filter, and `git worktree` must work. Otherwise run the
sequential loop. **Cap** concurrency, default 3, and raise it only with care, because conflict and
coordination cost grows roughly with the square of the batch size. Run a larger set in waves.

## 2. Build phase, parallel and edit-only
Prefer the host's native worktree isolation if it offers any. Otherwise create a worktree and story
branch from the integration branch per story:
`git worktree add tmp/worktrees/<slug> -b pm/S<sprint>-<n>-<slug> <integration_branch>`, having first
made sure `tmp/`, and so `tmp/worktrees/`, is gitignored. A story's worktree is where all of its work
happens: every builder and debugger dispatch for that story gets its worktree path and works there.

- Before dispatch, resolve every `Builder: auto` with the same rules as `implementation-loop.md`. In
  the clean integration checkout, claim the batch, persist each resolved choice in the corresponding
  `parallel_batch` entry, append the choices and reasons to `pm/log.md`, and commit the assignments,
  the actor state, and the log together. Never leave route decisions only in prose.
- Run the runner's `--mode build --preflight` against every Codex worktree and story pair before
  concurrent dispatch. A failed preflight removes that story from the batch without consuming task
  quota.
- Dispatch the batch's builders together, as concurrent subagent calls in one step, giving each its
  resolved builder inputs. Both builders get the story file path and the absolute worktree root;
  `codex-builder` also gets `Mode: build`. `expert-builder` must confirm the exact git root and use
  worktree-rooted paths for all edits and commands. Tell each to implement and self-check only. Do
  not run the full or exclusive test suite, since you run the authoritative gates serially next and
  this keeps parallel builders from colliding on shared ports and databases. Take back only
  structured summaries.
- Before each writer's changes are committed, derive that run's changed paths from the worktree with
  `git -C <worktree> diff --name-only --diff-filter=ACDMRTUXB HEAD --` plus
  `git -C <worktree> ls-files --others --exclude-standard`, then sort and deduplicate them. Every
  path must equal an authoritative `pm-meta.touches` entry or sit beneath an allowed directory entry.
  Cross-check Codex paths with its snapshot-derived `actual_files_changed`. On any out-of-scope,
  protected, or unexplained path, **stop** that story and preserve the worktree for inspection. Keep
  a cumulative union of the accepted repository-derived paths across build and fix runs.
- **Commit** each story's edits to its story branch the moment that builder returns done, before you
  process the next builder's result, so no work sits uncommitted in a worktree. Scope the commit to
  the checked path set and **never** run `git add -A`. Record the commit in `parallel_batch` and set
  the story's status to `built`.
- If a builder returns blocked or fails, retry it up to **2** times with clarification. If it is
  still failing, mark its `parallel_batch` entry `blocked`, with nothing to commit, and carry on with
  the rest.

If the host serializes the dispatch, isolation still holds. You lose only the wall-clock win.

## 3. Integration tail, serial (FIFO or priority; real dependencies first)
Take one story at a time and land it before starting the next, working in that story's worktree.
Every git command takes `-C <worktree>`. The sequential loop in `implementation-loop.md` still
defines gate, review, fix, verify, and ship; only these deltas apply.

1. Merge the latest integration tip into the story branch first. If that conflicts and you cannot
   resolve it cleanly, **stop** rather than forcing it: escalate to the user with the story and the
   conflicting paths, mark the story `blocked`, and move to the next. Optionally enable `git rerere`
   so repeated resolutions are remembered.
2. Gate, review, fix, and verify on that combined result, which is where a semantic conflict surfaces
   when two stories each passed alone but break together. If the worktree lacks runtime deps such as
   `node_modules` or `.env`, bootstrap them first, installing only and **never** committing those
   artifacts. If that is not feasible, fall back to the sequential loop for this story.
3. On green, with no open `block` or `major` and `pm-verifier` `PASS`, `--no-ff` merge the story
   branch into the integration branch, locally by default and remotely only on explicit request.
   **Log** the outcome and set status `merged`.
4. Remove the worktree with `git worktree remove` now that the work is committed and merged.

A blocked story, whether from a failed tip-merge in step 1 or an escalation after 3 fix rounds, does
not block the rest: leave its worktree in place, set status `blocked`, and note in `pm/log.md` what
you need from the user. A partial batch still checkpoints at the sprint boundary.

## Worktree safety
- Capture before cleanup: **commit** a story's edits to its branch before touching any other worktree
  and before removing this one.
- Remove only with `git worktree remove`, **never** `rm -rf`. **Never** force-remove a worktree with
  uncommitted changes; check `git -C <wt> status --porcelain` first, then preserve and report.
- No orphans: clean up every worktree you created, on success and on error or interruption.
- Give every worktree its own branch. Git refuses to check the same branch out twice, so do not
  `--force` past it. Do not run `git gc` while worktrees are active.
- The sign-off hook is satisfied inside a worktree: `pm/pm-state.json` is tracked, so the worktree's
  checkout carries it, and worktrees exist only after sign-off, when the committed `signed_off` is
  already `true`.

## State and resume
Track the batch in **your** `pm/actors/<you>.json` `parallel_batch`, each entry
`{story, branch, worktree, builder, commit, status, rounds, retries}` with status
`building|built|in-review|merged|blocked`. `rounds` and `retries` play the same role as
`current_story_rounds` and `current_story_retries` on the sequential path, and the 3-round and
2-retry **caps** count what a previous session already spent. The batch is per-actor: claim every
batch story in the shared `assignments` before building, as in the sequential step 0, and release
each claim as it merges. Cross-actor coordination happens through `assignments`, never through
another actor's batch.

On resume, from the main checkout:
- Continue each story with its persisted `builder`. Do not resolve `auto` again after a session loss.
- Reconcile `parallel_batch` against `git worktree list`. If a `built` or `in-review` story's
  worktree directory is missing because something deleted it externally, **log** the anomaly rather
  than silently moving on. Its branch should already hold the committed work, so verify that before
  continuing.
- For a `building` worktree that still has uncommitted changes, **commit** them now, story-path
  scoped, and advance it to `built`. Never prune a dirty worktree.
- For a `blocked` story, present the blocker to the user and re-enter the continuation its
  `pm/log.md` note calls for, resolving the tip-merge conflict from step 1 or re-running the fix
  loop, before continuing the remaining unmerged stories.
- Then `git worktree prune` true orphans and continue the integration tail.

## Fallback (always available)
Parallel is never required. If worktrees are unsupported, setup fails, or a story misbehaves
mid-flight, finish it on the sequential `implementation-loop.md`. Sequential is the default and the
net.
