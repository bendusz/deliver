---
description: Run the sprint checkpoint's bounded cross-story review and retrospective, and propose AGENTS.md learnings as a diff.
---

Use the `project-manager` skill to run a sprint retrospective. Load `references/retrospective.md`
and follow it: the sprint review, the three questions, and the record are the whole contract.

Sprint: $ARGUMENTS  (a sprint number; default is the lowest sprint that
`node "${CLAUDE_PLUGIN_ROOT}/hooks/lib.mjs" state .` lists under `sprints_without_retro`, or the most
recently completed sprint when that list is empty)

Precondition: every story of that sprint has `status: merged` in its Execution block. Otherwise say
which are open and stop.

End with the review verdict, the proposed `AGENTS.md` diff or "no changes earned", and the path of
the retro record.
