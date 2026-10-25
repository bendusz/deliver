# S5-1: Parse amounts typed into the expense form
<!-- pm-meta: {"builder":"expert-builder","touches":["src","test"]} -->
Sprint: 5 · Priority: med · Covers: FR-103 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Turn the amount a user types into the expense form into integer cents for storage.

## Context (self-contained)
Node 20, ESM, no dependencies. Source under `src/`, tests under `test/` run with `node --test test/`.
`src/money.mjs` holds `formatCents`. All money in the app is integer cents. Users type amounts such as `12`, `12.5`, `1,234.56` or `-0.29`: an optional leading `-`, digits optionally grouped in threes by commas, and at most two decimals after a `.`.

## Acceptance criteria (testable)
- [ ] `parseAmount(text)` returns the exact number of cents the text denotes for every amount in the format above, ignoring surrounding spaces; `parseAmount('19.99')` is `1999`.
- [ ] It returns `null` for text not in that format, such as `abc`, `1,23`, `1.234` or an empty string.

## Out of scope
- Other currencies' decimal separators.

## Verification
- Prove done with: `node --test test/`
