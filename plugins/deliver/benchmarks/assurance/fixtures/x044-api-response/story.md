# S1-44: Reject unsuccessful API responses before decoding
<!-- pm-meta: {"builder":"codex-builder","touches":["src","test"]} -->
Sprint: 1 · Priority: med · Covers: FR-044 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Reject unsuccessful API responses before decoding.

## Context (self-contained)
Node 20 or later, ESM, no dependencies. `src/feature.mjs` contains the domain helpers. Tests live in `test/`.
Response is an injected object with integer status in 100..599 and an async json method. No network calls occur in this helper.

## Acceptance criteria (testable)
- [ ] `readApiResponse(response)` calls json once and returns its result only for statuses 200..299.
- [ ] All other statuses throw an Error with matching status property without calling json. Propagate decoding failures unchanged.

## Out of scope
- Inputs and integrations outside the contracts above.

## Verification
- Prove done with: `node --test test/*.test.mjs`

## Verification evidence

## Execution
