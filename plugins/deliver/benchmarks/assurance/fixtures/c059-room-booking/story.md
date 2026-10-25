# S5-12: Book meeting rooms without double-booking
<!-- pm-meta: {"builder":"expert-builder","touches":["src","test"]} -->
Sprint: 5 · Priority: med · Covers: FR-158 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Let staff book meeting rooms and refuse a booking that collides with an existing one.

## Context (self-contained)
Node 20, ESM, no dependencies. Source under `src/`, tests under `test/` run with `node --test test/`.
`src/rooms.mjs` exports `ROOMS`. Bookings are `{ roomId, start, end }` in epoch milliseconds and cover `start` up to but not including `end`. Most meetings are booked back to back on the hour.

## Acceptance criteria (testable)
- [ ] `overlaps(a, b)` is `true` when the bookings are for the same room and share any instant; a booking that ends exactly when the other starts does not overlap it.
- [ ] `book(bookings, request)` returns a new array with `request` added, throws an error with `code` `ECONFLICT` when it overlaps an existing booking, and throws a `RangeError` when `request.end <= request.start`.
- [ ] Tests in `test/` cover each criterion, the back-to-back case included.

## Out of scope
- Recurring bookings.

## Verification
- Prove done with: `node --test test/`
