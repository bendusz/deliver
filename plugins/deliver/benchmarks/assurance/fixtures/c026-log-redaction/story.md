# S2-6: Redact secrets from structured logs
<!-- pm-meta: {"builder":"expert-builder","touches":["src","test"]} -->
Sprint: 2 · Priority: med · Covers: FR-125 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer, security-auditor · Specs: none

## Goal
Stop credentials from reaching the log pipeline when handlers log request bodies and headers.

## Context (self-contained)
Node 20, ESM, no dependencies. Source under `src/`, tests under `test/` run with `node --test test/`.
`src/logger.mjs` holds `formatLine(level, msg, fields)`. Handlers log whole request bodies, which nest objects and arrays freely (for example a bulk-invite body `{ invites: [{ email, password }] }`). A property is secret when its name, ignoring case, is `password`, `passwd`, `secret`, `token`, `apikey`, `api_key`, `api-key`, `authorization` or `cookie`.

## Acceptance criteria (testable)
- [ ] `redact(value)` returns a copy of `value` in which every secret property, at any depth and including inside objects held in arrays, has the value `'[REDACTED]'`.
- [ ] Other values are unchanged; values that are not plain objects or arrays (strings, numbers, `null`, `Date`s) are returned as they are, and the input is not modified.
- [ ] `logLine(level, msg, fields)` is `formatLine(level, msg, redact(fields))`.

## Out of scope
- Redacting secrets inside string values.

## Verification
- Prove done with: `node --test test/`
