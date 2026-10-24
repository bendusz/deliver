# S1-41: Keep parser causes when decoding messages
<!-- pm-meta: {"builder":"codex-builder","touches":["src","test"]} -->
Sprint: 1 · Priority: med · Covers: FR-041 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Keep parser causes when decoding messages.

## Context (self-contained)
Node 20 or later, ESM, no dependencies. `src/feature.mjs` contains the domain helpers. Tests live in `test/`.
Parse is an injected synchronous parser, defaulting to JSON.parse. It may throw any Error subtype.

## Acceptance criteria (testable)
- [ ] `decodeEnvelope(text, parse)` returns the parser result on success.
- [ ] On parsing failure throw a new Error with message Cannot decode message envelope and cause equal to the original error object.

## Out of scope
- Inputs and integrations outside the contracts above.

## Verification
- Prove done with: `node --test test/*.test.mjs`

## Verification evidence

## Execution
