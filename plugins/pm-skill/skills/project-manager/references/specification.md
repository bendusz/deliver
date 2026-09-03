# Specification

Capture what the customer needs and why, as a durable product spec, before any technical plan.
`/pm-skill:specify` drives it, and `/pm-skill:clarify` resolves ambiguity.

## When to create or update
- After discovery has agreed the problem and direction, write `docs/spec.md` from
  `${CLAUDE_PLUGIN_ROOT}/templates/spec.md.template`.
- If `docs/spec.md` exists, update it in place: refine and extend, and never blind-overwrite.

## Spec against plan
- The spec, `docs/spec.md`, is product intent: user stories, requirements, acceptance criteria, and
  success metrics. No architecture, no stack, no how.
- The plan, `docs/plan.md`, is the technical delivery design that derives from the spec and traces
  back to its IDs. Keep them separate, because the spec outlives any one plan.

## ID conventions (stable)
- `US-001` user story · `FR-001` functional requirement · `AC-001` acceptance criterion ·
  `SM-001` success metric.
- Traceability covers `FR-` and `AC-`. These testable requirements are what a story `Covers:` and
  what `/pm-skill:analyze` checks. `US-` entries give narrative context, and `SM-` entries are
  outcome metrics, often non-buildable, so tie one to a story only where that story genuinely owns
  the metric.
- **Never** renumber an existing ID. The plan and the stories trace to them.

## Acceptance criteria style
Prefer EARS for behavioural criteria, `WHEN <condition or event>, THE SYSTEM SHALL <expected
behaviour>`, which keeps them observable and directly testable. Use a plain measurable statement for
non-event criteria. Sharper criteria make `test-engineer` and `pm-verifier` more reliable.

## Handling `[NEEDS CLARIFICATION]`
- Mark every unknown inline as `[NEEDS CLARIFICATION: <question>]` instead of guessing. Carried
  ambiguity is the most common cause of a wrong build.
- Resolve them with `/pm-skill:clarify`: one question at a time, 5 at most, each high-impact, with 2
  or 3 options, a recommendation, and why it matters. Each answer updates the spec and clears its
  marker.

## Protect your context
For heavy reading, dispatch a read-only subagent with a tight question and take back a short summary:
`researcher` for prior art and external docs, whose findings land under `docs/research/`, and
`codebase-analyst` for an existing codebase. Do not read large sources into your own context.

## Exit gate
The spec has no blocking `[NEEDS CLARIFICATION]` before planning begins. A non-blocking unknown may
be carried as an explicit assumption or risk; decide that with the user.

## Output
- `docs/spec.md`.
- Optionally `docs/checklists/spec-quality.md` from
  `${CLAUDE_PLUGIN_ROOT}/templates/checklist-spec-quality.md.template`.
- A one-line `pm/log.md` entry, and `spec` set in `pm/pm-state.json`.

Then run `/pm-skill:clarify` if markers remain, otherwise load `planning-and-signoff.md`.
