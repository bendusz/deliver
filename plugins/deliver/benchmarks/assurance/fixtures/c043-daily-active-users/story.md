# S4-9: Daily active users in the account's time zone
<!-- pm-meta: {"builder":"expert-builder","touches":["src","test"]} -->
Sprint: 4 · Priority: med · Covers: FR-142 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Show each customer account its daily active users, counted by calendar day in the account's own time zone rather than UTC.

## Context (self-contained)
Node 20, ESM, no dependencies. Source under `src/`, tests under `test/` run with `node --test test/`.
`src/activity.mjs` exports `DAY_MS`. Events are `{ userId, at }` with `at` in epoch milliseconds. Accounts store a fixed UTC offset in minutes, positive east of UTC, the same sign as ISO-8601 offsets: `+60` for Amsterdam in winter (`+01:00`), `-300` for New York in winter (`-05:00`).

## Acceptance criteria (testable)
- [ ] `localDay(at, utcOffsetMinutes)` returns the `YYYY-MM-DD` calendar date at instant `at` in a zone `utcOffsetMinutes` from UTC, so `localDay(Date.parse('2024-03-10T23:30:00Z'), 60)` is `'2024-03-11'`.
- [ ] `dailyActiveCounts(events, utcOffsetMinutes)` returns an object whose keys are the local days that have events, in ascending order, and whose values are the number of distinct users active that day.

## Out of scope
- Daylight-saving transitions; the stored offset is used as is.

## Verification
- Prove done with: `node --test test/`
