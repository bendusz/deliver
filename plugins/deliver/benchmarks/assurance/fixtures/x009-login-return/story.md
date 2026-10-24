# S1-9: Validate post-login return locations
<!-- pm-meta: {"builder":"codex-builder","touches":["src","test"]} -->
Sprint: 1 · Priority: med · Covers: FR-009 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Validate post-login return locations.

## Context (self-contained)
Node 20 or later, ESM, no dependencies. `src/feature.mjs` contains the domain helpers. Tests live in `test/`.
Input is an already decoded string supplied as a login return target. The browser treats //host as a network-path URL.

## Acceptance criteria (testable)
- [ ] `redirectTarget(input)` accepts only paths beginning with one slash, without backslash, CR, or LF anywhere.
- [ ] All other targets return /home; accepted paths preserve their query and fragment.

## Out of scope
- Inputs and integrations outside the contracts above.

## Verification
- Prove done with: `node --test test/*.test.mjs`

## Verification evidence

## Execution
