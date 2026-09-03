# Review & Verification Gates

How a story is judged done. Three independent checks: a **reviewer agent** (qualitative), the
**deterministic gates** (mechanical), and a final **`pm-verifier`** pass (independent confirmation).
They are separate on purpose.

## The reviewer (separate agent)
- `code-integrity-reviewer` is **never** the agent that built the story (this avoids self-review
  blind spots) and is read-only.
- Findings are graded: **`block`** (must fix), **`major`** (must fix), **`minor`** (note, optional).
- Each review ends with a verdict: **`PASS`** (no block/major), **`CONCERNS`** (only minor), or
  **`FAIL`** (one or more block/major).
- Only `block`/`major` force a fix round.

## The review panel — select lenses by risk
Reviewers are separate agents, each a distinct lens. Run only the lenses a story warrants:
- **Always:** `code-integrity-reviewer` (correctness + security baseline).
- **Add `architecture-reviewer`** when the story changes structure — new modules, refactors,
  cross-cutting changes, or new abstractions/interfaces. **Skip** it for trivial, localized changes.
- **Add `security-auditor`** — a deeper security lens than the baseline — when the story touches
  auth/authz, crypto, secrets/credentials, external or untrusted input, file/network/process I/O,
  deserialization, or dependency changes. **Skip** it for changes with no security surface.
- *(Extensible: a performance lens for hot paths can join when such an agent is available.)*
Start from the story's declared **Risk** / **Review lenses** (see `decomposition.md`) where present;
still **add** a lens if the diff reveals a surface the story didn't declare (and note the gap). A
reviewer is never the agent that built the story. Aggregate the verdicts: the story passes review
only when **every selected lens** has no open `block`/`major`. Before acting, **triage** the
findings — dedupe across lenses and drop false positives / out-of-scope items — and fix only the
real `block`/`major` ones.

### Triage — you are the lead reviewer, not an aggregator
Sort every finding into one of four buckets and show the user all four (the Dismissed list is how
they override you):
- **Act on** — real correctness, security, or maintainability problems given the story's actual
  goal. These are the `block`/`major` items that go to the fix round. More than ~5 means you are
  not filtering hard enough.
- **Consider** — legitimate, but you are not sure the fix is worth its cost now. Surface to the user.
- **Noted** — valid but not actionable (context-dependent, premature, low impact).
- **Dismissed** — wrong, nitpicky, or missing context, each with a one-line reason.

Filtering rules: a finding raised independently by two lenses is high signal. A hypothetical
("what if this is null") counts only if the call path can actually produce it — trace it. "I
would have done it differently" is not a finding. A reviewer flagging code the story did not
touch, or a pattern consistent with the rest of the codebase, is missing context. Be slower to
dismiss security and correctness findings than style ones. (Buckets and rules adapted from the
`interrogate` skill in pstack.)

*Optional lens:* for a small diff into shared code, a blast-radius skill (for example
`poteto:blast-radius`) finds what the change breaks beyond the diff and proves the one fact it is
safe because of by running code. Its confirmed risks enter triage like any other finding.

`technical-writer` and `debugger` are *delivery* agents, not review lenses — they never gate a story.

## Deterministic gates (you run these)
- The gates are the project's **actual** `test` / `lint` / `build` commands as recorded in the plan
  and `AGENTS.md`. Any that don't exist are `N/A` and skipped.
- **You** (the PM) run them — after the build, and again after each fix. Don't take a subagent's
  word that they pass.

## Final verification gate (you dispatch this)
After the review panel passes and the deterministic gates are green, dispatch `pm-verifier` (read-only)
to independently confirm the story is shippable — it re-checks the acceptance criteria, the diff, the
resolved findings, and the gates against **actual repo state**, not summaries. It returns
`STATUS: PASS | FAIL | UNKNOWN`. **`PASS` is required before ship**; `FAIL` returns to the fix loop;
`UNKNOWN` needs the missing evidence (or user escalation). Full handling in `verification.md`.

## Definition of done (a story)
A story is done when **all** of these hold:
- every acceptance criterion is met,
- no open `block`/`major` findings across **all** selected review lenses,
- all non-`N/A` gates are green,
- `pm-verifier` returned `STATUS: PASS`,
- the outcome is logged.

## Escalation
If a story isn't done after **3** fix/verify iterations, **stop and ask the user** — don't loop
forever.
