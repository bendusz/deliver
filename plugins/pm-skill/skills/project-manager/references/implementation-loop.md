# Implementation loop

Run each story through this loop. **You orchestrate; you do not write code.** Take only summaries
back, never raw transcripts, to protect your context.

The integration branch is the project's default branch, `main` for example, that the scaffold commit
landed on. You cut every story branch from it and merge each story back into it.

Before the first sprint on an unfamiliar or freshly-cloned project, run `/pm-skill:doctor` to confirm
the toolchain installs and the gates actually run, so stories do not fail mid-build on environment
gaps.

## Sequential or parallel? Decide at the start of each sprint
- **Parallel fast path.** If the sprint has 2 or more build-ready `[P]` stories whose `depends-on`
  are merged and whose Touches do not overlap, and `git worktree` works, build them at once in
  isolated worktrees and integrate them serially. Load `parallel-execution.md`.
- **Sequential, the default.** Otherwise run the per-story cycle below, one story at a time.

Parallel is opt-in and best-effort; on any worktree trouble, fall back to sequential. Either way the
same deterministic gates and review panel judge every story.

## Per-story cycle
0. **Ready, route, and branch.** Confirm the story is build-ready: testable criteria, self-contained
   context that names authoritative sources and any completeness-sensitive inventory method, a
   verification command, and a Builder. See `decomposition.md`; if it is not ready, fix the story
   first. A story created before v0.13 needs its `pm-meta` comment added and committed first; see
   `references/migrations.md`. Ensure the working tree is clean before you write route state or the
   log. If it holds unrelated changes, stop and ask, per Repository safety. Resolve `Builder: auto`
   now:
   - choose `codex-builder` only for a precise outcome with bounded Touches, enough local context,
     no open architecture decision, and an exact verification command;
   - choose `expert-builder` for broad features, cross-cutting work, uncertain scope, or anything
     that needs wide repo context or design judgement;
   - if Codex is unavailable, `auto` falls back to `expert-builder`. An explicit
     `Builder: codex-builder` is a readiness blocker and must not silently switch workers.

   The resolved builder owns the initial build. Now claim and route the story in one commit on the
   integration branch, following the claim procedure in `logging-and-state.md`: pull or rebase the
   integration branch, confirm no other actor holds the story in `assignments`, and commit the
   shared state, your actor file, and the log together. Then create and check out the story branch
   `pm/S<sprint>-<n>-<slug>`, where all of this story's work happens. Resume and the session hook
   read your position from the actor file, and the loop bounds below are enforced from the persisted
   counters rather than from memory, so everything survives a session loss mid-story.
1. **Build.** Optionally, for clear acceptance criteria, first dispatch `test-engineer` to write the
   acceptance tests for TDD red, then tell the builder those tests already exist: it must make them
   pass and add only *further* coverage, not rewrite them. Dispatch the persisted `resolved_builder`.
   `expert-builder` receives the story file path and, when operating outside the main checkout, the
   absolute worktree root. `codex-builder` receives the story path, the absolute worktree root, and
   `Mode: build`; its bundled runner supplies the fixed sandbox, the isolated shell environment, and
   the structured output contract. Run the runner's quota-free `--preflight` first when readiness has
   not already been established. The builder edits the working tree; you own commits and all other
   git changes.

   After every writer run, derive the cumulative changed paths from repository state, not from the
   agent summary: combine `git diff --name-only --diff-filter=ACDMRTUXB HEAD --` with
   `git ls-files --others --exclude-standard`, then sort and deduplicate. Every path must equal an
   entry in the story's authoritative `pm-meta.touches` or sit beneath an allowed directory entry.
   For Codex, cross-check this set with the runner's snapshot-derived `actual_files_changed`; neither
   source may omit a path present in the other. On any out-of-scope, protected, or unexplained path,
   **stop** before gates or review and preserve the working tree for inspection. Keep the cumulative
   set for diffing and ship. If the work is broader than its brief, do not keep a narrow Codex worker
   on the wrong task: update `resolved_builder` to `expert-builder` and append the reason to the log
   in the same coordination commit before routing the retry. If a builder returns *blocked* or fails,
   retry up to **2** times with clarification, incrementing `current_story_retries` in
   `pm/actors/<you>.json` per retry. The **cap** counts retries a previous session already spent, and
   switching workers does not reset it. Then escalate to the user.
2. **Gate.** The gates are the project's actual `test`, `lint`, and `build` commands as recorded in
   `docs/plan.md` and `AGENTS.md`; any the project does not have are `N/A` and skipped. Run them
   **yourself**, here after the build and again after every fix, and never take a subagent's word
   that they pass. If a gate fails, go to Fix, step 4, before review.
3. **Review.** Re-derive and scope-check the cumulative changed paths as in step 1. Produce the diff
   yourself and pass it to the reviewers inline, since they have no Bash and cannot diff. Diff **only**
   those repository-derived paths, for example
   `git add -N -- <changed paths> && git diff -- <changed paths>`. **Never** run `git add -A`, which
   would sweep in unrelated work. Dispatch the review **panel** per the risk triggers in
   `review-gates.md`: always `code-integrity-reviewer`, plus any further lenses it selects, such as
   `architecture-reviewer` for structural changes, which also gets the plan's Architecture section.
   Each lens gets the story file plus that diff text and returns severity-graded findings
   (`block`, `major`, `minor`) and a `PASS`, `CONCERNS`, or `FAIL` verdict. Aggregate them.
4. **Fix.** First **triage** the panel's findings: dedupe across lenses and drop false positives and
   out-of-scope items, so you forward only real `block` and `major` findings. Prefer `codex-builder`
   for a localized fix with known implicated paths and a concrete reproducer, even when
   `expert-builder` built the story. Write a runtime-only brief at
   `tmp/codex-builder/<story-id>-round-<n>.md` holding the accepted findings or failing command, the
   relevant output, the implicated paths, the exclusions, and the verification command, then dispatch
   Codex with `Mode: fix` and that evidence path. Use `expert-builder` when the finding is
   architectural, cross-cutting, or ambiguous, or when Codex says the fix is broader than the brief.
   If Codex is unavailable for an opportunistic fix, use `expert-builder`; an unavailable run earns
   no extra retries and resets neither loop counter. If a *gate* is failing rather than a review
   finding, or the builder returns the same failing result on a second attempt with no meaningful
   progress, dispatch `debugger` first to root-cause it, giving it the failing command's output, the
   diff, and the implicated paths. Then put its fix plan into the evidence brief for `codex-builder`
   when the fix is localized, or forward it to `expert-builder` when it is broad, instead of a blind
   retry. `debugger` is read-only; a builder applies the fix. After each fix, re-run the gates and
   regenerate the cumulative story diff for re-review, **up to 3 rounds**. Increment
   `current_story_rounds` in `pm/actors/<you>.json` as each round starts; the **cap** counts rounds a
   previous session already spent. If it is still failing, **escalate** to the user.
5. **External review (optional).** `/pm-skill:codex-review` owns it, including the secret scan on any
   code that leaves the machine. If you skip it, **log** that. Never silently.
6. **Verify.** Once the gates are green and no `block` or `major` finding is still open, dispatch
   `pm-verifier`, which is read-only, with the inputs its agent file lists. It returns
   `STATUS: PASS | FAIL | UNKNOWN`. PASS is the only status that permits shipping. FAIL
   returns to Fix, step 4, within the persisted 3-round cap, then re-verify; UNKNOWN means you obtain
   the exact evidence it named and re-verify, or escalate to the user. `references/verification.md`
   holds the running-app evidence rule and where the durable report goes.
7. **Ship.** With gates green, no open `block` or `major`, and `pm-verifier` `PASS`, commit **only**
   this story's cumulative authoritative paths to the story branch. Sync first: pull or rebase the
   integration branch, and if its tip moved after your gates ran, re-gate on the merged result before
   merging. Then integrate:
   - **Local by default.** Check out the integration branch and `--no-ff` merge the story branch with
     a PR-style message.
   - **Remote PR only if the user has explicitly asked for pushes or PRs**, and `gh auth status`
     succeeds, and a GitHub remote exists. Then push the branch, open a PR, and merge it.

   **Never** push to a remote without an explicit request.

   PR and merge message format: title `type(scope): subject`, imperative, no trailing period. Body
   sections in this order, dropping any that are empty: `## Why` (intent and why this approach),
   `## Scope` (facts from the diff, real paths and symbols, what is in and out), `## Tradeoffs` (real
   choices only), `## Blast radius` (who and what the change touches, and why it is safe or risky),
   `## Verification` (each check you ran and its outcome, not just the command). No `## Summary` or
   `## Test plan` boilerplate.
8. **Log.** Append the story outcome to `pm/log.md` as an author-prefixed entry, update
   `pm/actors/<you>.json`, and remove the story's entry from `assignments` in `pm/pm-state.json`.
   Clear `resolved_builder` after recording the outcome, then **commit** this `pm/` state update
   alongside the ship, on the integration branch right after the merge, so the pushed repo carries
   the current resume point and the released claim. Never write secrets into `pm/`.
9. **Document (optional, at the sprint or project boundary, not per story).** See
   `references/documentation.md`.

Scope changes go through `/pm-skill:correct-course`, which owns the scope-freeze rule. Checkpoint
policy, escalation triggers, and when to offer a handoff live in `planning-and-signoff.md`.

## Definition of done (a story)
A story is done when all of these hold:
- every acceptance criterion is met,
- no open `block` or `major` findings across all selected review lenses,
- all non-`N/A` gates are green,
- `pm-verifier` returned `STATUS: PASS`,
- the outcome is logged.

## Escalation
Stop and ask the user when a story is still not done after 3 fix and verify rounds, when a builder
has spent its 2 retries, or when a gate keeps failing after `debugger` has root-caused it. Do not
loop forever. `review-gates.md` holds the severity model and the lens selection.
