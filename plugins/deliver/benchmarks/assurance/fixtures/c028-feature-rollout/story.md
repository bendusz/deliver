# S4-6: Percentage rollouts for feature flags
<!-- pm-meta: {"builder":"expert-builder","touches":["src","test"]} -->
Sprint: 4 · Priority: med · Covers: FR-127 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Turn features on for a stable percentage of users, with an allow list for staff and a kill switch.

## Context (self-contained)
Node 20, ESM, no dependencies. Source under `src/`, tests under `test/` run with `node --test test/`.
`src/flags.mjs` holds `bucketOf(flagName, userId)`, a stable hash of the pair into an integer bucket from 0 to 99 inclusive, uniformly distributed. Flags are `{ name, enabled, rolloutPercent, allowUsers }` with `rolloutPercent` an integer from 0 to 100. Product uses `rolloutPercent: 0` to stage a flag for staff only before launch.

## Acceptance criteria (testable)
- [ ] `isEnabled(flag, userId)` is `false` for everyone, allow-listed users included, when `flag.enabled` is `false`.
- [ ] Otherwise it is `true` for every user in `allowUsers` (which may be absent).
- [ ] Otherwise it is `true` for exactly `rolloutPercent` percent of users, by `bucketOf`: 0 enables no one, 100 enables everyone, and a user enabled at some percentage stays enabled at every higher one.

## Out of scope
- Per-segment targeting.

## Verification
- Prove done with: `node --test test/`
