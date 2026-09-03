# Worked example — `todo-cli`

An **illustrative** walkthrough of what `pm-skill` produces for a small project ("a CLI to add and
list todos"). These files are **not executed** — they show the *shape* of the artifacts the PM
writes into a real project:

- `todo-cli/docs/plan.md` — the signed-off delivery plan.
- `todo-cli/docs/stories/` — two self-contained story files.
- `todo-cli/AGENTS.md` — the generated project instructions (facts only), and `todo-cli/CLAUDE.md` — the two-line `@AGENTS.md` bridge Claude Code reads.
- `todo-cli/pm/pm-state.json` — shared machine-readable state.
- `todo-cli/pm/actors/bendusz.json` — one actor's working position (solo = a team of one).
- `todo-cli/pm/log.md` — the recovery logbook (a mid-run snapshot).
- `todo-cli/pm/actors/bendusz.HANDOFF.md` — an end-of-session handoff (`/pm-skill:handoff`): terse, agent-to-agent,
  pointers over prose.

In a real run these live in *your* project: `pm/` is git-tracked (the durable resume point,
committed alongside the work), while `tmp/` holds only ephemeral scratch and is gitignored.
