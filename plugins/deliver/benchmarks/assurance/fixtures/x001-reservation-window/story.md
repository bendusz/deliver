# S1-1: Check room reservation availability
<!-- pm-meta: {"builder":"codex-builder","touches":["src","test"]} -->
Sprint: 1 · Priority: med · Covers: FR-001 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Check room reservation availability.

## Context (self-contained)
Node 20 or later, ESM, no dependencies. `src/feature.mjs` contains the domain helpers. Tests live in `test/`.
Reservations use numeric minute offsets and half-open intervals [start, end). All intervals have start < end.

## Acceptance criteria (testable)
- [ ] `available(bookings, start, end)` returns false exactly when the requested interval overlaps an existing booking.
- [ ] Touching endpoints are available; an empty booking list is available.

## Out of scope
- Inputs and integrations outside the contracts above.

## Verification
- Prove done with: `node --test test/*.test.mjs`

## Verification evidence

## Execution
