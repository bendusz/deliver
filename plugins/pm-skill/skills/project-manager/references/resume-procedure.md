# Resume procedure

`/pm-skill:resume` runs this. `logging-and-state.md` owns the file schemas, the log rules, and the
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

## Older layouts
If the state you find uses a pre-0.10.1 actor id, a pre-0.13 actor file, a flat 0.8 layout, or a
pre-0.8 `tmp/` layout, migrate it first per `migrations.md`, in its own commit.
