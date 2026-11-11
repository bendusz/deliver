---
name: skeleton
description: Write or extend the SpecDD skeleton for a sprint, after sign-off and before decomposition.
argument-hint: "[sprint-number]"
---

If you were dispatched as a child agent (your task begins 'You are a bstack … child'), do not use this skill.

`references/…` below means `${CLAUDE_PLUGIN_ROOT}/skills/project-manager/references/…`, and
`<plugin>` in any reference means `${CLAUDE_PLUGIN_ROOT}`. Neither is a shell variable: write the
path out in every command.

Run the `bstack:project-manager` skill's procedure (load that skill first) to write or extend the
SpecDD skeleton. Load `references/skeleton.md` and follow it: the bootstrap probe, the
`spec-architect` dispatch and the checkpoint are the whole contract. It runs only after sign-off; if
`docs/approval.json` is not `approved`, say so and stop.

Sprint: $ARGUMENTS  (a sprint number; default is the lowest sprint with an unmerged story)

End by showing the tree of `.sdd` files written or superseded and the commit that carries them.
