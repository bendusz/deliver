# S3-5: Merge busy blocks on the scheduling page
<!-- pm-meta: {"builder":"expert-builder","touches":["src","test"]} -->
Sprint: 3 · Priority: med · Covers: FR-121 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Show each person's busy time as the fewest possible blocks and compute how much of their working day is free.

## Context (self-contained)
Node 20, ESM, no dependencies. Source under `src/`, tests under `test/` run with `node --test test/`.
`src/calendar.mjs` holds calendar helpers. A block is a two-element array `[start, end]` of integer minutes since midnight, covering `start` up to but not including `end`, with `start < end`. Blocks arrive unsorted from several calendars and may overlap.

## Acceptance criteria (testable)
- [ ] `mergeBlocks(blocks)` returns the union of the blocks as non-overlapping blocks sorted by start. Blocks that overlap, or that touch because one ends exactly where the next starts, become a single block.
- [ ] `mergeBlocks` does not modify its input.
- [ ] `freeMinutes(blocks, dayStart, dayEnd)` returns the number of minutes between `dayStart` and `dayEnd` that no block covers; blocks partly outside the day count only for the part inside it.

## Out of scope
- Time zones and blocks that cross midnight.

## Verification
- Prove done with: `node --test test/`
