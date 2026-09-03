---
description: Capture a product specification (docs/spec.md) with user stories, requirements, and acceptance criteria, before any plan.
---

Use the `project-manager` skill, specification phase, to capture what the user needs and why as
`docs/spec.md`. Load `references/specification.md` and follow it.

Request: $ARGUMENTS

Do this:
- If `docs/spec.md` does **not** exist, create it from
  `${CLAUDE_PLUGIN_ROOT}/templates/spec.md.template`.
- If it already exists, update it in place: refine and extend, never blind-overwrite, and show a diff
  for substantive changes.
- Capture product intent: overview, user stories (`US-…`), functional requirements (`FR-…`),
  acceptance criteria (`AC-…`), edge cases, success metrics (`SM-…`), and assumptions.
- Mark every unknown inline as `[NEEDS CLARIFICATION: <question>]`. Do not guess.
- Stay on product intent, what and why, not how. Do **not** design architecture, do **not** create
  `docs/plan.md`, and do **not** write implementation code.
- Append a one-line entry to `pm/log.md` and set `spec` in `pm/pm-state.json` if state exists.

End by telling the user whether any `[NEEDS CLARIFICATION]` remain. If so, recommend
`/pm-skill:clarify` before planning; if not, the spec is ready for planning via `/pm-skill:pm`.
