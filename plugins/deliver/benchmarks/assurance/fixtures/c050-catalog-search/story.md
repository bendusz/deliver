# S6-10: Filter the product catalog
<!-- pm-meta: {"builder":"expert-builder","touches":["src","test"]} -->
Sprint: 6 · Priority: med · Covers: FR-149 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Back the shop's search box and filter sidebar with one function that applies every filter the shopper set.

## Context (self-contained)
Node 20, ESM, no dependencies. Source under `src/`, tests under `test/` run with `node --test test/`.
`src/catalog.mjs` holds catalog helpers, including the comparator `byName`. Products are `{ sku, name, priceCents, stock, tags }`. Every filter in the query is optional; an absent filter does not restrict the results.

## Acceptance criteria (testable)
- [ ] `searchProducts(products, query)` returns the products that match every filter given in `query`, sorted by name with `byName`.
- [ ] `q` matches products whose name contains it, ignoring case and surrounding spaces.
- [ ] `minPrice` and `maxPrice` are inclusive bounds on `priceCents`.
- [ ] `inStock: true` keeps only products with `stock > 0`.
- [ ] The input array is not reordered.

## Out of scope
- Tag filters and relevance ranking.

## Verification
- Prove done with: `node --test test/`
