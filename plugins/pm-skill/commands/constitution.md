---
description: Create or update the project's governing principles and non-negotiable delivery rules (docs/constitution.md).
---

Use the `project-manager` skill to create or update `docs/constitution.md`, the project's own
governing principles, which **complement** the plugin's built-in hard rules and never weaken them.

Input: $ARGUMENTS

Do this:
- If `docs/constitution.md` does **not** exist, create it from
  `${CLAUDE_PLUGIN_ROOT}/templates/constitution.md.template`.
- If it exists, update it in place. Never blind-overwrite; show a diff for substantive changes.
- If `$ARGUMENTS` is given, fold those principles/rules into the right sections.
- If `$ARGUMENTS` is empty, fill the template with sensible defaults drawn from the PM workflow:
  - no implementation before sign-off;
  - requirements must be testable;
  - deterministic gates (test/lint/build, or N/A) must pass;
  - no remote push without an explicit request;
  - the reviewer is never the builder;
  - security-sensitive work gets a security review;
  - every story traces to requirement IDs;
  - `pm-verifier` must return PASS before ship.
- Append a one-line entry to `pm/log.md` and set `constitution` in `pm/pm-state.json` (if state exists).

Keep it short and enforceable. `/pm-skill:analyze` checks the plan and stories against it.
