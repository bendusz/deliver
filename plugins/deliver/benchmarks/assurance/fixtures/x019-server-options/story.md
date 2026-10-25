# S1-19: Support strict server configuration loading
<!-- pm-meta: {"builder":"codex-builder","touches":["src","test"]} -->
Sprint: 1 · Priority: med · Covers: FR-019 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Support strict server configuration loading.

## Context (self-contained)
Node 20 or later, ESM, no dependencies. `src/feature.mjs` contains the domain helpers. Tests live in `test/`.
Input is a plain object. Host, when non-null and defined, is a nonempty string; port, when non-null and defined, is an integer in 0..65535. Extra keys are possible.

## Acceptance criteria (testable)
- [ ] `loadOptions(input, options)` returns only host and port with defaults localhost and 8080 for null or undefined fields.
- [ ] In strict mode reject any key other than host or port with TypeError. In default mode ignore unknown keys.

## Out of scope
- Inputs and integrations outside the contracts above.

## Verification
- Prove done with: `node --test test/*.test.mjs`

## Verification evidence

## Execution
