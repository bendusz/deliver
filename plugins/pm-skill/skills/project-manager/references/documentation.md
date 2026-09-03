# Documentation

Load this at a sprint or project boundary, never per story. `technical-writer` writes docs only,
never source, tests, or config.

- Once a sprint's stories are merged, you may dispatch `technical-writer` to refresh the user-facing
  docs: README sections, usage docs, and the CHANGELOG entry. Give it the plan, the relevant
  `pm/log.md` entries, and the story files.
- At project end, have it produce `docs/completion-report.md` from
  `${CLAUDE_PLUGIN_ROOT}/templates/completion-report.md.template`.
- When a technical-writing standard skill is installed, `poteto:technical-writing` for example, pass
  its `SKILL.md` path in the dispatch so the writer applies it.
- Log that the writer ran, or that you skipped it. Never skip silently.
