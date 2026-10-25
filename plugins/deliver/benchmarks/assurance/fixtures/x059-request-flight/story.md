# S1-59: Share pending requests and allow later retries
<!-- pm-meta: {"builder":"codex-builder","touches":["src","test"]} -->
Sprint: 1 · Priority: med · Covers: FR-059 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Share pending requests and allow later retries.

## Context (self-contained)
Node 20 or later, ESM, no dependencies. `src/feature.mjs` contains the domain helpers. Tests live in `test/`.
Request is an injected async adapter keyed by string. Only requests currently in progress are shared; completed values are not cached.

## Acceptance criteria (testable)
- [ ] `createFlights(request)` returns get(key), sharing one in-progress request per key across all overlapping callers.
- [ ] Clear the in-progress entry after either success or failure. Later calls invoke request again, and callers retain the original result or error.

## Out of scope
- Inputs and integrations outside the contracts above.

## Verification
- Prove done with: `node --test test/*.test.mjs`

## Verification evidence

## Execution
