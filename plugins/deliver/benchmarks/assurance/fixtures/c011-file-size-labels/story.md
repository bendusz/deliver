# S2-3: Human-readable file sizes
<!-- pm-meta: {"builder":"expert-builder","touches":["src","test"]} -->
Sprint: 2 · Priority: med · Covers: FR-110 · Depends on: none · Parallel-safe: yes
Risk: low · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Show file sizes in the file browser as short labels such as `1.5 MB` instead of raw byte counts.

## Context (self-contained)
Node 20, ESM, no dependencies. Source under `src/`, tests under `test/` run with `node --test test/`.
`src/units.mjs` exports `UNITS`, from `B` to `TB`. Sizes use binary multiples (1 KB = 1024 B).

## Acceptance criteria (testable)
- [ ] `formatBytes(bytes)` returns `<n> B` for sizes under 1024.
- [ ] Larger sizes use the largest unit up to `TB` in which the value is at least 1, rounded to one decimal, with a trailing `.0` dropped (`1536` is `1.5 KB`, `2048` is `2 KB`).
- [ ] A value that rounds up to 1024 of a unit is shown in the next unit instead (`1048575` is `1 MB`, not `1024 KB`); beyond `TB` the number simply grows.
- [ ] It throws a `RangeError` unless `bytes` is a non-negative integer.

## Out of scope
- Decimal (1000-based) units.

## Verification
- Prove done with: `node --test test/`
