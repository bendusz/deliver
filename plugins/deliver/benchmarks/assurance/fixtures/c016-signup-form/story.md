# S2-4: Validate the signup form
<!-- pm-meta: {"builder":"expert-builder","touches":["src","test"]} -->
Sprint: 2 · Priority: med · Covers: FR-115 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Reject bad signups on the server with field-level messages the form can show next to each input.

## Context (self-contained)
Node 20, ESM, no dependencies. Source under `src/`, tests under `test/` run with `node --test test/`.
`src/validation.mjs` holds `isBlank(s)`. The form posts `{ email, password, displayName }`; any field may be missing or not a string. Security review asked that passwords never contain the account's email name, because credential-stuffing lists are built from exactly that.

## Acceptance criteria (testable)
- [ ] `validateSignup(form)` returns `[]` for a valid form and otherwise one `{ field, message }` per invalid field, in the order email, password, displayName.
- [ ] `email` must look like `local@domain.tld` with no spaces (surrounding spaces ignored).
- [ ] `password` must be a string of at least 12 characters and, when the email is valid and its local part (before the `@`) has 3 or more characters, must not contain that local part, ignoring case.
- [ ] `displayName` must be non-blank and at most 40 characters after trimming.

## Out of scope
- Checking passwords against breach lists.

## Verification
- Prove done with: `node --test test/`
