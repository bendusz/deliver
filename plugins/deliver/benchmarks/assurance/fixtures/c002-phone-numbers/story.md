# S3-1: Normalize customer phone numbers
<!-- pm-meta: {"builder":"expert-builder","touches":["src","test"]} -->
Sprint: 3 · Priority: med · Covers: FR-101 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Store customer phone numbers in E.164 form so the SMS provider accepts them and duplicates can be spotted.

## Context (self-contained)
Node 20, ESM, no dependencies. Source under `src/`, tests under `test/` run with `node --test test/`.
`src/customers.mjs` holds customer profile helpers. Numbers are typed by customers in any common format. Supported countries and calling codes: BE 32, DE 49, GB 44, NL 31; in all four a national number starts with a single trunk `0`.

## Acceptance criteria (testable)
- [ ] `toE164(input, country)` ignores spaces, `-`, `.`, `(` and `)` in `input`.
- [ ] A number starting with `+` or `00` followed by a non-zero digit is international and is returned as `+` and its digits.
- [ ] A number starting with a single `0` followed by a non-zero digit is national: the `0` is dropped and `+` and the country's calling code are prefixed.
- [ ] It returns `null` for anything else, including any other character, and when the result does not have 8 to 15 digits after the `+`.
- [ ] It throws an `Error` for a country outside the supported list.

## Out of scope
- Validating numbers against per-country numbering plans.

## Verification
- Prove done with: `node --test test/`
