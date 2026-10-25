# S1-27: Publish invoices after durable storage
<!-- pm-meta: {"builder":"codex-builder","touches":["src","test"]} -->
Sprint: 1 · Priority: med · Covers: FR-027 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Publish invoices after durable storage.

## Context (self-contained)
Node 20 or later, ESM, no dependencies. `src/feature.mjs` contains the domain helpers. Tests live in `test/`.
Storage.save and events.publish return promises. Invoice has a string id. A published event may immediately trigger a read from storage.

## Acceptance criteria (testable)
- [ ] `submitInvoice(invoice, storage, events)` saves first, waits for save success, then publishes and waits for publication.
- [ ] Resolve with the invoice id. On save rejection propagate the same error and publish nothing.

## Out of scope
- Inputs and integrations outside the contracts above.

## Verification
- Prove done with: `node --test test/*.test.mjs`

## Verification evidence

## Execution
