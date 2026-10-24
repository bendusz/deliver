# S2-11: LRU cache for rendered thumbnails
<!-- pm-meta: {"builder":"expert-builder","touches":["src","test"]} -->
Sprint: 2 · Priority: med · Covers: FR-150 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Keep recently rendered thumbnails in memory so the media library stops re-rendering the images people are looking at.

## Context (self-contained)
Node 20, ESM, no dependencies. Source under `src/`, tests under `test/` run with `node --test test/`.
`src/thumbnails.mjs` holds `thumbKey(assetId, width)`. The cache must hold at most `capacity` entries; when it is full and a new key arrives, it evicts the entry that was used longest ago. Re-rendering an image replaces its cached value with `set`.

## Acceptance criteria (testable)
- [ ] `new LruCache(capacity)` throws a `RangeError` unless `capacity` is a positive integer.
- [ ] `get(key)` returns the cached value or `undefined`; `set(key, value)` stores the value; `size` is the number of entries.
- [ ] Adding a new key to a full cache evicts the least recently used entry, where both `get` of an existing key and `set` of a new or existing key count as a use.

## Out of scope
- Time-based expiry.

## Verification
- Prove done with: `node --test test/`
