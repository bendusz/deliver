# S6-4: Order the support queue
<!-- pm-meta: {"builder":"expert-builder","touches":["src","test"]} -->
Sprint: 6 · Priority: med · Covers: FR-119 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Show agents the support queue in the order they should work it.

## Context (self-contained)
Node 20, ESM, no dependencies. Source under `src/`, tests under `test/` run with `node --test test/`.
`src/tickets.mjs` exports `PRIORITIES`, highest first. Tickets are `{ id, priority, createdAt }`, with `createdAt` an ISO-8601 UTC string such as `2024-05-01T09:30:00.000Z`. Agents work the highest priority first and, within one priority, the ticket that has waited longest.

## Acceptance criteria (testable)
- [ ] `queueOrder(tickets)` returns a new array sorted by priority (in `PRIORITIES` order) and, within a priority, oldest `createdAt` first.
- [ ] The input array is not reordered.
- [ ] Tests in `test/` cover both sort keys and the input staying untouched.

## Out of scope
- SLA timers and assignment.

## Verification
- Prove done with: `node --test test/`
