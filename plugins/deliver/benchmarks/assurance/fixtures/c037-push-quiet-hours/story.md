# S3-8: Respect quiet hours for push notifications
<!-- pm-meta: {"builder":"expert-builder","touches":["src","test"]} -->
Sprint: 3 · Priority: med · Covers: FR-136 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Hold back push notifications during each user's quiet hours and deliver them when the quiet period ends, without delaying anything urgent.

## Context (self-contained)
Node 20, ESM, no dependencies. Source under `src/`, tests under `test/` run with `node --test test/`.
`src/push.mjs` exports `PRIORITY_ORDER`. Notifications are `{ id, title, priority }` with priority `urgent`, `normal` or `low`. Preferences are `{ quietStart, quietEnd, utcOffsetMinutes }` with times as `HH:MM` in the user's local time; the period may wrap midnight (`22:00` to `07:00`). Times passed in and out are epoch milliseconds. Urgent notifications are security alerts and on-call pages.

## Acceptance criteria (testable)
- [ ] `schedule(notifications, prefs, now)` returns each notification copied with a `deliverAt` field, sorted by `deliverAt` and then by `PRIORITY_ORDER`.
- [ ] Outside the quiet period, or when `quietStart` equals `quietEnd` or either is missing, `deliverAt` is `now`.
- [ ] Inside the quiet period, `deliverAt` is the start of the minute at which the period ends in the user's local time, including periods that wrap midnight.
- [ ] Urgent notifications are always delivered at `now`, quiet hours or not.

## Out of scope
- Daylight-saving changes inside the quiet period.

## Verification
- Prove done with: `node --test test/`
