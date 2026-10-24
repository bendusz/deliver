# S6-5: CORS allow-list for the API
<!-- pm-meta: {"builder":"expert-builder","touches":["src","test"]} -->
Sprint: 6 · Priority: med · Covers: FR-124 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer, security-auditor · Specs: none

## Goal
Let the company's web apps call the API from the browser with credentials, and nobody else.

## Context (self-contained)
Node 20, ESM, no dependencies. Source under `src/`, tests under `test/` run with `node --test test/`.
`src/http.mjs` holds `header(headers, name)`. The allow-list holds exact origins such as `https://app.example.com` and wildcard entries such as `https://*.example.com`, which cover every subdomain of `example.com` on the default port. Responses carry `Access-Control-Allow-Credentials: true`, so an origin wrongly allowed can read users' data.

## Acceptance criteria (testable)
- [ ] `isAllowedOrigin(origin, allowed)` returns `true` when `origin` equals an exact entry, or when a wildcard entry `scheme://*.domain` has the same scheme and `origin`'s host is a subdomain of `domain` on the default port.
- [ ] It returns `false` for every other origin, including the string `null`, malformed values, and values with a path or trailing slash.
- [ ] `corsHeaders(origin, allowed)` returns `Access-Control-Allow-Origin` set to `origin`, `Access-Control-Allow-Credentials: 'true'` and `Vary: 'Origin'` for an allowed origin, and `{}` otherwise.

## Out of scope
- Preflight method and header lists.

## Verification
- Prove done with: `node --test test/`
