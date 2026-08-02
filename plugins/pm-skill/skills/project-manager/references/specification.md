# Specification

Capture **what** the customer needs and **why**, as a durable product spec — before any technical
plan. Driven by `/pm-skill:specify`; ambiguity is resolved by `/pm-skill:clarify`.

## When to create/update
- After discovery has agreed the problem and direction, write `docs/spec.md` from
  `${CLAUDE_PLUGIN_ROOT}/templates/spec.md.template`.
- If `docs/spec.md` exists, update it **in place** — refine and extend; never blind-overwrite.

## Spec vs plan
- The **spec** (`docs/spec.md`) is product intent: user stories, requirements, acceptance criteria,
  success metrics — **no architecture, no stack, no how**.
- The **plan** (`docs/plan.md`) is the technical delivery design that *derives from* the spec and
  traces back to its IDs. Keep them separate — the spec outlives any one plan.

## ID conventions (stable)
- `US-001` user story · `FR-001` functional requirement · `AC-001` acceptance criterion ·
  `SM-001` success metric.
- **Traceability covers `FR-`/`AC-`** — these testable requirements are what a story `Covers:` and what
  `/pm-skill:analyze` checks. `US-` give narrative context; `SM-` are outcome metrics (often
  non-buildable) — tie them to a story only where one genuinely owns the metric.
- **Never renumber** an existing ID — the plan and the stories trace to them.

## Acceptance criteria style
Prefer **EARS** for behavioural criteria — `WHEN <condition/event>, THE SYSTEM SHALL <expected
behaviour>` — which keeps them observable and directly testable; use a plain measurable statement for
non-event criteria. Sharper criteria make `test-engineer` and `pm-verifier` more reliable.

## Handling `[NEEDS CLARIFICATION]`
- Mark every unknown inline as `[NEEDS CLARIFICATION: <question>]` instead of guessing — carried
  ambiguity is the most common cause of a wrong build.
- Resolve them with `/pm-skill:clarify`: one question at a time, **≤5** high-impact, each with 2–3
  options, a recommendation, and why it matters. Each answer updates the spec and clears its marker.

## Protect your context
For heavy reading, dispatch a read-only subagent with a tight question and take back a short
summary — `researcher` for prior art and external docs (findings land under `docs/research/`),
`codebase-analyst` for an existing codebase. Don't read large sources into your own context.

## Exit gate
The spec has **no blocking `[NEEDS CLARIFICATION]`** before planning begins. A non-blocking unknown may
be carried as an explicit assumption/risk — decide that with the user.

## Output
- `docs/spec.md`.
- Optionally `docs/checklists/spec-quality.md` from
  `${CLAUDE_PLUGIN_ROOT}/templates/checklist-spec-quality.md.template`.
- A one-line `pm/log.md` entry; set `spec` in `pm/pm-state.json`.

Then run `/pm-skill:clarify` if markers remain, otherwise load `planning-and-signoff.md`.
