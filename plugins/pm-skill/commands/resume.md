---
description: Resume a PM-managed project by reading the saved state and logbook, then continuing.
---

Use the `project-manager` skill to resume work on this project. Load
`references/logging-and-state.md` and follow its "On resume" section, which owns the read order, the
pull-or-rebase rule, handoff freshness, actor handling, and the continuation point. Load
`references/migrations.md` only when that section finds an older layout, and commit that migration on
its own.

Summarise where things stand, including teammates' positions from the other `pm/actors/*.json` files
(read-only) and any `assignments` conflict, then continue from your recorded `next` step.

If `AGENTS.md` is absent at the project root, say so in one line and point to the migration in
`references/instruction-layers.md`. Do not write it during resume.

On a `standard` or larger project with no `docs/wiki/`, offer the backfill in
`references/knowledge.md`. Do not run it unasked.

If no state file exists in any location, there is nothing to resume. Start from discovery instead.
