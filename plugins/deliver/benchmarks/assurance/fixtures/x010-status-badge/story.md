# S1-10: Render user supplied status labels
<!-- pm-meta: {"builder":"codex-builder","touches":["src","test"]} -->
Sprint: 1 · Priority: med · Covers: FR-010 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Render user supplied status labels.

## Context (self-contained)
Node 20 or later, ESM, no dependencies. `src/feature.mjs` contains the domain helpers. Tests live in `test/`.
Label is an untrusted string inserted into HTML text or a quoted title attribute. Compact is a boolean.

## Acceptance criteria (testable)
- [ ] `renderBadge(label, compact)` emits a span; compact mode uses title plus *, full mode uses the label as text.
- [ ] Both branches encode ampersand, angle brackets, double quote, and single quote as HTML entities.

## Out of scope
- Inputs and integrations outside the contracts above.

## Verification
- Prove done with: `node --test test/*.test.mjs`

## Verification evidence

## Execution
