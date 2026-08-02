# Artifact Consistency (Analyze)

A **read-only** quality and consistency pass across the PM artifacts — after the plan is drafted and
before decomposition (optionally before sign-off, for larger projects). It finds gaps and
contradictions; it **never** fixes them. Driven by `/pm-skill:analyze`.

## Read-only contract
Read the artifacts; produce a report. **Never** edit, create, scaffold, or fix anything — not even
logs or state. Offer remediation as *suggestions* only. If the artifact set is large, delegate the
reading to a read-only subagent (e.g. `codebase-analyst`) and take back only the findings.

## Inputs (whichever exist)
`docs/constitution.md`, `docs/spec.md`, `docs/plan.md`, `docs/stories/*.md`, `pm/pm-state.json`,
`pm/actors/*.json`, `pm/log.md`. Note in the report any that are absent.

## What to detect
- **Clarifications:** unresolved `[NEEDS CLARIFICATION]` markers in the spec or plan.
- **Requirement coverage:** spec requirements (`FR-`/`AC-`) with **no** story that `Covers:` them.
- **Story grounding:** stories that cover **no** requirement (orphan scope).
- **Testability:** acceptance criteria that are not observable/testable as written.
- **Verification:** stories missing a concrete verification command; the plan missing real commands.
- **Sign-off:** missing or inconsistent sign-off across `docs/plan.md`, `pm/log.md`, and
  `pm/pm-state.json`.
- **Constitution alignment:** plan/stories that conflict with a rule in `docs/constitution.md`.
- **Parallel safety:** `[P]` stories with **overlapping** `Touches`; `[P]` stories with blank `Touches`.
- **Dependencies:** `depends-on` pointing at a missing/invalid story ID; dependency cycles.
- **Gate references:** stories naming a gate not listed in `docs/plan.md`'s Commands.
- **Risk lenses (declared vs actual):** a story whose content looks security-sensitive (auth, secrets,
  untrusted input, I/O, deps) but is not marked `Security-sensitive: yes` or omits `security-auditor`
  from its `Review lenses`; likewise architecture-changing stories not marked `Architecture-sensitive`
  or missing `architecture-reviewer`. Flag any mismatch between the declared `Risk`/lenses and the scope.
- **Terminology drift:** the same concept named differently across spec, plan, and stories.
- **State sanity:** stale or contradictory `pm/pm-state.json` / `pm/log.md` vs the `docs/` artifacts;
  `pm/` state files matched by `.gitignore` or left uncommitted while `docs/` moved on.
- **Team checks:** a **claim conflict** — an actor file whose `current_story` names a story that
  `assignments` maps to a *different* actor, or two actor files sharing one **non-null**
  `current_story` (idle/new actors all carry `current_story: null` — never flag those)
  (`assignments` is a story→actor map, so it can only ever show one claimant — the race surfaces
  in the actor files; compare them against the map); a **stale or half-made claim** — an
  assignment whose actor's own file is *not* on that story (`current_story` null or different);
  an assignment pointing at a nonexistent story or actor file; in-flight stories of **different
  actors** whose `Touches` overlap (serialize or re-scope them).

## Severities
- **CRITICAL** — blocks safe delivery, or violates the constitution or the sign-off rule.
- **HIGH** — likely to cause a wrong implementation.
- **MEDIUM** — a quality or coverage gap.
- **LOW** — clarity, wording, or minor consistency.

## Report format
```
## PM Artifact Analysis Report
| ID | Category | Severity | Location | Finding | Recommendation |
|----|----------|----------|----------|---------|----------------|

## Coverage Summary
| Requirement | Covered by stories | Notes |
|-------------|-------------------|-------|

## Unmapped Stories
<stories that cover no requirement, each with a note>

## Constitution Alignment
<rule by rule: aligned / at-risk / violated, with the evidence>

## Next Actions
<ordered, specific remediation suggestions — what to fix and where>
```

## After the report
This is a gate of judgement, not automation: present the report, then let the user (or the PM in a
later, non-analysis step) act on it. Resolve **CRITICAL** and **HIGH** findings before sign-off, or
before the implementation loop begins.
