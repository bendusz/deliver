# S4-11: Normalize post tags
<!-- pm-meta: {"builder":"expert-builder","touches":["src","test"]} -->
Sprint: 4 · Priority: med · Covers: FR-152 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Turn the free-text tag box on the post editor into a clean list of tags.

## Context (self-contained)
Node 20, ESM, no dependencies. Source under `src/`, tests under `test/` run with `node --test test/`.
`src/tags.mjs` exports `MAX_TAGS`. Authors type tags separated by commas, with any casing and spacing. A tag is lowercase ASCII letters, digits and single hyphens, with no leading or trailing hyphen.

## Acceptance criteria (testable)
- [ ] `parseTags(input)` splits on commas and normalises each part: trim, lowercase, runs of whitespace to one `-`, characters outside `a-z`, `0-9`, `-` dropped, runs of `-` collapsed, leading and trailing `-` removed.
- [ ] Parts that are empty after normalising are skipped, and duplicates keep only their first occurrence.
- [ ] A normalised tag longer than 30 characters, or more than `MAX_TAGS` distinct tags, throws a `RangeError`.
- [ ] Tests in `test/` cover every rule above, including the boundaries (30 characters, `MAX_TAGS` tags).

## Out of scope
- Suggesting existing tags.

## Verification
- Prove done with: `node --test test/`
