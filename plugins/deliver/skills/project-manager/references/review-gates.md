# Review lenses

Which reviewers a story gets. `implementation-loop.md` owns the gates, the verifier, done, and
escalation.

## The reviewer (separate agent)
- A reviewer is read-only and **never** the agent that built the story.
- Findings are graded `block` and `major`, both must fix, and `minor`, a note. Only `block` and
  `major` force a fix round.
- Each review ends with a verdict: `FAIL` for any block or major, `CONCERNS` for minors only,
  otherwise `PASS`.

## The tier panel
The story's `tier` (`decomposition.md`) picks its panel. Read
`${CLAUDE_PLUGIN_ROOT}/benchmarks/assurance/panels.json`, which `/deliver:calibrate` writes. Its
`stamp` names the models, efforts, prompts, and `deliver` version it was measured on. For each tier
it holds a `status` of `measured` or `unmeasured`, the `panel` as lenses with a `trials` count of 1
or 2, the calibrated escape `bound`, and the `target`.

- A `measured` tier whose stamp matches the shipped lenses runs its `panel`, each lens for its
  `trials`. The panel in force always adds the builder's opposite-family lens on top
  (`expert-builder` gets `codex-reviewer`, `codex-builder` gets `code-integrity-reviewer`) when
  the measured panel lacks it.
- A tier that is `unmeasured`, absent, or stamped for other models or prompts runs the **maximum
  panel**. So does every tier when the file is missing or unreadable, or when you cannot confirm the
  stamp matches. The maximum panel is every lens below, the opposite-family reviewer on the first
  review and on every fix round, and at `T2` two trials of `code-integrity-reviewer`: two
  separate dispatches whose findings you merge.
- **Never** reduce review below the maximum panel without a measured bound that meets the tier's
  target. The one exception is a missing Codex lens, below.
- **Over target.** At sprint start, read the latest `retro-stats.mjs --trust` output, or the Trust
  section of the latest `docs/retros/sprint-<n>.md`. Any tier flagged `OVER TARGET` runs the
  maximum panel until `/deliver:calibrate` re-runs; for that tier the maximum panel is the panel
  in force, and it keeps every measured member at its trial count, so a member measured at two
  trials still runs twice.
- The tier's `target` comes from the plan's Delivery mode line
  `- Assurance targets: T0=0.10, T1=0.05, T2=0.02`; without it the defaults are 10%, 5%, and 2%.

## The opposite family
Every panel includes a lens from the family that did not write the code. An `expert-builder`
story gets `codex-reviewer`; a `codex-builder` story gets the Claude `code-integrity-reviewer`. A
fix round written by the other family gets the opposite-family lens for that round too.
`implementation-loop.md` state 3 owns the dispatch.

**Missing Codex lens.** When a Codex lens the panel needs is unavailable (the opposite-family
lens, or a calibrated `codex-reviewer`), because Codex is absent or refuses, `T0` and `T1`
continue with the lenses that can run and record it, and `T2` escalates. The Execution block's
`panel` then lacks that lens, so the trust report counts the story as below panel and withholds
that tier's bound.

## Risk triggers: lenses added on top
These lenses are additive. Under a measured panel, a story gets each one its risk calls for, even
when the panel omits it. The maximum panel already runs them all, so the skip conditions below
apply only under a measured panel.
- Always `code-integrity-reviewer`, the correctness and security baseline.
- Add `architecture-reviewer` for structural change: new modules, refactors, cross-cutting changes,
  new abstractions or interfaces. Skip it for trivial, localized changes.
- Add `security-auditor`, a deeper security lens, for auth or authz, crypto, secrets, untrusted
  input, file, network, or process I/O, deserialization, or dependency changes. Skip it when
  nothing is security-relevant.
- Add `performance-reviewer` for a hot path, a query or data-access change, a loop over unbounded
  input, caching, or concurrency, and whenever the story or plan states a latency, throughput, or
  size budget. Skip it for code that runs rarely on small input.

Start from the story's declared `Risk`, `Tier`, and `Review lenses`, see `decomposition.md`.
**Add** an undeclared lens when the diff calls for it, and note the gap. `technical-writer` and `debugger` are
delivery agents, never lenses. `fix-loop.md` owns triage.
