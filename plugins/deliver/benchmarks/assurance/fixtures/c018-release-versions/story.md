# S4-4: Pick the latest release from git tags
<!-- pm-meta: {"builder":"expert-builder","touches":["src","test"]} -->
Sprint: 4 · Priority: med · Covers: FR-117 · Depends on: none · Parallel-safe: yes
Risk: low · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Show the newest release on the downloads page by comparing the version tags the release job pushes.

## Context (self-contained)
Node 20, ESM, no dependencies. Source under `src/`, tests under `test/` run with `node --test test/`.
`src/releases.mjs` holds `parseTag(tag)`, which turns `v1.4.2` or `1.4.2` into `'1.4.2'` and anything else into `null`. Versions are always three dot-separated non-negative integers (major.minor.patch); no pre-release suffixes.

## Acceptance criteria (testable)
- [ ] `compareVersions(a, b)` returns a negative number when `a` is older than `b`, a positive number when it is newer, and 0 when they are equal, comparing major, then minor, then patch, each part as a number.
- [ ] `latestVersion(tags)` returns the newest version among the tags that `parseTag` accepts, ignoring the rest, or `null` when no tag parses.

## Out of scope
- Pre-release and build metadata (`1.0.0-rc.1`, `+build`).

## Verification
- Prove done with: `node --test test/`
