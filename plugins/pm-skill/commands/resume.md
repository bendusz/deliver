---
description: Resume a PM-managed project — read the saved state and logbook, then continue.
---

Use the `project-manager` skill to resume work on this project.

First read the shared `pm/pm-state.json` (phase, sprint, sign-off status, `assignments`), then
**your** `pm/actors/<actor-id>.json` (actor id per `references/logging-and-state.md`: full-email
slug + digest, e.g. `v-bende-gmail-com-0719f22c3305` — derive it with
`node "${CLAUDE_PLUGIN_ROOT}/hooks/lib.mjs" actor-id .`, never by hand) — your story,
branch, loop counters
(`current_story_rounds`/`current_story_retries`; the fix/retry caps count what earlier sessions
already spent), persisted `resolved_builder`, and `next`. For a parallel batch, use each entry's
persisted `builder`; never re-resolve `auto` after a session loss. On a v0.9 layout with no `pm/actors/<you>.json` yet (you are a new
actor on this project), create it from `${CLAUDE_PLUGIN_ROOT}/templates/actor-state.json.template`
and commit it before continuing. If `pm/actors/<you>.HANDOFF.md` exists and is current (your `updated`
is not newer than `handoff_written`), use it as the primary briefing — it carries the in-flight
detail, decisions, gotchas, `READ_FIRST`/`SKIP` pointers, and ordered next steps. Fall back to
`pm/log.md` for anything it doesn't cover. Summarise for the user where things stand — including
teammates' positions from the other `pm/actors/*.json` files (read-only) and any `assignments`
conflicts — then continue from your recorded `next` step. Pull/rebase first if a remote exists:
teammates' claims and ships only become visible after a fetch.

**Migration — pre-0.10.1 actor id** (a `pm/actors/<email-local-part>.json` exists that matches
your email's local part but not the full-email id): `git mv` that `.json` (and its `.HANDOFF.md`
if present) to the new id, update its `actor` field, commit, then resume as above — do NOT create
a second actor file alongside the orphan.

**Migration — flat 0.8 layout** (`pm-state.json` has personal fields, no `pm/actors/`): follow
"Migrating a flat 0.8 project" in `references/logging-and-state.md` (split your actor file out,
seed `assignments`, move the handoff, strip the log's Current State block, add the
`pm/log.md merge=union` gitattribute, commit), then resume as above.

**Migration — pre-0.8 `tmp/` layout:** follow "Migrating a pre-0.8 project" there (move the three
files into `pm/` with pointer stubs, update repo references, then apply the flat-0.8 migration in
the same pass, commit once). Then resume as above.

If no state file exists in any location, there is nothing to resume — start from discovery instead.
