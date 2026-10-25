# S1-11: Build tenant account listing queries
<!-- pm-meta: {"builder":"codex-builder","touches":["src","test"]} -->
Sprint: 1 · Priority: med · Covers: FR-011 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Build tenant account listing queries.

## Context (self-contained)
Node 20 or later, ESM, no dependencies. `src/feature.mjs` contains the domain helpers. Tests live in `test/`.
Tenant and sort are untrusted strings. The adapter binds ? parameters. Only name and created are supported sort choices.

## Acceptance criteria (testable)
- [ ] `listQuery(tenant, sort)` binds tenant as a parameter and maps name to name, created to created_at.
- [ ] Reject all other sort choices with RangeError before producing SQL.

## Out of scope
- Inputs and integrations outside the contracts above.

## Verification
- Prove done with: `node --test test/*.test.mjs`

## Verification evidence

## Execution
