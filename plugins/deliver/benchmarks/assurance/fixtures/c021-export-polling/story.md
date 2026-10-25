# S2-5: Wait for data exports to finish
<!-- pm-meta: {"builder":"expert-builder","touches":["src","test"]} -->
Sprint: 2 · Priority: med · Covers: FR-120 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Let the CLI wait for a data export it started and print the download link once the export is ready.

## Context (self-contained)
Node 20, ESM, no dependencies. Source under `src/`, tests under `test/` run with `node --test test/`.
`src/exports.mjs` exports `TERMINAL`. `getStatus()` calls the export API and resolves to `{ state, url, error }` with `state` one of `queued`, `running`, `done`, `failed`; it may also reject (network error). Sleeping is injected so tests do not wait.

## Acceptance criteria (testable)
- [ ] `waitForExport(getStatus, { intervalMs = 2000, maxAttempts = 30, sleep })` polls `getStatus()` immediately and then after each `sleep(intervalMs)`, and resolves to `url` once `state` is `done`.
- [ ] It rejects with an `Error` holding the export's `error` text when `state` is `failed`, and with the same rejection when `getStatus()` rejects.
- [ ] After `maxAttempts` polls without a terminal state it rejects with an error whose `code` is `ETIMEDOUT`, without sleeping after the last poll.

## Out of scope
- Starting the export.

## Verification
- Prove done with: `node --test test/`
