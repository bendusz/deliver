# S4-7: Find duplicate uploads
<!-- pm-meta: {"builder":"expert-builder","touches":["src","test"]} -->
Sprint: 4 · Priority: med · Covers: FR-132 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer, performance-reviewer · Specs: none

## Goal
Show workspace admins which uploaded files are byte-for-byte duplicates and how much storage they waste.

## Context (self-contained)
Node 20, ESM, no dependencies. Source under `src/`, tests under `test/` run with `node --test test/`.
`src/files.mjs` holds file helpers. File records are `{ path, size, sha256 }`; equal `sha256` means equal content and size. Large workspaces hold 500,000 files and the report runs in a request, so the work must grow linearly with the number of files.

## Acceptance criteria (testable)
- [ ] `duplicateGroups(files)` returns arrays of paths that share a `sha256`, only for hashes held by two or more files; paths within a group keep input order, and groups are ordered by the position of their first path.
- [ ] `wastedBytes(files)` returns the total size of every file beyond the first with its hash.
- [ ] Both run in time linear in the number of files.

## Out of scope
- Deleting duplicates.

## Verification
- Prove done with: `node --test test/`
