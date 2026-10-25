# S5-5: Send daily notification digests
<!-- pm-meta: {"builder":"expert-builder","touches":["src","test"]} -->
Sprint: 5 · Priority: med · Covers: FR-123 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Send one digest email to every user with unread notifications, and let the scheduler know how many went out only once they have all been handed to the mailer.

## Context (self-contained)
Node 20, ESM, no dependencies. Source under `src/`, tests under `test/` run with `node --test test/`.
`src/notify.mjs` holds `digestSubject(count)`. Users are `{ email, unread }`. `send(to, subject)` is the mailer client: it returns a promise that resolves once the mail provider accepts the message and rejects when it refuses it. The scheduler marks the run complete as soon as `sendDigests` resolves.

## Acceptance criteria (testable)
- [ ] `sendDigests(users, send)` calls `send(user.email, digestSubject(user.unread))` once for every user with `unread > 0`, and never for the others.
- [ ] It resolves to the number of digests sent, and only after every `send` it started has resolved.
- [ ] When a `send` rejects, `sendDigests` rejects with that error.

## Out of scope
- Retrying refused messages.

## Verification
- Prove done with: `node --test test/`
