# S5-4: Signed URLs for private downloads
<!-- pm-meta: {"builder":"expert-builder","touches":["src","test"]} -->
Sprint: 5 · Priority: med · Covers: FR-118 · Depends on: none · Parallel-safe: yes
Risk: high · Review lenses: code-integrity-reviewer, security-auditor · Specs: none

## Goal
Let the app hand out time-limited links to private files that the CDN edge can verify without a database lookup.

## Context (self-contained)
Node 20, ESM, no dependencies. Source under `src/`, tests under `test/` run with `node --test test/`.
`src/cdn.mjs` exports `CDN_ORIGIN`. Paths are absolute URL paths such as `/invoices/2024/0042.pdf`. Times are epoch seconds. The edge receives the full request URL and the shared secret; anyone may craft URLs, so verification must reject any change to the path, the expiry, or the signature, and must not leak timing information about the signature.

## Acceptance criteria (testable)
- [ ] `signUrl(secret, path, expiresAt)` returns `CDN_ORIGIN` + the path as the URL parser normalises it + `?expires=<expiresAt>&sig=<signature>`, where the signature is the base64url HMAC-SHA256, under `secret`, of the normalised path and the expiry. It throws for a path that does not start with `/` or that contains `?` or `#`.
- [ ] `verifyUrl(secret, url, now)` returns `true` only for a URL on `CDN_ORIGIN` whose `sig` matches its path and `expires`, with `now` before `expires`.
- [ ] It returns `false`, never throws, for malformed URLs, other origins, missing or non-numeric `expires`, a missing or wrong `sig`, and changed paths; the signature comparison is constant-time.

## Out of scope
- Key rotation.

## Verification
- Prove done with: `node --test test/`
