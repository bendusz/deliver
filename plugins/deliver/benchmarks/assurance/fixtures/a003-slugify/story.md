# S1-3: Slugs for task titles
<!-- pm-meta: {"builder":"expert-builder","touches":["src","test"]} -->
Sprint: 1 · Priority: med · Covers: FR-001 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Give every task title a URL-safe slug.

## Context (self-contained)
Node 20, ESM, no dependencies. Source under `src/`, tests under `test/` run with `node --test test/`.
`src/text.mjs` holds the text helpers.

## Acceptance criteria (testable)
- [ ] `slugify(title)` lowercases the title and replaces each run of characters outside `a-z` and `0-9` with one `-`.
- [ ] The slug has no leading or trailing `-`, and a title with no letters or digits gives `''`.

## Out of scope
- Anything not named above.

## Verification
- Prove done with: `node --test test/`
