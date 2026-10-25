# S3-4: Import contacts from JSON Lines
<!-- pm-meta: {"builder":"expert-builder","touches":["src","test"]} -->
Sprint: 3 · Priority: med · Covers: FR-116 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Import contacts from a JSON Lines upload, keeping every good record and telling the user exactly which lines were rejected and why.

## Context (self-contained)
Node 20, ESM, no dependencies. Source under `src/`, tests under `test/` run with `node --test test/`.
`src/import.mjs` exports `REQUIRED`, the keys every contact must carry with a non-empty value. Uploads come from spreadsheets and other tools: lines may end in `\r\n`, files may start with a UTF-8 byte-order mark, and blank lines are common.

## Acceptance criteria (testable)
- [ ] `parseJsonl(text)` returns `{ records, errors }`: every line that holds a JSON object with all `REQUIRED` keys set (not `undefined`, `null` or `''`) is in `records`, in order.
- [ ] Every other non-blank line produces one `{ line, message }` in `errors`, with the 1-based line number, and parsing continues with the next line; blank lines are skipped silently.
- [ ] A leading byte-order mark and `\r\n` line endings are handled.

## Out of scope
- Writing the records to the database.

## Verification
- Prove done with: `node --test test/`
