---
description: Resume a PM-managed project by reading the saved state and logbook, then continuing.
---

Use the `project-manager` skill to resume work on this project. Load
`references/resume-procedure.md` and follow it, then `references/migrations.md` only when it finds
an older layout.

Summarise where things stand, including teammates' positions from the other `pm/actors/*.json` files
(read-only) and any `assignments` conflict, then continue from your recorded `next` step.

If `AGENTS.md` is absent at the project root, say so in one line and point to the migration in
`references/instruction-layers.md`. Do not write it during resume.

On a `standard` or larger project with no `docs/wiki/`, offer the backfill in
`references/knowledge.md`. Do not run it unasked.

If no state file exists in any location, start from discovery instead.
