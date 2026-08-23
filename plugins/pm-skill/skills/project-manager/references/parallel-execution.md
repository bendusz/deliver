# Parallel Execution (`[P]` stories)

An **opt-in, best-effort** fast path: build several independent stories at once in isolated git
worktrees, then integrate them **one at a time**. If anything is unavailable or goes wrong, fall back
to the sequential `implementation-loop.md`. Every git rule from the hard rules still holds.

**Why it's safe:** builders **make no commits** (you own git). The concurrent phase is pure
file-editing in separate directories — **zero git writes** — so there's no shared-`.git` contention.
Every git operation (worktree add/remove, commit, merge) is **yours, and serial**, and every worktree
command is run **from the main checkout**.

## 1. Choose the parallel batch (at sprint start)
A batch = stories in the sprint that are all of:
- **build-ready** (see `decomposition.md`) and marked **`[P]`**, and
- their `depends-on` are **already merged**, and
- they **don't share a file domain** — compare each story's authoritative **`pm-meta.touches`**
  (the visible Touches is its human-readable copy; flag any mismatch). If two would write the same
  files, **serialize them** (one this batch, the other after).
  A story whose **Touches is blank/unknown (`—`) is treated as overlapping everything** — it is
  **not eligible** for the batch; run it sequentially.

Need **≥2** stories after that filter, and `git worktree` must work — else just run the sequential
loop. **Cap concurrency** (default **3**; raise only with care — conflict/coordination cost grows
roughly with the square of the batch size); run a larger set in waves.

## 2. Build phase — parallel, edit-only
Prefer the host's **native worktree isolation** if it offers it. Otherwise, per story, create a
worktree + story branch from the integration branch:
`git worktree add tmp/worktrees/<slug> -b pm/S<sprint>-<n>-<slug> <integration_branch>`
(ensure `tmp/` — so `tmp/worktrees/` — is gitignored first). **A story's worktree is where all of its
work happens: every builder/debugger dispatch for that story is given its worktree path and works
there.**
- Before dispatch, resolve every `Builder: auto` with the same rules as `implementation-loop.md`.
  In the clean integration checkout, claim the batch and persist each resolved choice in the
  corresponding `parallel_batch` entry, append the choices and reasons to `pm/log.md`, and commit
  the assignments, actor state, and log together. Never leave route decisions only in prose.
- Run `codex-builder-run.sh --preflight` against every Codex worktree/story pair before concurrent
  dispatch. A failed preflight removes that story from the batch without consuming task quota.
- Dispatch the batch's builders **together** (concurrent subagent calls in one step), giving each
  its resolved builder inputs: both builders get the story file path and absolute worktree root;
  `codex-builder` also gets `Mode: build`. `expert-builder` must confirm the exact git root and use
  worktree-rooted paths for all edits and commands. Tell each to **implement and self-check only**.
  Do not run the full or exclusive test suite (you run the authoritative gates serially next; this
  avoids parallel builders colliding on shared ports/DBs). Take back only structured summaries.
- **Commit each story's edits to its story branch the moment that builder returns done** — before you
  process the next builder's result — so no work sits uncommitted in a worktree (story-path-scoped;
  **never `git add -A`**). For Codex, use the runner's authoritative
  `actual_files_changed`, not its model-reported list. Record the commit in `parallel_batch` and set
  the story's status to `built`.
- If a builder returns **blocked** or fails, retry it up to **2** times with clarification; if still
  failing, mark its `parallel_batch` entry `blocked` (nothing to commit) and carry on with the rest.

If the host serializes the dispatch, isolation still holds — you lose only the wall-clock win.

## 3. Integration tail — serial (FIFO / priority; real dependencies first)
Take one story at a time and land it before starting the next. **Work in that story's worktree.**
1. **Bring the latest integration tip into the story branch** (merge or rebase it up to date). If
   this **conflicts** and you can't resolve it cleanly, **stop — don't force it**: escalate to the
   user with the story and the conflicting paths, mark the story `blocked`, and move to the next.
   (Optionally enable `git rerere` so repeated resolutions are remembered.)
2. **Run the authoritative gates** (test/lint/build per `review-gates.md`) **in the story's
   worktree**, on that combined result — this is where a **semantic conflict** surfaces (two stories
   that each passed alone but break together). If the worktree lacks runtime deps (`node_modules`,
   `.env`), bootstrap them first (install only — **don't commit** those artifacts); if that isn't
   feasible, fall back to the sequential loop for this story.
3. **Review + fix** exactly as in the sequential loop, **in the worktree**: cumulative
   story-scoped diff from authoritative changed paths →
   risk-selected panel → triage → prefer `codex-builder` with a contained evidence brief for a
   localized fix, otherwise use `expert-builder`, **≤3 rounds** (dispatch `debugger` first when
   a gate fails or a round stalls), re-gating each round. Commit accepted fixes to the story branch.
4. **Verify.** Dispatch `pm-verifier` (read-only) **in the worktree** on the combined result — the
   story file, `docs/spec.md`/`docs/plan.md`, the story-scoped diff, the reviewer verdicts, and the
   gate results. Merge only on `STATUS: PASS`; `FAIL` returns to step 3's fix loop (same ≤3-round
   bound), `UNKNOWN` needs the missing evidence or user escalation. (See `verification.md`.)
5. On green with no open `block`/`major` and `pm-verifier` `PASS`: `--no-ff` merge the story branch
   into the integration branch (**local by default; remote only on explicit request**). **Log** the
   outcome; set status `merged`.
6. **Remove the worktree** (`git worktree remove`) now that the work is committed and merged.

A **blocked** story (failed tip-merge in step 1, or escalation after 3 fix rounds) **does not block
the rest**: leave its worktree in place, set status `blocked`, and note in `pm/log.md` what you need
from the user. A partial batch still checkpoints at the sprint boundary.

## Worktree safety (non-negotiable)
- **Capture before cleanup:** commit a story's edits to its branch **before touching any other
  worktree and before removing this one**.
- Remove only with **`git worktree remove`** — **never `rm -rf`**. **Never force-remove a worktree
  with uncommitted changes** (check `git -C <wt> status --porcelain` first; preserve and report).
- **No orphans:** clean up every worktree you created — on success *or* error/interruption.
- Give every worktree its **own** branch (git refuses to check the same branch out twice — don't
  `--force` past it). **Don't run `git gc`** while worktrees are active.
- The sign-off hook is satisfied inside a worktree: `pm/pm-state.json` is tracked, so the worktree's
  checkout carries it — and worktrees exist only after sign-off, when the committed `signed_off` is
  already `true`.

## State & resume
Track the batch in **your** `pm/actors/<you>.json` `parallel_batch` — each entry
`{story, branch, worktree, builder, commit, status, rounds, retries}` with status
`building|built|in-review|merged|blocked`; `rounds`/`retries` play the same role as
`current_story_rounds`/`current_story_retries` on the sequential path, and the ≤3-round / ≤2-retry
caps count what a previous session already spent. The batch is per-actor: claim every batch story
in the shared `assignments` before building (as in the sequential step 0), and release each claim
as it merges. Cross-actor coordination happens through `assignments`, never through another
actor's batch.

On resume, **from the main checkout**:
- Continue each story with its persisted `builder`; do not resolve `auto` again after a session loss.
- Reconcile `parallel_batch` against `git worktree list`. If a `built`/`in-review` story's worktree
  directory is **missing** (deleted externally), **log the anomaly** (its branch should already hold
  the committed work — verify before continuing) rather than silently moving on.
- For a `building` worktree that still has **uncommitted** changes, commit them now (story-path-
  scoped) and advance it to `built` — never prune a dirty worktree.
- For a `blocked` story, present the blocker to the user and re-enter the **appropriate**
  continuation per its `pm/log.md` note — resolve the **tip-merge conflict** (step 1) or re-run the
  **fix loop** (step 3) — before continuing the remaining unmerged stories.
- Then `git worktree prune` true orphans and continue the integration tail.

## Fallback (always available)
Parallel is never required. If worktrees are unsupported, setup fails, or a story misbehaves mid
flight, finish it on the sequential `implementation-loop.md`. Sequential is the default and the net.
