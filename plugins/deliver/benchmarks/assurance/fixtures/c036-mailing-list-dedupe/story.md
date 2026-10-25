# S2-8: De-duplicate imported contacts
<!-- pm-meta: {"builder":"expert-builder","touches":["src","test"]} -->
Sprint: 2 · Priority: med · Covers: FR-135 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer, performance-reviewer · Specs: none

## Goal
Drop duplicate contacts from a CSV upload before they reach the mailing list, keeping the first row for each address.

## Context (self-contained)
Node 20, ESM, no dependencies. Source under `src/`, tests under `test/` run with `node --test test/`.
`src/contacts.mjs` holds `normalizeEmail(email)` (trim and lowercase). Contacts are `{ email, name, source }`. Uploads routinely hold 200,000 rows and the import runs inside a request, so the work must grow linearly with the number of rows.

## Acceptance criteria (testable)
- [ ] `dedupeContacts(contacts)` returns the contacts with duplicates removed, where two contacts are duplicates when their normalized emails are equal; the first occurrence is kept and input order is preserved.
- [ ] The input array is not modified.
- [ ] The time taken grows linearly with the number of contacts: each contact's email is normalized a constant number of times.

## Out of scope
- Merging fields from duplicate rows.

## Verification
- Prove done with: `node --test test/`
