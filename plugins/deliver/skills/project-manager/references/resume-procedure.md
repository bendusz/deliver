# Resume procedure

`/deliver:resume` runs this. `logging-and-state.md` owns the file schemas, the log rules, and the
claim discipline behind it.

## Read order
1. Pull or rebase first when a remote exists, because teammates' claims and ships become visible
   only after a fetch.
2. The shared `pm/pm-state.json`.
3. **Your** `pm/actors/<you>.json`, then `pm/actors/<you>.HANDOFF.md` when it is current. The
   handoff is stale when your `updated` is newer than its `handoff_written`; trust the state files
   and the log instead.
4. `docs/wiki/index.md` when it exists, before any `docs/` scan.

The bundled `session-context.mjs` hook injects a short pointer, yours plus teammate one-liners, into
every new or freshly-compacted session, so a fresh session already carries the headline.

## Continue
Continue from your recorded `next`, using the persisted `resolved_builder` and counters rather than
re-deciding from memory. If you are a new actor on an existing project and have no
`pm/actors/<you>.json` yet, create it from the template and commit it before continuing.

## Parallel batches
On resume from the main checkout, when your actor file holds a `parallel_batch`:
- Continue each story with its persisted `builder`. Never resolve `auto` after a session loss.
- Reconcile `parallel_batch` against `git worktree list`. **Log** any worktree that vanished
  externally rather than moving on silently. Only work committed to the story branch survived, so
  check it before assuming the story is intact.
- A `building`, `built`, or `in-review` worktree with uncommitted changes is the expected state
  before the tail commits. Re-run the scope check, then re-enter `parallel-execution.md`'s
  integration tail at its step 1.
- For a `blocked` story, present the blocker to the user and re-enter the continuation its
  `pm/log.md` note calls for, resolving the tip-merge conflict from that tail's step 3 or re-running
  loop state 4, before continuing the remaining unmerged stories.
- Then `git worktree prune` true orphans and continue the integration tail.

## Older layouts
If the state you find uses a pre-0.10.1 actor id, a pre-0.13 actor file, a flat 0.8 layout, or a
pre-0.8 `tmp/` layout, migrate it first per `migrations.md`, in its own commit.
