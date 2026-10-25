# S6-9: Wrap plain-text email bodies
<!-- pm-meta: {"builder":"expert-builder","touches":["src","test"]} -->
Sprint: 6 · Priority: med · Covers: FR-144 · Depends on: none · Parallel-safe: yes
Risk: low · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Re-flow the plain-text part of outgoing emails so mail clients that do not wrap still show readable lines.

## Context (self-contained)
Node 20, ESM, no dependencies. Source under `src/`, tests under `test/` run with `node --test test/`.
`src/format.mjs` holds plain-text formatting helpers such as `indent`. Bodies use `\n` line breaks and plain spaces; no tabs.

## Acceptance criteria (testable)
- [ ] `wrapText(text, width)` breaks lines at spaces so no line is longer than `width`, packing as many words onto each line as fit.
- [ ] Existing line breaks, including blank lines, are kept; runs of spaces between words become one space and lines carry no leading or trailing spaces.
- [ ] A word longer than `width` is never split; it stands alone on its own line.
- [ ] `wrapText` throws a `RangeError` when `width` is not a positive integer.

## Out of scope
- Hyphenation and wide (East Asian) characters.

## Verification
- Prove done with: `node --test test/`
