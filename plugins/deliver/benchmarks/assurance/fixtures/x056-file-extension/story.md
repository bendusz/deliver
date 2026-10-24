# S1-56: Fix extension extraction for dotted filenames
<!-- pm-meta: {"builder":"codex-builder","touches":["src","test"]} -->
Sprint: 1 · Priority: med · Covers: FR-056 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Fix extension extraction for dotted filenames.

## Context (self-contained)
Node 20 or later, ESM, no dependencies. `src/feature.mjs` contains the domain helpers. Tests live in `test/`.
The old helper uses the first dot and misreads archive.tar.gz. Input is a filename with no directory separators. An initial dot alone does not start an extension.

## Acceptance criteria (testable)
- [ ] `extension(name)` returns text after the last dot, preserving case, or the empty string when no extension exists.
- [ ] A leading dot without a later dot and a trailing dot yield empty string. Add regression assertions for multiple dots and hidden filenames.

## Out of scope
- Inputs and integrations outside the contracts above.

## Verification
- Prove done with: `node --test test/*.test.mjs`

## Verification evidence

## Execution
