# S3-12: Notify partners of order events
<!-- pm-meta: {"builder":"expert-builder","touches":["src","test"]} -->
Sprint: 3 · Priority: med · Covers: FR-156 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Tell every integration partner about order events, retrying transient network failures once, and report exactly which partners did not get the event so support can follow up.

## Context (self-contained)
Node 20, ESM, no dependencies. Source under `src/`, tests under `test/` run with `node --test test/`.
`src/partners.mjs` exports `RETRYABLE`, the error codes worth one retry. Partners are `{ id, url }`. `post(url, event)` is the HTTP client; it rejects with an error carrying a `code`. Support reconciles from the `failed` list only, so a partner wrongly reported as delivered is never followed up.

## Acceptance criteria (testable)
- [ ] `notifyPartners(partners, event, post)` posts `event` to every partner's `url` and resolves to `{ delivered, failed }` once every partner has been tried: `delivered` lists partner ids, `failed` lists `{ id, error }` with the last error's message.
- [ ] A post that rejects with a code in `RETRYABLE` is retried once; one that rejects with any other code is not retried.
- [ ] A partner is in `delivered` only when one of its posts resolved, and in `failed` otherwise, including when the retry also fails.

## Out of scope
- Signing payloads.

## Verification
- Prove done with: `node --test test/`
