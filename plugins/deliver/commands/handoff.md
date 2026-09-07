---
description: End a session by writing docs/handoff/<actor-id>.md so the next agent can resume from git and the story files.
---

Use the `project-manager` skill to write an end-of-session handoff.

First commit everything the session produced on the story branch, so `git status --porcelain` is
empty. Then fill `${CLAUDE_PLUGIN_ROOT}/templates/HANDOFF.md.template` into
`docs/handoff/<you>.md` from verified repository state (`git status`, the branch, the story's
Execution block, the last gate results), with `BASE_COMMIT` set to `git rev-parse HEAD`,
overwriting any previous handoff and omitting empty sections. Focus: $ARGUMENTS (optional).

Two rules: **commit audit**, every claim of work done in this session must map to a real commit,
file, or command; correct the Execution notes for any that does not. **No secrets**, because
`docs/` is tracked; reference locations, never values.

Finish: commit the handoff alone, as `chore(handoff): <you>`, so it is the last commit of the
session. It stays current while nothing but the handoff file has changed since `BASE_COMMIT`.
