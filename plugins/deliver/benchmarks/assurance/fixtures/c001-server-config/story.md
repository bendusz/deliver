# S2-1: Layered server configuration
<!-- pm-meta: {"builder":"expert-builder","touches":["src","test"]} -->
Sprint: 2 · Priority: med · Covers: FR-100 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Build the API server's settings from built-in defaults, an optional settings file, and `APP_*` environment variables, so operators can override any setting without a redeploy.

## Context (self-contained)
Node 20, ESM, no dependencies. Source under `src/`, tests under `test/` run with `node --test test/`.
`src/defaults.mjs` exports the frozen `DEFAULTS` object; its keys are the only settings that exist. The caller reads and parses the settings file and passes the parsed object (or `{}` when there is none) together with `process.env`.

## Acceptance criteria (testable)
- [ ] `loadConfig(fileSettings, env)` returns a frozen object with every key of `DEFAULTS`; values from `fileSettings` override the defaults, and `APP_PORT`, `APP_HOST`, `APP_LOG_LEVEL`, `APP_REQUEST_TIMEOUT_MS` override both. An empty variable counts as unset.
- [ ] `port` and `requestTimeoutMs` are returned as numbers; a value that is not a non-negative integer throws an `Error`.
- [ ] A key in `fileSettings` that is not a key of `DEFAULTS` throws an `Error` whose message names the key, so typos in the settings file fail at startup.

## Out of scope
- Reading the settings file from disk.

## Verification
- Prove done with: `node --test test/`
