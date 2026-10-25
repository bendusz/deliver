# S1-53: Serialize a locale preference cookie
<!-- pm-meta: {"builder":"codex-builder","touches":["src","test"]} -->
Sprint: 1 · Priority: med · Covers: FR-053 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Serialize a locale preference cookie.

## Context (self-contained)
Node 20 or later, ESM, no dependencies. `src/feature.mjs` contains the domain helpers. Tests live in `test/`.
Locale is any well-formed Unicode string from an untrusted request. This helper emits only the cookie header value, not a complete HTTP header.

## Acceptance criteria (testable)
- [ ] `localeCookie(locale)` emits locale=<encoded value>; Path=/; HttpOnly; SameSite=Lax.
- [ ] Encode the value with encodeURIComponent so semicolons, equals signs, CR, LF, and non-ASCII data cannot create cookie attributes or headers. Empty locale is valid.

## Out of scope
- Inputs and integrations outside the contracts above.

## Verification
- Prove done with: `node --test test/*.test.mjs`

## Verification evidence

## Execution
