---
description: Resume a PM-managed project from git, the approval marker, and the story Execution blocks, then continue.
---

Mode: $ARGUMENTS  (optional; `--heartbeat` when a scheduled T3 heartbeat sent this, see
`references/host-t3.md`)

With `--heartbeat`, do nothing when any of these holds:
- a turn or subagent is still running;
- an escalation is unanswered and no independent build-ready story remains in the current sprint;
- the work is at any checkpoint the plan's configured checkpoint policy says to wait at
  (`references/planning-and-signoff.md`), and the user has not yet answered it.

Then append `heartbeat: idle, <reason>` to `tmp/log.md` only when the reason differs from the
last heartbeat entry there, so an unchanged state logs once, not every 30 minutes. Otherwise
resume as below.

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
