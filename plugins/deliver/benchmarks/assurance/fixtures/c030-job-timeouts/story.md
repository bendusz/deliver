# S6-6: Parse job timeout durations
<!-- pm-meta: {"builder":"expert-builder","touches":["src","test"]} -->
Sprint: 6 · Priority: med · Covers: FR-129 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Let pipeline authors write job timeouts as readable durations (`15m`, `1h30m`) instead of raw seconds.

## Context (self-contained)
Node 20, ESM, no dependencies. Source under `src/`, tests under `test/` run with `node --test test/`.
`src/timeouts.mjs` exports `DEFAULT_TIMEOUT_SEC`. A duration is one or more `<integer><unit>` parts with units `d`, `h`, `m`, `s`, each at most once and largest first, with nothing else around them except surrounding spaces. A typo must fail the pipeline config check rather than run a job with the wrong timeout.

## Acceptance criteria (testable)
- [ ] `parseDuration(text)` returns the number of seconds a valid duration denotes: `90s` is 90, `1h30m` is 5400, `2d` is 172800.
- [ ] It throws a `SyntaxError` for any other text, including `''`, `5x`, `1h30`, `m` and `30m1h`.
- [ ] Tests in `test/` prove both criteria, including that invalid text throws.

## Out of scope
- Fractional values such as `1.5h`.

## Verification
- Prove done with: `node --test test/`
