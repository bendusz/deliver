# S6-7: JSON client for the billing service
<!-- pm-meta: {"builder":"expert-builder","touches":["src","test"]} -->
Sprint: 6 · Priority: med · Covers: FR-134 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Give the app one helper for GET calls to the billing service that turns every failure into an error the callers already know how to handle.

## Context (self-contained)
Node 20, ESM, no dependencies. Source under `src/`, tests under `test/` run with `node --test test/`.
`src/client.mjs` exports `HttpError` (`status`, `body`). `fetch` is injected (the global `fetch` in production); a response has `ok`, `status` and an async `text()`. Callers retry when they catch an `HttpError` with status 502, 503 or 504. The billing service's load balancer answers those with an HTML page, and the service answers 204 with an empty body.

## Acceptance criteria (testable)
- [ ] `getJson(fetch, url)` calls `fetch(url, { headers: { accept: 'application/json' } })` and resolves to the parsed JSON body of a 2xx response, or `null` when that body is empty.
- [ ] Any non-2xx response rejects with an `HttpError` whose `status` is the response status and whose `body` is the response text, whatever format that text is in.
- [ ] A 2xx response whose body is not valid JSON rejects with a `SyntaxError`.

## Out of scope
- Retrying; callers do that.

## Verification
- Prove done with: `node --test test/`
