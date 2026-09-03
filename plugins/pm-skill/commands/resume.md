---
description: Resume a PM-managed project by reading the saved state and logbook, then continuing.
---

Use the `project-manager` skill to resume work on this project. Load
`references/logging-and-state.md` and follow its resume section. If the state uses an older layout,
meaning a pre-0.10.1 actor id, a pre-0.13 actor file, a flat 0.8 layout, or a pre-0.8 `tmp/` layout,
load `references/migrations.md` first and commit that migration on its own.

Read in this order: the shared `pm/pm-state.json`, then **your** `pm/actors/<actor-id>.json`, then
`pm/actors/<actor-id>.HANDOFF.md` when it is current. Pull or rebase first if a remote exists,
because teammates' claims and ships become visible only after a fetch.

Summarise where things stand, including teammates' positions from the other `pm/actors/*.json` files
(read-only) and any `assignments` conflict, then continue from your recorded `next` step.

If `AGENTS.md` is absent at the project root, say so in one line and point to the migration in
`references/instruction-layers.md`. Do not write it during resume.

If no state file exists in any location, there is nothing to resume. Start from discovery instead.
