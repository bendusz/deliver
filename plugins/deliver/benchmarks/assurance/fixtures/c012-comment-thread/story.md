# S3-3: Render blog comment threads
<!-- pm-meta: {"builder":"expert-builder","touches":["src","test"]} -->
Sprint: 3 · Priority: med · Covers: FR-111 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer, security-auditor · Specs: none

## Goal
Render the comments under a blog post as server-side HTML, linking each author's name to their website when they gave one.

## Context (self-contained)
Node 20, ESM, no dependencies. Source under `src/`, tests under `test/` run with `node --test test/`.
`src/html.mjs` exports `escapeHtml(value)`. Comments come from an unauthenticated form: `{ author, website, body, createdAt }`, where `createdAt` is an ISO-8601 UTC string and `website` may be empty. Every field except `createdAt` is untrusted.

## Acceptance criteria (testable)
- [ ] `renderComment(comment)` returns one `<li class="comment">` holding the author, a `<time>` with the date part of `createdAt`, and the body split into `<p>` paragraphs on blank lines.
- [ ] When `website` starts with `http://` or `https://`, the author's name is wrapped in `<a href="..." rel="nofollow">`; any other website is ignored.
- [ ] Every untrusted field is HTML-escaped wherever it appears in the output.
- [ ] `renderThread(comments)` returns the comments oldest first inside `<ul class="comments">`, or `<p class="empty">No comments yet.</p>` for an empty list.

## Out of scope
- Markdown or any other formatting in comment bodies.

## Verification
- Prove done with: `node --test test/`
