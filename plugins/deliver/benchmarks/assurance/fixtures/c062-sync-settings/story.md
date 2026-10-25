# S3-13: Load the sync client's settings file
<!-- pm-meta: {"builder":"expert-builder","touches":["src","test"]} -->
Sprint: 3 · Priority: med · Covers: FR-161 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Load the desktop sync client's saved settings at startup, falling back to defaults on a fresh install.

## Context (self-contained)
Node 20, ESM, no dependencies. Source under `src/`, tests under `test/` run with `node --test test/`.
`src/paths.mjs` exports `configDir()`. The settings file is JSON. On startup the client calls `readSettings` and, when it resolves, rewrites the file with the result, so whatever `readSettings` resolves to replaces the user's saved settings. When it rejects, the client shows the error and leaves the file alone.

## Acceptance criteria (testable)
- [ ] `readSettings(file)` resolves to `DEFAULT_SETTINGS` overlaid with the saved object's keys.
- [ ] When `file` does not exist, it resolves to a copy of `DEFAULT_SETTINGS`.
- [ ] When the file exists but cannot be read, is not valid JSON, or does not hold a JSON object, it rejects, so a damaged file is never replaced by defaults.

## Out of scope
- Writing the settings file.

## Verification
- Prove done with: `node --test test/`
