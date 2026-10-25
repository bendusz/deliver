# S1-46: Group receipts by their recorded local date
<!-- pm-meta: {"builder":"codex-builder","touches":["src","test"]} -->
Sprint: 1 · Priority: med · Covers: FR-046 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Group receipts by their recorded local date.

## Context (self-contained)
Node 20 or later, ESM, no dependencies. `src/feature.mjs` contains the domain helpers. Tests live in `test/`.
Timestamps are valid ISO 8601 strings in YYYY-MM-DDTHH:mm:ssZ or YYYY-MM-DDTHH:mm:ss±HH:mm form, with an explicit offset. Grouping uses the date printed on the receipt.

## Acceptance criteria (testable)
- [ ] `accountingDay(timestamp)` returns the YYYY-MM-DD calendar date in the timestamp own offset, without converting to another timezone.
- [ ] Preserve leading zeros and work on both sides of UTC midnight.

## Out of scope
- Inputs and integrations outside the contracts above.

## Verification
- Prove done with: `node --test test/*.test.mjs`

## Verification evidence

## Execution
