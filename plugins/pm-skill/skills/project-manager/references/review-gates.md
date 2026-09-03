# Review and verification gates

How a story is judged done. Three independent checks: a reviewer agent for judgement, the
deterministic gates for mechanics, and a final `pm-verifier` pass for independent confirmation. They
are separate on purpose.

## The reviewer (separate agent)
- `code-integrity-reviewer` is **never** the agent that built the story, which avoids self-review
  blind spots, and it is read-only.
- Findings are graded `block` (must fix), `major` (must fix), and `minor` (note, optional).
- Each review ends with a verdict: `PASS` for no block or major, `CONCERNS` for only minor, `FAIL`
  for one or more block or major.
- Only `block` and `major` force a fix round.

## The review panel: select lenses by risk
Reviewers are separate agents, each a distinct lens. Run only the lenses a story warrants.
- Always `code-integrity-reviewer`, the correctness and security baseline.
- Add `architecture-reviewer` when the story changes structure: new modules, refactors,
  cross-cutting changes, or new abstractions and interfaces. Skip it for trivial, localized changes.
- Add `security-auditor`, a deeper security lens than the baseline, when the story touches auth or
  authz, crypto, secrets and credentials, external or untrusted input, file, network, or process
  I/O, deserialization, or dependency changes. Skip it when the change has nothing security-relevant
  in it.
- The set is extensible: a performance lens for hot paths can join when such an agent exists.

Start from the story's declared `Risk` and `Review lenses`, see `decomposition.md`, where they are
present. Still **add** a lens if the diff reveals something the story did not declare, and note the
gap. A reviewer is never the agent that built the story. Aggregate the verdicts: the story passes
review only when every selected lens has no open `block` or `major`. Before acting, **triage** the
findings, deduping across lenses and dropping false positives and out-of-scope items, and fix only
the real `block` and `major` ones.

### Triage: you are the lead reviewer, not an aggregator
Sort every finding into one of four buckets and show the user all four. The Dismissed list is how
they override you.
- **Act on.** Real correctness, security, or maintainability problems, given the story's actual goal.
  These are the `block` and `major` items that go to the fix round. More than about 5 means you are
  not filtering hard enough.
- **Consider.** Legitimate, but you are not sure the fix is worth its cost now. Surface it to the
  user.
- **Noted.** Valid but not actionable: context-dependent, premature, or low impact.
- **Dismissed.** Wrong, nitpicky, or missing context, each with a one-line reason.

Filtering rules. A finding two lenses raised independently is high signal. A hypothetical, "what if
this is null", counts only if the call path can actually produce it, so trace it. "I would have done
it differently" is not a finding. A reviewer flagging code the story did not touch, or a pattern
consistent with the rest of the codebase, is missing context. Be slower to dismiss security and
correctness findings than style ones. The buckets and rules are adapted from the `interrogate` skill
in pstack.

Optional lens: for a small diff into shared code, a blast-radius skill such as `poteto:blast-radius`
finds what the change breaks beyond the diff and proves, by running code, the one fact it is safe
because of. Its confirmed risks enter triage like any other finding.

`technical-writer` and `debugger` are delivery agents, not review lenses. They never gate a story.

## Deterministic gates (you run these)
- The gates are the project's actual `test`, `lint`, and `build` commands as recorded in the plan and
  `AGENTS.md`. Any that do not exist are `N/A` and skipped.
- You, the PM, run them, after the build and again after each fix. Do not take a subagent's word that
  they pass.

## Final verification gate (you dispatch this)
After the review panel passes and the deterministic gates are green, dispatch `pm-verifier`, which is
read-only, to independently confirm the story is shippable. It re-checks the acceptance criteria, the
diff, the resolved findings, and the gates against actual repo state rather than summaries, and
returns `STATUS: PASS | FAIL | UNKNOWN`. **PASS** is required before ship. `FAIL` returns to the fix
loop, and `UNKNOWN` needs the missing evidence or a user escalation. Full handling in
`verification.md`.

## Definition of done (a story)
A story is done when all of these hold:
- every acceptance criterion is met,
- no open `block` or `major` findings across all selected review lenses,
- all non-`N/A` gates are green,
- `pm-verifier` returned `STATUS: PASS`,
- the outcome is logged.

## Escalation
If a story is not done after 3 fix and verify iterations, stop and ask the user. Do not loop forever.
