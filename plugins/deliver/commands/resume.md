---
description: Resume a PM-managed project from git, the approval record, the story Execution blocks and the decision log, then continue.
---

Use the `project-manager` skill to resume work on this project. Probe the host first; without T3
Code, say so and stop. Then load `references/state.md` and follow `## Resume`: read the approval
record, the integration branch's first-parent history, every story's `pm-exec`, the worktree list,
each recorded thread that is not merged, and the last ~20 lines of `docs/log.md`, in that order.
Git and the `pm-exec` lines win over the log.

Summarise where things stand in a few lines: the approval status, the sprint, each claimed story
with its `status`, `rounds`, thread, branch and worktree, any blocker, and the next step. Present
a blocked story to the user before anything else. Then continue from each story's `status` as
`## Resume` says.

If `docs/approval.json` is absent, the project has not been planned: say so and start planning
(`references/planning.md`).
