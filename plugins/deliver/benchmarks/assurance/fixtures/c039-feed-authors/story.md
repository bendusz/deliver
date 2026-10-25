# S5-8: Attach authors to feed posts
<!-- pm-meta: {"builder":"expert-builder","touches":["src","test"]} -->
Sprint: 5 · Priority: med · Covers: FR-138 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer, performance-reviewer · Specs: none

## Goal
Show each post in the home feed with its author's name.

## Context (self-contained)
Node 20, ESM, no dependencies. Source under `src/`, tests under `test/` run with `node --test test/`.
`src/repo.mjs` exports `UserRepo`, an in-memory stand-in for the SQL-backed repository with the same API: `findById(id)` and `findByIds(ids)`, each one database round trip (the repo counts them in `queries`). Feed pages hold up to 100 posts, and the feed endpoint has a budget of one user query per page. Posts are `{ id, authorId, text }`.

## Acceptance criteria (testable)
- [ ] `withAuthors(posts, repo)` resolves to the posts in the same order, each copied with an `author` field `{ id, name }` for the user whose id is `post.authorId`, or `author: null` when that user no longer exists.
- [ ] One call makes at most one repository query, whatever the number of posts, and none for an empty page.
- [ ] The input posts are not modified.

## Out of scope
- Caching users across pages.

## Verification
- Prove done with: `node --test test/`
