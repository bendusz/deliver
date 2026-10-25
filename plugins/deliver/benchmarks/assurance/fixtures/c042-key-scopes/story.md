# S3-9: Scope checks for API keys
<!-- pm-meta: {"builder":"expert-builder","touches":["src","test"]} -->
Sprint: 3 · Priority: med · Covers: FR-141 · Depends on: none · Parallel-safe: yes
Risk: high · Review lenses: code-integrity-reviewer, security-auditor · Specs: none

## Goal
Let customers issue API keys limited to some resources and actions, and enforce those limits on every endpoint.

## Context (self-contained)
Node 20, ESM, no dependencies. Source under `src/`, tests under `test/` run with `node --test test/`.
`src/keys.mjs` holds `parseScopes(header)`. A scope is `resource:action`, for example `invoices:read`; `resource:*` grants every action on that resource, and `*` grants everything. Resources today are `invoices`, `invoices-archive`, `users`, and `users-admin`, and more are planned with the same naming habit.

## Acceptance criteria (testable)
- [ ] `hasScope(granted, needed)` returns `true` when `granted` contains `*`, exactly `needed`, or `resource:*` for `needed`'s resource, and `false` otherwise.
- [ ] It throws an `Error` when `needed` is not of the form `resource:action`.
- [ ] `requireScope(granted, needed)` returns nothing when `hasScope` is true and otherwise throws an error whose `code` is `EFORBIDDEN`.

## Out of scope
- Issuing and revoking keys.

## Verification
- Prove done with: `node --test test/`
