# S1-55: Format issue summaries with optional tracker links
<!-- pm-meta: {"builder":"codex-builder","touches":["src","test"]} -->
Sprint: 1 · Priority: med · Covers: FR-055 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Format issue summaries with optional tracker links.

## Context (self-contained)
Node 20 or later, ESM, no dependencies. `src/feature.mjs` contains the domain helpers. Tests live in `test/`.
Issues have id and title well-formed Unicode strings without line breaks. Base URL is a caller supplied trusted HTTPS URL ending in slash. Output is plain text.

## Acceptance criteria (testable)
- [ ] `issueSummary(issue, options)` emits id: title by default.
- [ ] With link true, append LF then baseUrl plus encodeURIComponent(id). Default baseUrl is https://tracker.example/issues/. With link false emit no URL.

## Out of scope
- Inputs and integrations outside the contracts above.

## Verification
- Prove done with: `node --test test/*.test.mjs`

## Verification evidence

## Execution
