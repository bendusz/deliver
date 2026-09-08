# Worked example: `todo-cli`

An illustrative walkthrough of what `deliver` produces for a small project, "a CLI to add and list
todos". These files are not executed. They show the shape of the artifacts the PM writes into a real
project:

- `todo-cli/docs/plan.md`, the signed-off delivery plan.
- `todo-cli/docs/stories/`, two self-contained story files.
- `todo-cli/AGENTS.md`, the generated project instructions, facts only, and `todo-cli/CLAUDE.md`,
  the two-line `@AGENTS.md` bridge Claude Code reads.
- `todo-cli/docs/approval.json`, the approval marker the hooks and the Codex runner read.
- The `## Execution` block at the end of each story: S1-1 merged, S1-2 mid-review with one fix
  round spent. Solo is a team of one. The bare owner id `bendusz` predates 0.10.1; a current
  project carries the salted form the `actor-id` command prints.
- `todo-cli/docs/handoff/bendusz.md`, an end-of-session handoff from `/deliver:handoff`: terse,
  agent-to-agent, pointers over prose, current only while `HEAD` is its `BASE_COMMIT`.
- `todo-cli/docs/wiki/`, the project wiki the `librarian` maintains: an index, the schema, and
  three pages.
- `todo-cli/todo-cli.sdd`, `todo-cli/todo.sdd`, and `todo-cli/.specdd/bootstrap.md`, the SpecDD
  skeleton `spec-architect` writes: the root spec, the one module spec, and the bootstrap.

In a real run these live in *your* project. Everything under `docs/` is git-tracked and committed
alongside the work; the branches and merge commits carry the rest, while `tmp/` holds only
ephemeral scratch and is gitignored.
