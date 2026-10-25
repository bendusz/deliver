# S2-2: Parse bank statement CSV lines
<!-- pm-meta: {"builder":"expert-builder","touches":["src","test"]} -->
Sprint: 2 · Priority: med · Covers: FR-105 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Import bank statements exported as CSV so transactions can be matched to invoices by their description.

## Context (self-contained)
Node 20, ESM, no dependencies. Source under `src/`, tests under `test/` run with `node --test test/`.
`src/statements.mjs` exports `HEADER`. Banks export RFC 4180 CSV: fields separated by commas; a field may be wrapped in double quotes, inside which commas are literal and a doubled quote `""` stands for one `"`. Merchant names often contain both commas and quotes (`"Coffee ""Bean"" Co, Ltd"`). No field spans lines.

## Acceptance criteria (testable)
- [ ] `parseCsvLine(line)` returns the line's fields as strings, with the surrounding quotes of quoted fields removed, commas inside quotes kept, and each `""` inside quotes turned into one `"`.
- [ ] Empty fields are returned as `''`, including a trailing one after a final comma.
- [ ] `parseStatement(text)` skips the header line and blank lines and returns `{ date, description, amount }` per remaining line, all as the raw field strings.

## Out of scope
- Fields spanning several lines.

## Verification
- Prove done with: `node --test test/`
