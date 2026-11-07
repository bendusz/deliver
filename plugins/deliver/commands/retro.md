---
description: Run the sprint boundary's cross-story review and retrospective, and propose AGENTS.md learnings as a diff.
---

Use the `project-manager` skill to run a sprint retrospective. Load `references/retro.md` and
follow it: the cross-story review, the three questions, the `AGENTS.md` diff and the record are
the whole contract.

Sprint: $ARGUMENTS  (a sprint number; default is the lowest sprint whose stories are all `merged`,
or `blocked` and escalated, with no `docs/retros/sprint-<n>.md` yet)

Precondition: every story of that sprint is `merged`, or `blocked` and escalated, in its
`pm-exec`. Otherwise name the open stories and stop.

End with the review verdict, any fix or check stories for the next sprint, the proposed
`AGENTS.md` diff or "no changes earned", and the path of the retro record. Then report to the user
and wait before decomposing the next sprint, unless the plan says to run on across sprints.
