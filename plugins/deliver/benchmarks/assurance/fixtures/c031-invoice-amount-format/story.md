# S2-7: Locale-aware amount formatting
<!-- pm-meta: {"builder":"expert-builder","touches":["src","test"]} -->
Sprint: 2 · Priority: med · Covers: FR-130 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Print amounts on invoices and reports in the customer's number format, independent of the server's locale settings.

## Context (self-contained)
Node 20, ESM, no dependencies. Source under `src/`, tests under `test/` run with `node --test test/`.
`src/locale.mjs` exports `SEPARATORS`, the group and decimal separators for each supported locale (`en`, `nl`, `fr`). Amounts are integer cents and can be negative (credit notes) or very large (annual reports).

## Acceptance criteria (testable)
- [ ] `formatAmount(cents, locale = 'en')` returns the amount with exactly two decimals, the locale's decimal separator, and the whole part grouped in threes with the locale's group separator (`123456789` cents in `nl` is `1.234.567,89`).
- [ ] Negative amounts get a leading `-`; zero, including `-0`, has none.
- [ ] It throws a `RangeError` unless `cents` is a safe integer, and an `Error` for an unsupported locale.

## Out of scope
- Currency symbols.

## Verification
- Prove done with: `node --test test/`
