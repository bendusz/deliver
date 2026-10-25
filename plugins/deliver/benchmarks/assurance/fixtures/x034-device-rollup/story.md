# S1-34: Keep the first event for each device
<!-- pm-meta: {"builder":"codex-builder","touches":["src","test"]} -->
Sprint: 1 · Priority: med · Covers: FR-034 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Keep the first event for each device.

## Context (self-contained)
Node 20 or later, ESM, no dependencies. `src/feature.mjs` contains the domain helpers. Tests live in `test/`.
Events have string deviceId values and arbitrary other fields. Daily uploads can contain 100000 distinct devices.

## Acceptance criteria (testable)
- [ ] `uniqueDevices(events)` returns the first original event for each device in input order, including an empty device id.
- [ ] Use expected O(n) work and O(n) storage; do not rescan previously emitted events for each new device.

## Out of scope
- Inputs and integrations outside the contracts above.

## Verification
- Prove done with: `node --test test/*.test.mjs`

## Verification evidence

## Execution
