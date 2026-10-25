# S3-11: VAT totals on invoices
<!-- pm-meta: {"builder":"expert-builder","touches":["src","test"]} -->
Sprint: 3 · Priority: med · Covers: FR-151 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Print subtotal, VAT and total on customer invoices, computed the way the tax authority audits them.

## Context (self-contained)
Node 20, ESM, no dependencies. Source under `src/`, tests under `test/` run with `node --test test/`.
`src/invoice.mjs` exports `lineSubtotal(line)`. Lines are `{ description, quantity, unitCents }` with positive integer quantities and non-negative integer `unitCents`. The VAT rate is given in basis points (2100 for 21%). Invoicing rules require VAT to be computed once on the invoice subtotal, rounded half up to the cent, never per line and then summed, because per-line rounding drifts on invoices with many lines.

## Acceptance criteria (testable)
- [ ] `invoiceTotals(lines, vatRateBp)` returns `{ subtotalCents, vatCents, totalCents }`.
- [ ] `subtotalCents` is the sum of `lineSubtotal` over the lines; `vatCents` is `subtotalCents × vatRateBp / 10000` computed on that subtotal and rounded half up to a whole cent; `totalCents` is their sum.
- [ ] An invoice with no lines totals 0 everywhere.

## Out of scope
- Several VAT rates on one invoice.

## Verification
- Prove done with: `node --test test/`
