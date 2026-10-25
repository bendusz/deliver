# S6-3: Return to the requested page after login
<!-- pm-meta: {"builder":"expert-builder","touches":["src","test"]} -->
Sprint: 6 · Priority: med · Covers: FR-114 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer, security-auditor · Specs: none

## Goal
After logging in, send users back to the page they originally asked for, which the login form carries in its `next` parameter.

## Context (self-contained)
Node 20, ESM, no dependencies. Source under `src/`, tests under `test/` run with `node --test test/`.
`src/session.mjs` exports `DEFAULT_LANDING`. The `next` value comes from the query string and is untrusted; the server puts the returned value in a `Location` header as is, and browsers resolve it against the site's origin.

## Acceptance criteria (testable)
- [ ] `safeRedirect(target)` returns `target` unchanged when it is a path on this site: a relative URL that starts with a single `/`.
- [ ] It returns `DEFAULT_LANDING` for anything a browser could resolve to another host, including absolute URLs, protocol-relative URLs, and targets containing a backslash or a control character.
- [ ] It returns `DEFAULT_LANDING` for a missing, empty, or non-string `target`.

## Out of scope
- Allow-listing other first-party hosts.

## Verification
- Prove done with: `node --test test/`
