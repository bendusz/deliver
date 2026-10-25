# S3-6: Fit push notification text into the byte budget
<!-- pm-meta: {"builder":"expert-builder","touches":["src","test"]} -->
Sprint: 3 · Priority: med · Covers: FR-126 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Shorten push notification bodies so the push provider never rejects them for size, while keeping as much of the message as fits.

## Context (self-contained)
Node 20, ESM, no dependencies. Source under `src/`, tests under `test/` run with `node --test test/`.
`src/payload.mjs` exports `MAX_BODY_BYTES`. The provider limits the body's UTF-8 encoding, in bytes; it rejects anything longer. Messages are user-written chat text in many languages, with accented letters, CJK and emoji common.

## Acceptance criteria (testable)
- [ ] `truncateUtf8(text, maxBytes)` returns `text` unchanged when its UTF-8 encoding is at most `maxBytes` bytes.
- [ ] Otherwise it returns the longest prefix of `text` that, followed by `…` (3 bytes), is at most `maxBytes` bytes, plus that `…`; it never splits a code point.
- [ ] It throws a `RangeError` when `maxBytes` is less than 3.

## Out of scope
- Keeping grapheme clusters (emoji sequences, combining marks) together.

## Verification
- Prove done with: `node --test test/`
