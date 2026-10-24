# S1-60: Seek the first event at or after a timestamp
<!-- pm-meta: {"builder":"codex-builder","touches":["src","test"]} -->
Sprint: 1 · Priority: med · Covers: FR-060 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Seek the first event at or after a timestamp.

## Context (self-contained)
Node 20 or later, ESM, no dependencies. `src/feature.mjs` contains the domain helpers. Tests live in `test/`.
Events are sorted by nondecreasing finite numeric at values; duplicates are permitted. Target is finite. Archives may contain millions of events.

## Acceptance criteria (testable)
- [ ] `seekEvent(events, target)` returns the index of the first event with at >= target, or events.length if none.
- [ ] Use O(log n) timestamp reads and O(1) auxiliary space. Empty input returns zero.

## Out of scope
- Inputs and integrations outside the contracts above.

## Verification
- Prove done with: `node --test test/*.test.mjs`

## Verification evidence

## Execution
