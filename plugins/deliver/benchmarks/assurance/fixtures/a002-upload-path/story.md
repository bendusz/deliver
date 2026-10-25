# S1-2: Resolve upload paths safely
<!-- pm-meta: {"builder":"expert-builder","touches":["src","test"]} -->
Sprint: 1 · Priority: med · Covers: FR-001 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Map a client-supplied upload name to a file path that cannot leave the upload root.

## Context (self-contained)
Node 20, ESM, no dependencies. Source under `src/`, tests under `test/` run with `node --test test/`.
`src/uploads.mjs` exports `UPLOAD_ROOT`. Upload names come straight from HTTP clients and are untrusted.

## Acceptance criteria (testable)
- [ ] `resolveUpload(root, name)` returns the absolute path of `name` inside `root`.
- [ ] A `name` that resolves to `root` itself or to any path outside `root` throws an error whose `code` is `EOUTSIDE`.

## Out of scope
- Anything not named above.

## Verification
- Prove done with: `node --test test/`
