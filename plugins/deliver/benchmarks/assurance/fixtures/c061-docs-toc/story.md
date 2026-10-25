# S2-13: Table of contents for docs pages
<!-- pm-meta: {"builder":"expert-builder","touches":["src","test"]} -->
Sprint: 2 · Priority: med · Covers: FR-160 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Generate the "On this page" sidebar of the docs site from each page's Markdown headings.

## Context (self-contained)
Node 20, ESM, no dependencies. Source under `src/`, tests under `test/` run with `node --test test/`.
`src/markdown.mjs` holds `headingAnchor(text)`, the slug the renderer gives each heading. Only ATX headings (`#` to `######` followed by a space) exist in the docs. Many pages show shell sessions and Python in fenced code blocks (opened and closed by ```` ``` ```` or `~~~`), where lines such as `# install deps` are comments, not headings.

## Acceptance criteria (testable)
- [ ] `tableOfContents(markdown, maxDepth = 3)` returns `{ depth, text, anchor }` for each heading of depth `maxDepth` or less, in document order.
- [ ] `anchor` is `headingAnchor(text)`; when that anchor was already used on the page, the second gets `-1`, the third `-2`, and so on.
- [ ] Lines inside fenced code blocks are never headings.

## Out of scope
- Setext (underlined) headings and HTML headings.

## Verification
- Prove done with: `node --test test/`
