# S1-17: Search current and archived contacts
<!-- pm-meta: {"builder":"codex-builder","touches":["src","test"]} -->
Sprint: 1 · Priority: med · Covers: FR-017 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Search current and archived contacts.

## Context (self-contained)
Node 20 or later, ESM, no dependencies. `src/feature.mjs` contains the domain helpers. Tests live in `test/`.
Contacts have name strings and archived booleans. Query is a string, including empty. Preserve original contact objects and order.

## Acceptance criteria (testable)
- [ ] `searchContacts(contacts, query, options)` matches name substrings without case sensitivity.
- [ ] Exclude archived contacts by default; include them when includeArchived is true. An empty query matches every eligible contact.

## Out of scope
- Inputs and integrations outside the contracts above.

## Verification
- Prove done with: `node --test test/*.test.mjs`

## Verification evidence

## Execution
