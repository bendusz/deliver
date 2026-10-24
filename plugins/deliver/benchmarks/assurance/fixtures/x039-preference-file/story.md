# S1-39: Load optional user preference files
<!-- pm-meta: {"builder":"codex-builder","touches":["src","test"]} -->
Sprint: 1 · Priority: med · Covers: FR-039 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Load optional user preference files.

## Context (self-contained)
Node 20 or later, ESM, no dependencies. `src/feature.mjs` contains the domain helpers. Tests live in `test/`.
Read is an injected async adapter returning JSON text or rejecting with an Error. A missing file is optional; other read and parse failures require attention.

## Acceptance criteria (testable)
- [ ] `readPreferences(read)` parses and returns the file value.
- [ ] Return {theme: system} only for errors with code ENOENT. Propagate all other errors unchanged, including malformed JSON.

## Out of scope
- Inputs and integrations outside the contracts above.

## Verification
- Prove done with: `node --test test/*.test.mjs`

## Verification evidence

## Execution
