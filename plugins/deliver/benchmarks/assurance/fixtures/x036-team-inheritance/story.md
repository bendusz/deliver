# S1-36: Resolve inherited teams in an organization tree
<!-- pm-meta: {"builder":"codex-builder","touches":["src","test"]} -->
Sprint: 1 · Priority: med · Covers: FR-036 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Resolve inherited teams in an organization tree.

## Context (self-contained)
Node 20 or later, ESM, no dependencies. `src/feature.mjs` contains the domain helpers. Tests live in `test/`.
Nodes have unique id, parentId null or an earlier node id, and team null or a string. Parent-before-child order is guaranteed; depth may be 50000.

## Acceptance criteria (testable)
- [ ] `inheritedTeams(nodes)` returns each node own team or its nearest ancestor team, or null if none, in input order.
- [ ] Use O(n) expected work and O(n) storage even for a chain. Do not mutate nodes.

## Out of scope
- Inputs and integrations outside the contracts above.

## Verification
- Prove done with: `node --test test/*.test.mjs`

## Verification evidence

## Execution
