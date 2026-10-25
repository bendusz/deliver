# S6-1: Password reset tokens
<!-- pm-meta: {"builder":"expert-builder","touches":["src","test"]} -->
Sprint: 6 · Priority: med · Covers: FR-104 · Depends on: none · Parallel-safe: yes
Risk: high · Review lenses: code-integrity-reviewer, security-auditor · Specs: none

## Goal
Issue password-reset tokens that are emailed to the user and let the reset form redeem them.

## Context (self-contained)
Node 20, ESM, no dependencies. Source under `src/`, tests under `test/` run with `node --test test/`.
`src/store.mjs` exports `MemoryStore`, which has the same async `get`/`set`/`delete` API as the production Redis wrapper. Callers pass the current time in milliseconds as `now`.

## Acceptance criteria (testable)
- [ ] `issueResetToken(store, userId, now)` stores and returns an unguessable random token for `userId`, valid for one hour.
- [ ] `redeemResetToken(store, token, now)` returns the `userId` the token was issued for.
- [ ] It returns `null` for an unknown token, for a token at or after `now` = issue time + 3,600,000 ms, and for a token that has already been redeemed once: a token works exactly once.

## Out of scope
- Sending the email and changing the password.

## Verification
- Prove done with: `node --test test/`
