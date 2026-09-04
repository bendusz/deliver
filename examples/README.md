# Worked example: `todo-cli`

An illustrative walkthrough of what `pm-skill` produces for a small project, "a CLI to add and list
todos". These files are not executed. They show the shape of the artifacts the PM writes into a real
project:

- `todo-cli/docs/plan.md`, the signed-off delivery plan.
- `todo-cli/docs/stories/`, two self-contained story files.
- `todo-cli/AGENTS.md`, the generated project instructions, facts only, and `todo-cli/CLAUDE.md`,
  the two-line `@AGENTS.md` bridge Claude Code reads.
- `todo-cli/pm/pm-state.json`, the shared machine-readable state.
- `todo-cli/pm/actors/bendusz.json`, one actor's working position. Solo is a team of one. Its bare
  actor id predates 0.10.1, and `/pm-skill:resume` would migrate it to the current salted form.
- `todo-cli/pm/log.md`, the recovery logbook, as a mid-run snapshot. Its entries predate the current
  log line format and are kept verbatim, the way a real project's history would be.
- `todo-cli/pm/actors/bendusz.HANDOFF.md`, an end-of-session handoff from `/pm-skill:handoff`:
  terse, agent-to-agent, pointers over prose.
- `todo-cli/docs/wiki/`, the project wiki the `librarian` maintains: an index, the schema, and
  three pages.
- `todo-cli/todo-cli.sdd`, `todo-cli/todo.sdd`, and `todo-cli/.specdd/bootstrap.md`, the SpecDD
  skeleton `spec-architect` writes: the root spec, the one module spec, and the bootstrap.

In a real run these live in *your* project. `pm/` is git-tracked, the durable resume point committed
alongside the work, while `tmp/` holds only ephemeral scratch and is gitignored.
