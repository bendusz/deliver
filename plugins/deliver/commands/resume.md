---
description: Resume a PM-managed project from git, the approval marker, and the story Execution blocks, then continue.
---

Use the `project-manager` skill to resume work on this project. Load
`references/resume-procedure.md` and follow it, then `references/migrations.md` when it finds a
pre-0.24 `pm/` directory or an old story format.

Summarise where things stand: the approval status, the checked-out story and its Execution block,
the other claimed stories with their owners, worktrees, uncommitted paths, and the handoff's
freshness. Then continue from the Execution block's `status`.

If `AGENTS.md` is absent at the project root, say so in one line and point to the migration in
`references/instruction-layers.md`. Do not write it during resume.

On a `standard` or larger project with no `docs/wiki/`, offer the backfill in
`references/knowledge.md`. Do not run it unasked.

If neither `docs/approval.json` nor legacy state exists, place the project by its `docs/`
artifacts: a spec with no plan continues at specification or planning, and no spec at all means
discovery.
