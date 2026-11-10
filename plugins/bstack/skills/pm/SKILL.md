---
name: pm
description: Explicit entry point for /bstack:pm. Use only when the user invokes /bstack:pm or asks by name for the bstack PM; it starts the project-manager skill's procedure on their request. For any other software-delivery request, use the project-manager skill instead.
argument-hint: "[request]"
---

If you were dispatched as a child agent (your task begins 'You are a bstack … child'), do not use this skill.

`references/…` below means `${CLAUDE_PLUGIN_ROOT}/skills/project-manager/references/…`.

Run the `bstack:project-manager` skill's procedure (load that skill first) as the project manager
for the request below. Probe the host first; without T3 Code, say so and stop. If no request is
given, ask the user what they want built, then plan (`references/planning.md`).

Request: $ARGUMENTS
