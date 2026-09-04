# Artifact consistency (analyze)

A read-only quality and consistency pass across the PM artifacts, run after the plan is drafted and
before decomposition (optionally before sign-off, on larger projects). It finds gaps and
contradictions and **never** fixes them. `/pm-skill:analyze` drives it.

## Read-only contract

Read the artifacts and produce a report. **Never** edit, create, scaffold, or fix anything, not even
logs or state. Offer remediation as suggestions only.

## Inputs (whichever exist)

`docs/constitution.md`, `docs/spec.md`, `docs/plan.md`, `docs/stories/*.md`, `docs/wiki/**`,
`pm/pm-state.json`, `pm/actors/*.json`, `pm/log.md`. Note in the report any that are absent.

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
- **Claim conflicts.** Report two actors on one story, or an actor whose story differs from
  `assignments`. A null `current_story` means idle, never a conflict.
- **Stale claims.** Report assignments without a matching actor position, story, or actor file.
- **Active work.** Report overlapping `pm-meta.touches` between in-flight stories of different
  actors, an in-flight sequential story without `resolved_builder`, and an active parallel entry
  without `builder`.
- **Wiki (only when `docs/wiki/` exists).** An index entry that does not resolve; a page the index
  does not list, or that no other page links to; a plan decision or risk with no decision page; two
  `current` decision pages on one subject (HIGH); a story whose Context cites a concept page marked
  `superseded`. All MEDIUM unless stated.
- **Skeleton (only when `.specdd/` exists).** A story whose `touches` fall outside its specs'
  `Owns` (HIGH); a story criterion with no `Done when` and a `Done when` with no story; a module
  spec missing `Purpose`, `Owns`, or `Done when`; an orphan `.sdd` no story or root spec references
  (LOW). MEDIUM unless stated.

## State health (doctor)

`state-health.md` owns the `OK` or `DRIFT` checks `/pm-skill:doctor` runs against `pm/`.

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
