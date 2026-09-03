# Artifact consistency (analyze)

A read-only quality and consistency pass across the PM artifacts, run after the plan is drafted and
before decomposition (optionally before sign-off, on larger projects). It finds gaps and
contradictions and **never** fixes them. `/pm-skill:analyze` drives it.

## Read-only contract

Read the artifacts and produce a report. **Never** edit, create, scaffold, or fix anything, not even
logs or state. Offer remediation as suggestions only.

## Inputs (whichever exist)

`docs/constitution.md`, `docs/spec.md`, `docs/plan.md`, `docs/stories/*.md`, `pm/pm-state.json`,
`pm/actors/*.json`, `pm/log.md`. Note in the report any that are absent.

## What to detect

- **Clarifications.** Unresolved `[NEEDS CLARIFICATION]` markers in the spec or plan.
- **Requirement coverage.** Spec requirements (`FR-`/`AC-`) that no story `Covers:`.
- **Story grounding.** Stories that cover no requirement, which is orphan scope.
- **Testability.** Acceptance criteria that are not observable or testable as written.
- **Verification.** Stories missing a concrete verification command; a plan missing real commands.
- **Sign-off.** Missing or inconsistent sign-off across `docs/plan.md`, `pm/log.md`, and
  `pm/pm-state.json`.
- **Constitution alignment.** A plan or story that conflicts with a rule in `docs/constitution.md`.
- **Story metadata.** Missing, malformed, duplicated, or extra-key `pm-meta`; unsafe paths in
  `pm-meta.touches`; in a pre-0.17 story, a visible `Builder` or `Touches` field that disagrees with
  `pm-meta`.
- **Parallel safety.** `[P]` stories with overlapping `pm-meta.touches`, or with blank or unbounded
  scope.
- **Dependencies.** `depends-on` pointing at a missing or invalid story ID; dependency cycles.
- **Gate references.** Stories naming a gate that `docs/plan.md`'s Commands does not list.
- **Risk lenses, declared against actual.** A story whose content looks security-sensitive (auth,
  secrets, untrusted input, I/O, dependencies) but omits `security-auditor` from its `Review lenses`,
  and likewise an architecture-changing story that omits `architecture-reviewer`. Flag any mismatch
  between the declared `Risk` and lenses and the real scope.
- **Terminology drift.** The same concept named differently across spec, plan, and stories.
- **State sanity.** Stale or contradictory `pm/pm-state.json` and `pm/log.md` against the `docs/`
  artifacts; `pm/` state files matched by `.gitignore` or left uncommitted while `docs/` moved on.
- **Team checks.** A *claim conflict*: an actor file whose `current_story` names a story that
  `assignments` maps to a different actor, or two actor files sharing one non-null `current_story`
  (idle and new actors all carry `current_story: null`, so never flag those). `assignments` is a
  story-to-actor map and can only ever show one claimant, so the race surfaces in the actor files;
  compare them against the map. Also a *stale or half-made claim*: an assignment whose actor's own
  file is not on that story (`current_story` null or different). Also an assignment pointing at a
  nonexistent story or actor file; in-flight stories of different actors whose `pm-meta.touches`
  overlap (serialize or re-scope them); an in-flight sequential story without `resolved_builder`, or
  an active parallel entry without `builder`.

## State health (doctor)

`/pm-skill:doctor` runs these against `pm/` when it exists, reporting `OK` or `DRIFT` per check.

- `pm/pm-state.json` parses as JSON.
- `git check-ignore pm/pm-state.json pm/log.md pm/actors/<you>.json` fails, `tmp/` **is** ignored,
  `pm/` has no uncommitted changes older than the last work commit, and `.gitattributes` carries
  `pm/log.md merge=union`.
- Team health: the claim-conflict and stale-claim checks above; every `pm/actors/*.json` parses and
  matches a recent git author (flag orphans from a changed git identity); every in-flight sequential
  story has a valid `resolved_builder` and every active parallel entry a valid `builder`; your own
  actor id is derivable, meaning git `user.email` or `user.name` is set.
- `docs/plan.md`'s Sign-off line agrees with `signed_off` in `pm/pm-state.json`. The v0.9 log is
  append-only and has no Current State block to cross-check.
- `handoff_written` against `updated` in `pm/actors/<you>.json`: flag a stale
  `pm/actors/<you>.HANDOFF.md` (updated is newer) so resume does not trust an outdated briefing.

## Severities

- **CRITICAL.** Blocks safe delivery, or violates the constitution or the sign-off rule.
- **HIGH.** Likely to cause a wrong implementation.
- **MEDIUM.** A quality or coverage gap.
- **LOW.** Clarity, wording, or minor consistency.

## Report format

```
## PM artifact analysis report
| ID | Category | Severity | Location | Finding | Recommendation |
|----|----------|----------|----------|---------|----------------|

## Coverage summary
| Requirement | Covered by stories | Notes |
|-------------|-------------------|-------|

## Unmapped stories
<stories that cover no requirement, each with a note>

## Constitution alignment
<rule by rule: aligned / at-risk / violated, with the evidence>

## Next actions
<ordered, specific remediation suggestions: what to fix and where>
```

## After the report

Present the report without changing any artifact. The user, or the PM in a later non-analysis step,
acts on it. Resolve CRITICAL and HIGH findings before sign-off or before the implementation loop
begins.
