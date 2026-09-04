# Documentation and ship messages

`technical-writer` writes docs only, never source, tests, or config. Load the boundary work below at
a sprint or project boundary, never per story. The message format at the end applies to every ship.

- Once a sprint's stories are merged, you may dispatch `technical-writer` to refresh the user-facing
  docs: README sections, usage docs, and the CHANGELOG entry. Name `docs/plan.md`, this sprint's
  story paths, and a log excerpt you write to `tmp/technical-writer/<sprint>.md`. Never point it at
  the whole of `pm/log.md` or at earlier sprints' stories.
- At project end, with a wiki, run `librarian lint` and give the writer `docs/wiki/index.md` and the
  list of shipped stories, per `knowledge.md`. Then have it produce `docs/completion-report.md` from
  `${CLAUDE_PLUGIN_ROOT}/templates/completion-report.md.template`.
- When a technical-writing standard skill is installed, `poteto:technical-writing` for example, pass
  its `SKILL.md` path in the dispatch so the writer applies it.
- Log that the writer ran, or that you skipped it. Never skip silently.

## Merge and PR message format
Title `type(scope): subject`, imperative, no trailing period. Body sections in this order, dropping
any that are empty: `## Why` (intent and why this approach), `## Scope` (facts from the diff, real
paths and symbols, what is in and out), `## Tradeoffs` (real choices only), `## Blast radius` (who
and what the change touches, and why it is safe or risky), `## Verification` (every command and its
result). No `## Summary` or `## Test plan` boilerplate.
