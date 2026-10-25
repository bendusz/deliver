# S5-2: Serialize journal appends
<!-- pm-meta: {"builder":"expert-builder","touches":["src","test"]} -->
Sprint: 5 · Priority: med · Covers: FR-108 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Make concurrent request handlers append to the audit journal one at a time, in the order they asked, so entries never interleave.

## Context (self-contained)
Node 20, ESM, no dependencies. Source under `src/`, tests under `test/` run with `node --test test/`.
`src/journal.mjs` holds `formatEntry(entry)`. The production `appendLine` is an async function that writes one line to the journal file; it sometimes rejects (disk full, rotation in progress), and the handler that asked then returns a 503 while other handlers carry on.

## Acceptance criteria (testable)
- [ ] `serialize(fn)` returns a function that passes its arguments to `fn` and returns a promise of that call's own result.
- [ ] Calls run one at a time: a call does not start until every earlier call has settled, and calls start in the order they were made.
- [ ] A call that rejects rejects only its own promise; later calls still run and settle with their own results.

## Out of scope
- Batching several entries into one write.

## Verification
- Prove done with: `node --test test/`
