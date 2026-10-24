# S5-6: Save user profiles
<!-- pm-meta: {"builder":"expert-builder","touches":["src","test"]} -->
Sprint: 5 · Priority: med · Covers: FR-128 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Let users edit their profile, creating it on the first save, and let the settings page show the stored result as soon as the save finishes.

## Context (self-contained)
Node 20, ESM, no dependencies. Source under `src/`, tests under `test/` run with `node --test test/`.
`src/profile-store.mjs` exports `DocStore`, a stand-in for the production document client with the same async API: `get(id)` resolves to a copy of the document or `null`, `insert(id, doc)` rejects when the id exists, `update(id, doc)` rejects when it does not. Every call completes asynchronously. Only `displayName`, `bio` and `timezone` may be changed by users.

## Acceptance criteria (testable)
- [ ] `saveProfile(store, userId, changes)` creates `{ ...DEFAULT_PROFILE, ...allowedChanges, userId }` with `insert` when the user has no profile, and otherwise merges the allowed changes into the stored profile with `update`.
- [ ] Keys other than `displayName`, `bio` and `timezone` in `changes` are ignored.
- [ ] It resolves to the saved profile only after the store has finished writing it, on both the create and the update path, and rejects when the store rejects.

## Out of scope
- Avatars.

## Verification
- Prove done with: `node --test test/`
