# Implementation loop

Run each story through the states below. Persisted counters, not memory, bound this loop, so a lost
session resumes mid-story. The integration branch is the default branch the scaffold commit landed
on. Cut every story branch from it, merge each back. Run `/pm-skill:doctor` before the first sprint
on a fresh or unfamiliar clone.

**Parallel.** With 2 or more build-ready `[P]` stories whose `Depends on` are merged and whose
`pm-meta.touches` do not overlap, and `git worktree` working, load `parallel-execution.md`; it owns
every difference, including the fallback here. Otherwise take one story at a time.

### 0. Ready, then claim
Confirm the story is build-ready against `decomposition.md`; fix an unready story first. A pre-0.13
story needs its `pm-meta` added and committed first, per `migrations.md`. The working tree must be
clean before you write route state or the log; unrelated changes mean stop and ask.

Resolve a `pm-meta` builder of `auto` now, by `decomposition.md`'s rules for the field. Without Codex
it falls back to `expert-builder`. An explicit `codex-builder` is a readiness blocker and never
switches workers silently. That builder owns the initial build.

**Claim.** Pull or rebase the integration branch and confirm no other actor holds the story in
`assignments`. One commit on that branch sets `assignments[story] = you`, records your position in
`pm/actors/<you>.json` (story, status, branch, `resolved_builder`, counters at 0), and appends the
route decision to `pm/log.md`. Push that commit only under a standing push permission, then create
and check out `pm/S<sprint>-<n>-<slug>`.

### 1. Build, then gate
Optionally dispatch `test-engineer` first for TDD-red acceptance tests, then tell the builder they
exist: make them pass, add only *further* coverage, never rewrite. Dispatch the persisted
`resolved_builder` with the inputs its agent file lists, adding the absolute worktree root whenever
it works outside the main checkout, and run Codex's quota-free `--preflight` first when readiness is
not established. Builders edit the working tree; you own every git command.

**Scope check, after every writer run.** Derive the cumulative changed paths from the repository,
never the summary: `git diff --name-only --diff-filter=ACDMRTUXB HEAD --` plus
`git ls-files --others --exclude-standard`, sorted and deduplicated. Each must equal a
`pm-meta.touches` entry or sit under an allowed directory entry. For Codex, neither your list nor the
runner's `actual_files_changed` may omit a path the other holds. Any out-of-scope, protected, or
unexplained path **stops** the story before gates or review, working tree preserved.

Work broader than its brief gets re-routed: set `resolved_builder` to `expert-builder` and log the
reason in the same coordination commit before the retry. A blocked or failed builder earns
**2** retries with clarification, incrementing `current_story_retries`; that **cap** counts earlier
sessions' retries, and switching workers does not reset it. Then escalate.

### 2. Gate, then review or fix
The gates are the project's actual `test`, `lint`, and `build` from `docs/plan.md` and `AGENTS.md`;
whatever it lacks is `N/A`. Run them **yourself** after the build and after every fix, never on a
subagent's word. A failing gate goes to Fix before review.

### 3. Review, then fix or verify
Re-derive and scope-check the paths, then produce the diff yourself, since reviewers have no Bash:
`git add -N -- <changed paths> && git diff -- <changed paths>`, **never** `git add -A`. Dispatch the
panel per `review-gates.md`'s risk triggers: always `code-integrity-reviewer`, plus the lenses they
select; `architecture-reviewer` also gets the plan's Architecture section. Every lens gets the story
file and that diff text. Aggregate their findings; any open `block` or `major` goes to Fix.

### 4. Fix, then gate
**Triage first**, per `review-gates.md`: dedupe, drop false positives and out-of-scope items,
forward only real `block` and `major` findings. A localized fix with known paths and a reproducer
goes to `codex-builder`, even where `expert-builder` built the story. Write the runtime-only brief
`review-gates.md` specifies to `tmp/codex-builder/<story-id>-round-<n>.md`, then
dispatch `Mode: fix` and that path. Architectural, cross-cutting, or ambiguous findings go to
`expert-builder`, as does any fix Codex calls broader than its brief. Without Codex it takes the fix
too; an unavailable run earns no extra retries and resets neither counter.

When a *gate* fails, or a builder repeats a failure with no progress, dispatch the read-only
`debugger` first with the story path, the failing output, the diff, and the implicated paths. Its
plan goes into the Codex brief for a localized fix, or to `expert-builder` for a broad one, never
into a blind retry. A builder applies it.

Each round re-runs the gates and regenerates the cumulative diff for re-review, **up to 3 rounds**.
Increment `current_story_rounds` as each starts; that **cap** counts earlier sessions' rounds. Still
failing, **escalate**.

### 5. Verify, then ship or fix
External review is optional; `/pm-skill:codex-review` owns it. **Log** a skip. With the gates green
and no `block` or `major` open, dispatch the read-only `pm-verifier` with the inputs its agent file
lists. `PASS` alone permits shipping. `FAIL` returns to Fix inside the persisted 3-round cap,
then re-verify. `UNKNOWN` means you obtain the evidence it named and re-verify, or escalate.
`verification.md` holds the running-app evidence rule and the durable report's home.

### 6. Ship, then log
Commit **only** the story's cumulative authoritative paths to its branch. Pull or rebase the
integration branch, and re-gate on the merged result if its tip moved after your gates ran. Then
check it out and `--no-ff` merge the story branch. **Never** push without an explicit request.
`environment.md` owns the opt-in remote PR path, `documentation.md` the merge and PR message format.

### 7. Log, then take the next story
Append the outcome to `pm/log.md` as an author-prefixed entry, update `pm/actors/<you>.json`, clear
`resolved_builder`, and **release** the claim by removing the story from `assignments`. Commit that
`pm/` update on the integration branch right after the merge. Never write secrets into `pm/`. With a
wiki, dispatch `librarian ingest` over the shipped story and its verification report, and `lint` at a
sprint boundary, per `knowledge.md`.
`documentation.md` covers user-facing docs at a sprint or project boundary, never per story.

A story is done only with every criterion met, no open `block` or `major`, green gates, a
`pm-verifier` `PASS`, and the outcome logged. `/pm-skill:correct-course` owns scope changes and the
scope freeze, `planning-and-signoff.md`
checkpoint policy, escalation triggers, and handoff timing, and `review-gates.md` the severity model
and lens selection.
