# S4-2: Shareable search URLs
<!-- pm-meta: {"builder":"expert-builder","touches":["src","test"]} -->
Sprint: 4 · Priority: med · Covers: FR-107 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Encode the search page's filters in the URL so searches can be bookmarked and shared, and so the CDN can cache them.

## Context (self-contained)
Node 20, ESM, no dependencies. Source under `src/`, tests under `test/` run with `node --test test/`.
`src/urls.mjs` exports `SEARCH_PATH`. Filter values are strings, numbers, or arrays of them (several selected tags). The search backend reads repeated keys (`tag=a&tag=b`) as a list, and reads `tag=a,b` as the single tag `a,b`.

## Acceptance criteria (testable)
- [ ] `toQueryString(params)` returns `''` when no value is set, else `?` followed by `key=value` pairs joined by `&`, with keys in sorted order and keys and values percent-encoded with `encodeURIComponent`.
- [ ] `undefined` and `null` values are skipped; an array value repeats its key once per element, in array order.
- [ ] `searchUrl(params)` is `SEARCH_PATH` followed by `toQueryString(params)`.
- [ ] Tests in `test/` pin the exact output for arrays, encoding and skipped values.

## Out of scope
- Parsing query strings.

## Verification
- Prove done with: `node --test test/`
