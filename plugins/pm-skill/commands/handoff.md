---
description: End a session by writing pm/actors/<id>.HANDOFF.md so the next agent can resume from recorded state.
---

Use the `project-manager` skill to write an end-of-session handoff.

Fill `${CLAUDE_PLUGIN_ROOT}/templates/HANDOFF.md.template` into `pm/actors/<you>.HANDOFF.md` from
verified repository state (`git status`, the branch, the log), overwriting any previous handoff and
omitting empty sections. Focus: $ARGUMENTS (optional).

Two rules: **log audit**, this session's `pm/log.md` entries must map to real commits, files, or
commands; append a corrective entry for any that do not, and never edit an old entry. **No secrets**,
because `pm/` is tracked; reference locations, never values.

Finish: sync `next`, `handoff_written`, and `updated` in the actor file; append one line to
`pm/log.md`; commit the `pm/` files.
