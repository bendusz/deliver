# S1-54: Copy client metadata into an isolated dictionary
<!-- pm-meta: {"builder":"codex-builder","touches":["src","test"]} -->
Sprint: 1 · Priority: med · Covers: FR-054 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Copy client metadata into an isolated dictionary.

## Context (self-contained)
Node 20 or later, ESM, no dependencies. `src/feature.mjs` contains the domain helpers. Tests live in `test/`.
Input is a parsed JSON object with arbitrary own enumerable string keys and JSON values. Nested values are retained by reference and are never recursively merged.

## Acceptance criteria (testable)
- [ ] `metadataDictionary(input)` returns a new null-prototype dictionary containing every own key and value, including __proto__, constructor, and prototype.
- [ ] Do not copy inherited keys or alter Object.prototype, input, or nested values.

## Out of scope
- Inputs and integrations outside the contracts above.

## Verification
- Prove done with: `node --test test/*.test.mjs`

## Verification evidence

## Execution
