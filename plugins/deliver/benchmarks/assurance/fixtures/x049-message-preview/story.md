# S1-49: Truncate message previews by Unicode code point
<!-- pm-meta: {"builder":"codex-builder","touches":["src","test"]} -->
Sprint: 1 · Priority: med · Covers: FR-049 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Truncate message previews by Unicode code point.

## Context (self-contained)
Node 20 or later, ESM, no dependencies. `src/feature.mjs` contains the domain helpers. Tests live in `test/`.
Value is a well-formed Unicode string. Limit is a nonnegative integer number of code points; grapheme-cluster handling is outside scope.

## Acceptance criteria (testable)
- [ ] `previewText(value, limit)` returns the first limit Unicode code points or the entire string if shorter.
- [ ] Never split a surrogate pair. Limit zero and empty input return the empty string.

## Out of scope
- Inputs and integrations outside the contracts above.

## Verification
- Prove done with: `node --test test/*.test.mjs`

## Verification evidence

## Execution
