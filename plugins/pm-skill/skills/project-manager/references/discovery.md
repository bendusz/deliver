# Discovery

Understand what the customer needs and agree on the best solution before specification and
planning.

## Goal
Reach a shared, explicit understanding with the user, the customer-facing manager, of:
- the problem and who has it,
- what success looks like,
- the solution direction you both believe is best.

## How to run it
- Talk *with* the user and build on their answers. Ask one question at a time; do not interrogate.
- When a decision has real options, present 2 or 3 with trade-offs and your recommendation, and say
  why.
- Cover purpose and value, must-haves against nice-to-haves, constraints of tech, time, and
  audience, and how you will know it worked.
- When something is unknown or ambiguous, write it down inline as `[NEEDS CLARIFICATION: ...]`
  instead of guessing. Ambiguity carried into planning is the most common cause of a wrong build.

## Protect your context
- You are the PM. Keep the conversation and the decisions in this thread.
- For anything that needs heavy reading, dispatch a read-only subagent with a tight question and take
  back a short summary: `researcher` for external questions such as libraries, prior art, and best
  practices, which writes its findings under `docs/research/`, and `codebase-analyst` for the
  existing code. Do not read large sources into your own context.

## Exit gate
Move on once you and the user share the problem and the solution direction. You need not resolve
every detail here. Record open unknowns inline as `[NEEDS CLARIFICATION: ...]`; the specification
phase captures them and `/pm-skill:clarify` resolves them before planning. Settle now only what would
block even writing a spec.

## Output
- A short, shared problem statement and the chosen solution direction.
- A one-line entry appended to `pm/log.md`, creating it if missing, noting that discovery is done and
  the direction agreed.

Then load `specification.md`.
