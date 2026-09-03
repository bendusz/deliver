---
description: Create or update the project's governing principles and non-negotiable delivery rules (docs/constitution.md).
---

Use the `project-manager` skill to create or update `docs/constitution.md`. It holds **only** rules
specific to this project. The skill's hard rules already cover sign-off, the separate reviewer, the
deterministic gates, the `pm-verifier` PASS gate, scope freeze, repository safety, and requirement
traceability, so never copy them in.

Input: $ARGUMENTS

Do this:
- If `docs/constitution.md` does **not** exist, create it from
  `${CLAUDE_PLUGIN_ROOT}/templates/constitution.md.template`.
- If it exists, update it in place. Never blind-overwrite; show a diff for substantive changes.
- If `$ARGUMENTS` is given, fold those principles and rules into the right sections and delete the
  sections this project has nothing to say about.
- If `$ARGUMENTS` is empty, ask the user for the constraints that are particular to this project:
  its principles, engineering and testing standards, security and privacy requirements, and product
  constraints. If they have none, write "No additional project-specific rules." under the heading
  and stop. Do not fill the file with the skill's own defaults.
- Append a one-line entry to `pm/log.md` and set `constitution` in `pm/pm-state.json` (if state exists).

Keep it short and enforceable. `/pm-skill:analyze` checks the plan and stories against it.
