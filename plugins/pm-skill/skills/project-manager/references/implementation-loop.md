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
2. **Gate.** Run the project's deterministic gates yourself: test, lint, and build per
   `review-gates.md`, skipping any that are `N/A`. If a gate fails, go to Fix, step 4, before review.
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
5. **External review (optional).** Only if an external reviewer is explicitly available. Secret-scan
   the exact outgoing diff first: prefer a real scanner when one is installed (`gitleaks`,
   `trufflehog`), otherwise pipe the diff through the bundled value patterns with
   `git diff <range> | node "${CLAUDE_PLUGIN_ROOT}/hooks/lib.mjs" scan`. Quote the path, because
   plugin roots can contain spaces; a non-zero exit means secret-shaped content. If it trips, do
   **not** send code out. Scan values, not labels: a name like `APIClient` is not a secret, and real
   credentials are often lowercase. Then run an independent review, feed the findings back, and fix.
   If no external reviewer is available, **log** that it was skipped. Never silently.
6. **Verify.** Before shipping, dispatch `pm-verifier`, which is read-only, to independently confirm
   the story is shippable. Give it the story file, the `FR-` and `AC-` entries from `docs/spec.md`
   that the story's `Covers:` line names, and the Commands section of `docs/plan.md`. Do not read
   either document whole. Also give it the diff text plus changed paths, the reviewer verdicts, and
   the gate results. It returns `STATUS: PASS | FAIL | UNKNOWN`. **A story may not ship unless STATUS
   is PASS.** `FAIL` returns to Fix, step 4, under the same 3-round bound, then re-verify. `UNKNOWN`
   means you obtain the exact missing evidence it names and re-verify, or escalate to the user. For
   non-trivial work, record `docs/verification/<story-id>.md` and note STATUS, the gate results, and
   the report link under the story's Verification evidence heading. See `references/verification.md`.
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
9. **Document (optional, at the sprint or project boundary, not per story).** Once a sprint's stories
   are merged, you may dispatch `technical-writer` to refresh user-facing docs (README, usage,
   CHANGELOG) and, at project end, produce the completion report at `docs/completion-report.md` from
   `${CLAUDE_PLUGIN_ROOT}/templates/completion-report.md.template`. It writes docs only, never
   source. Log that it ran, or that you skipped it. When a technical-writing standard skill is
   installed, `poteto:technical-writing` for example, pass its `SKILL.md` path in the dispatch so the
   writer applies it.

## Handoff contracts (keep them tight)
- Send `expert-builder` the story file path, and the absolute worktree root when using an isolated
  worktree. It returns status, a diff summary, what it built and tested, and follow-ups.
- Send `codex-builder` the story file path, the absolute worktree root, and the mode. For fix mode,
  also send a contained `tmp/codex-builder/*.md` evidence path. It returns runner and Codex status,
  root cause, the authoritative actual files changed, a summary, tests, the actual short git status,
  the model and version, and retained diagnostic paths on failure.
- To the reviewer, down: the story file path plus the diff text you generated, since the reviewer
  cannot diff. Up: findings plus a verdict.
- To the verifier, down: the story file, the named `FR-` and `AC-` spec entries, the plan's Commands
  section, the diff text, the reviewer verdicts, and the gate results. Up: `STATUS` (PASS, FAIL, or
  UNKNOWN), per-criterion and per-gate evidence, and the action to take.
- You, the PM, run the deterministic gates yourself. Their result is yours, not taken on a subagent's
  word. Never read raw worker transcripts, only their summaries.

## Scope freeze
Once a story starts, its scope is **frozen**. If new requirements appear, stop and run
`/pm-skill:correct-course`: checkpoint the in-flight work, apply the change at the right level, spec
or plan or story, re-sign-off if the change is material, then restart the affected story with fresh
counters. Never drip-feed new asks mid-flight.

## Checkpoints
- Default: sprint-level. Run all stories in a sprint, then pause for the user's review at the sprint
  boundary. A project can configure this to story-level, pausing before each merge, or to fully
  autonomous.
- Always **escalate** immediately for high-risk or large-blast-radius merges, whatever the mode.
- Offer a handoff at natural stops: at a sprint checkpoint, before a long pause, or when the
  session's context is running long, offer `/pm-skill:handoff`. A committed
  `pm/actors/<id>.HANDOFF.md` is what lets the next session skip re-discovery. A bundled SessionStart
  hook re-grounds new and freshly-compacted sessions from `pm/` automatically.
- Checkpoint before compaction. When compaction is imminent, write and commit the actor handoff
  first. After resume, verify its base commit, branch, changed paths, last gate results, and next
  action against repository state before dispatching another writer.

See `review-gates.md` for the severity model and the definition of done.
