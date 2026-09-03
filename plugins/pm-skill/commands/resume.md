---
description: Resume a PM-managed project by reading the saved state and logbook, then continuing.
---

Use the `project-manager` skill to resume work on this project.

First read the shared `pm/pm-state.json` (phase, sprint, sign-off status, `assignments`), then
**your** `pm/actors/<actor-id>.json`. Derive the actor id with
`node "${CLAUDE_PLUGIN_ROOT}/hooks/lib.mjs" actor-id .`, never by hand, per
`references/logging-and-state.md`. Your file carries the story, the branch, the loop counters
(`current_story_rounds` and `current_story_retries`, whose fix and retry caps count what earlier
sessions already spent), the persisted `resolved_builder`, and `next`. For a parallel batch, use each
entry's persisted `builder`; never re-resolve `auto` after a session loss. On a v0.9 layout with no
`pm/actors/<you>.json` yet, meaning you are a new actor on this project, create it from
`${CLAUDE_PLUGIN_ROOT}/templates/actor-state.json.template` and commit it before continuing. If
`pm/actors/<you>.HANDOFF.md` exists and is current (your `updated` is not newer than
`handoff_written`), use it as the primary briefing: it carries the in-flight detail, decisions,
gotchas, `READ_FIRST` and `SKIP` pointers, and ordered next steps. Fall back to `pm/log.md` for
anything it does not cover. Summarise for the user where things stand, including teammates' positions
from the other `pm/actors/*.json` files (read-only) and any `assignments` conflicts, then continue
from your recorded `next` step. Pull or rebase first if a remote exists, because teammates' claims
and ships only become visible after a fetch.

- If `AGENTS.md` is absent at the project root, say so in one line and point to the migration in
  `references/instruction-layers.md`. Do not write it during resume; offer to perform the migration
  when the user asks.

If what you find is a pre-0.10.1 actor id, a pre-0.13 actor file, a flat 0.8 layout, or a pre-0.8
`tmp/` layout, migrate it per `references/migrations.md` and commit that migration before resuming as
above.

If no state file exists in any location, there is nothing to resume. Start from discovery instead.
