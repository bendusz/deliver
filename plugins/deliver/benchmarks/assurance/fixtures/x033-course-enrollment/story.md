# S1-33: Attach students to course registrations
<!-- pm-meta: {"builder":"codex-builder","touches":["src","test"]} -->
Sprint: 1 · Priority: med · Covers: FR-033 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Attach students to course registrations.

## Context (self-contained)
Node 20 or later, ESM, no dependencies. `src/feature.mjs` contains the domain helpers. Tests live in `test/`.
Students have unique id strings. Registrations have course and studentId strings. Imports can contain 50000 of each.

## Acceptance criteria (testable)
- [ ] `enrollments(students, registrations)` preserves registration order and attaches the matching student object or null.
- [ ] Process the join in O(students.length + registrations.length) expected work, with O(students.length) auxiliary storage. Leave inputs unchanged.

## Out of scope
- Inputs and integrations outside the contracts above.

## Verification
- Prove done with: `node --test test/*.test.mjs`

## Verification evidence

## Execution
