---
name: resume
description: Resume a PM-managed project from git, the approval record, the story Execution blocks and the decision log, then continue.
---

If you were dispatched as a child agent (your task begins 'You are a bstack … child'), do not use this skill.

`references/…` below means `${CLAUDE_PLUGIN_ROOT}/skills/project-manager/references/…`, and
`<plugin>` in any reference means `${CLAUDE_PLUGIN_ROOT}`. Neither is a shell variable: write the
path out in every command.

Run the `bstack:project-manager` skill's procedure (load that skill first) to resume this project.
Probe the host first; without T3 Code, say so and stop. Then load `references/state.md` and follow
`## Resume`: read `docs/handoff.md` if present, then the approval record, the integration branch's first-parent history, every
story's `pm-exec`, the worktree list, each recorded thread that is not merged, and the last ~20
lines of `docs/log.md`, in that order.
Git and the `pm-exec` lines win over the log.

Summarise where things stand in a few lines: the approval status, the sprint, each claimed story
with its `status`, `rounds`, thread, branch and worktree, any `Tests:` line, any blocker, and the
next step. Present a blocked story to the user before anything else, except one with a
`Replaced by:` line: that is history, not a blocker. Then continue from each story's `status` as
`## Resume` says.

If `docs/approval.json` is absent, the project has not been planned: say so and start planning
(`references/planning.md`).
