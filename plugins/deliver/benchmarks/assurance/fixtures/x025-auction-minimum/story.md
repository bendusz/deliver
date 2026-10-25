# S1-25: Fix auctions with no bids
<!-- pm-meta: {"builder":"codex-builder","touches":["src","test"]} -->
Sprint: 1 · Priority: med · Covers: FR-025 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Fix auctions with no bids.

## Context (self-contained)
Node 20 or later, ESM, no dependencies. `src/feature.mjs` contains the domain helpers. Tests live in `test/`.
An empty auction currently leaks Infinity into the API. Inputs are arrays of at most 1000 finite nonnegative bid numbers.

## Acceptance criteria (testable)
- [ ] `lowestBid(values)` returns the smallest bid, or null when no bids exist.
- [ ] Add a regression assertion for the empty array using the production helper.

## Out of scope
- Inputs and integrations outside the contracts above.

## Verification
- Prove done with: `node --test test/*.test.mjs`

## Verification evidence

## Execution
