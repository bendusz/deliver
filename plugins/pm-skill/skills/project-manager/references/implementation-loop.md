# Implementation loop

Run each story through the states below; persisted counters, not memory, bound them. The integration
branch is the default branch the scaffold commit landed on; cut every story branch from it and merge
each back. Run `/pm-skill:doctor` before the first sprint on a fresh or unfamiliar clone.

**Parallel.** With 2 or more build-ready `[P]` stories and `git worktree` working, load
`parallel-execution.md`; it owns the batch conditions, every difference, and the fallback here.
Otherwise take one story at a time.

### 0. Ready, then claim
Confirm the story is build-ready against `decomposition.md`'s readiness section and checklist
template; fix an unready story first. A pre-0.13 story needs `pm-meta` added and committed first,
per `migrations.md`. The working tree must be clean before you write route state or the log;
unrelated changes mean stop and ask.

Resolve a `pm-meta` builder of `auto` now, by `decomposition.md`'s rules for the field; without
Codex it falls back to `expert-builder`. An explicit `codex-builder` is a readiness blocker and
never switches workers silently.

**Claim.** Pull or rebase the integration branch and confirm no other actor holds the story in
`assignments`. One commit on that branch sets `assignments[story] = you`, records your position and
counters at 0 in `pm/actors/<you>.json`, and appends the route decision to `pm/log.md`. Push it only
under a standing push permission, then create and check out `pm/S<sprint>-<n>-<slug>`.

### 1. Build, then gate
Optionally dispatch `test-engineer` first for TDD-red acceptance tests; the builder makes them pass
and adds only *further* coverage, never rewriting them. Dispatch the persisted `resolved_builder`
with the inputs its agent file lists, plus the absolute repository or worktree root for every
`codex-builder` and for `expert-builder` outside the main checkout. Run Codex's quota-free
`--preflight` first when readiness is not established. Builders edit the working tree; you own every
git command.

**Scope check, after every writer run.** Derive the cumulative changed paths from the repository,
never the summary: `git diff --name-only --diff-filter=ACDMRTUXB HEAD --` plus
`git ls-files --others --exclude-standard`, sorted and deduplicated. Each must match a
`pm-meta.touches` entry, file or directory root, and for Codex neither your list nor the runner's
`actual_files_changed` may omit a path the other holds. Any out-of-scope, protected, or unexplained
path **stops** the story before gates or review, working tree preserved.

Work broader than its brief re-routes to `expert-builder`: set `resolved_builder` and log the reason
in the same coordination commit before the retry. A blocked or failed builder earns **2** retries
with clarification, incrementing `current_story_retries`; that **cap** spans sessions and a worker
switch does not reset it. Then escalate.

### 2. Gate, then review or fix
The gates are the project's actual `test`, `lint`, and `build` from `docs/plan.md` and `AGENTS.md`;
whatever it lacks is `N/A`. Run them **yourself** after the build and after every fix, never on a
subagent's word. A failing gate loads `fix-loop.md`.

### 3. Review, then fix or verify
Re-derive and scope-check the paths, then produce the diff yourself, since reviewers have no Bash:
`git add -N -- <paths> && git diff -- <paths>`, **never** `git add -A`. Dispatch the panel per
`review-gates.md`: always `code-integrity-reviewer`, plus the lenses its risk triggers select, and
`architecture-reviewer` also gets the plan's Architecture section. Every lens gets the story file and
that diff text. Aggregate the lenses' findings; any open `block` or `major` loads `fix-loop.md`.

### 4. Fix
`fix-loop.md` owns this state.

### 5. Verify, then ship or fix
External review is optional; `/pm-skill:codex-review` owns it. **Log** a skip. With the gates green
and no `block` or `major` open, dispatch the read-only `pm-verifier` with the inputs its agent file
lists. `PASS` alone permits shipping. `FAIL` loads `fix-loop.md`, then re-verify. `UNKNOWN` means you
obtain the evidence it named and re-verify, or escalate. Load `verification.md` only when a criterion
needs the running app or the story needs a durable report.

### 6. Ship, then log
Commit **only** the story's cumulative authoritative paths to its branch. Pull or rebase the
integration branch, and re-gate on the merged result if its tip moved after your gates ran. Then
check it out and `--no-ff` merge the story branch. **Never** push without an explicit request.
`environment.md` owns the opt-in remote PR path.

**Merge and PR message format.** Title `type(scope): subject`, imperative, no trailing period. Body
sections in this order, dropping any that are empty: `## Why` (intent and why this approach),
`## Scope` (facts from the diff, real paths and symbols, what is in and out), `## Tradeoffs` (real
choices only), `## Blast radius` (who and what the change touches, and why it is safe or risky),
`## Verification` (every command and its result). No `## Summary` or `## Test plan` boilerplate.

### 7. Log, then take the next story
Append the outcome to `pm/log.md` as an author-prefixed entry, update `pm/actors/<you>.json`, clear
`resolved_builder`, and **release** the claim by removing the story from `assignments`. Commit that
`pm/` update on the integration branch right after the merge. With a wiki, dispatch
`librarian ingest` per `knowledge.md`, and `lint` at the sprint boundary. `documentation.md` owns
user-facing docs, at a sprint or project boundary and never per story.

A story is done only with every criterion met, no open `block` or `major`, green gates, a
`pm-verifier` `PASS`, and the outcome logged. `/pm-skill:correct-course` owns scope changes and the
scope freeze, `planning-and-signoff.md` checkpoints, escalation triggers, and handoff timing,
`fix-loop.md` the fix rounds and their escalation, and `review-gates.md` severities and lens
selection.
