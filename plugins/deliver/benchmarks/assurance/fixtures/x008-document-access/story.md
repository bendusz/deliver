# S1-8: Authorize tenant document reads
<!-- pm-meta: {"builder":"codex-builder","touches":["src","test"]} -->
Sprint: 1 · Priority: med · Covers: FR-008 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Authorize tenant document reads.

## Context (self-contained)
Node 20 or later, ESM, no dependencies. `src/feature.mjs` contains the domain helpers. Tests live in `test/`.
Authenticated users have id, tenantId, and role. Documents have tenantId and ownerId. Ids are opaque strings.

## Acceptance criteria (testable)
- [ ] `canRead(user, document)` permits owners and admins only within the document tenant.
- [ ] Admins have no privileges in another tenant. Everyone else is denied.

## Out of scope
- Inputs and integrations outside the contracts above.

## Verification
- Prove done with: `node --test test/*.test.mjs`

## Verification evidence

## Execution
