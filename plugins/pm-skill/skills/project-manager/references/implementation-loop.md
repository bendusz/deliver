# Implementation Loop

Run each story through this loop. **You orchestrate; you do not write code.** Take only summaries
back — never raw transcripts (protect your context).

The **integration branch** is the project's default branch (e.g. `main`) that the scaffold commit
landed on. You cut every story branch from it and merge each story back into it.

**Before the first sprint on an unfamiliar or freshly-cloned project, run `/pm-skill:doctor`** —
confirm the toolchain installs and the gates actually run, so stories don't fail mid-build on
environment gaps.

## Sequential or parallel? (decide at the start of each sprint)
- **Parallel fast path** — if the sprint has **≥2** build-ready `[P]` stories whose `depends-on` are
  merged and whose **Touches** don't overlap, and `git worktree` works: build them at once in
  isolated worktrees and integrate them serially. Load `parallel-execution.md`.
- **Sequential (default)** — otherwise, run the per-story cycle below, one story at a time.

Parallel is opt-in and best-effort; on any worktree trouble, fall back to sequential. Either way each
story is judged by the **same** deterministic gates and review panel below.

## Per-story cycle
0. **Ready, route & branch.** Confirm the story is **build-ready** with testable criteria,
   self-contained context that names authoritative sources and any completeness-sensitive inventory
   method, a verification command, and Builder. See `decomposition.md`; if not, fix the story first.
   For a story created before v0.13, add its `pm-meta` comment, verify it matches the
   visible Builder and Touches, and commit that story migration before dispatch. Ensure the working
   tree is **clean before writing route state or the log** (if it
   has unrelated changes, stop and ask — see Repository safety). Resolve `Builder: auto` now:
   - choose `codex-builder` only for a precise outcome with bounded Touches, enough local context,
     no open architecture decision, and an exact verification command;
   - choose `expert-builder` for broad features, cross-cutting work, uncertain scope, or anything
     that needs wide repo context or design judgement;
   - if Codex is unavailable, `auto` falls back to `expert-builder`; an explicit
     `Builder: codex-builder` is a readiness blocker and must not silently switch workers.
   The resolved builder owns the initial build. **Claim and route the story in one commit on the
   integration branch:** pull/rebase it first,
   confirm no other actor holds the story in `assignments` (if one does, pick another story or
   resolve with them), then set `assignments["<story-id>"] = <you>` in `pm/pm-state.json` **and
   record your position** in `pm/actors/<you>.json` — `current_story`, `current_story_status`
   (`building`), `branch` (the planned story branch name), `resolved_builder`, `next`, `updated`,
   and `current_story_rounds`/`current_story_retries` reset to `0`; append the resolved builder and
   reason to `pm/log.md`; then commit **all three files together**. (A claim committed only to a
   story branch is invisible to teammates'
   pull-integration-and-check flow, and an assignment without the matching actor position reads
   as a stale claim to doctor/analyze.) Push it only under the user's standing push permission —
   **never push without an explicit request** (hard rule); without pushes, tell the user the
   claim stays local-only until pushed. Then create and check out the story branch
   `pm/S<sprint>-<n>-<slug>` — all of this story's work happens there. Resume and the session
   hook read position from the actor file (the shared state no longer carries it), and the loop
   bounds below are enforced from the persisted counters, not from memory, so everything
   survives a session loss mid-story.
1. **Build.** *(Optional, for clear acceptance criteria: first dispatch `test-engineer` to write the
   acceptance tests — TDD red. Then tell the builder those tests already exist: it must make them
   pass and add only *further* coverage, not rewrite them.)* Dispatch the persisted
   `resolved_builder`. `expert-builder` receives the story file path and, when operating outside the
   main checkout, the absolute worktree root. `codex-builder` receives the story path, absolute
   worktree root, and `Mode: build`; its bundled runner supplies the fixed sandbox, isolated shell
   environment, and structured output contract. Run the runner's quota-free `--preflight` first
   when readiness has not already been established. The builder edits the working tree; you own
   commits and all other git changes.
   **After every writer run, derive the cumulative changed paths from repository state, not the
   agent summary:** combine `git diff --name-only --diff-filter=ACDMRTUXB HEAD --` with
   `git ls-files --others --exclude-standard`, then sort and deduplicate. Every path must equal an
   entry in the story's authoritative `pm-meta.touches` or sit beneath an allowed directory entry.
   For Codex, cross-check this set with the runner's snapshot-derived `actual_files_changed`; neither
   source may omit a path present in the other. On any out-of-scope, protected, or unexplained path,
   stop before gates or review and preserve the working tree for inspection. Keep the cumulative set
   for diffing and ship. If the work is broader than its brief, do not keep a
   narrow Codex worker on the wrong task: update `resolved_builder` to `expert-builder` and append
   the reason to the log in the same coordination commit before routing the retry. If a builder returns
   *blocked* or fails, retry up to **2** times with clarification,
   incrementing `current_story_retries` in `pm/actors/<you>.json` per retry (the cap counts retries
   already spent by a previous session, and switching workers does not reset it), then escalate to
   the user.
2. **Gate.** Run the project's deterministic gates yourself (test/lint/build per
   `review-gates.md`; skip any that are `N/A`). If a gate fails, go to Fix (step 4) before review.
3. **Review.** Re-derive and scope-check the cumulative changed paths as in step 1. Produce the diff
   yourself and pass it to the reviewers inline — they have no Bash and cannot diff. Diff **only
   those repository-derived paths**, e.g.
   `git add -N -- <changed paths> && git diff -- <changed paths>` — **never `git add -A`** (that
   would sweep in unrelated work). Dispatch the **review panel** per the risk triggers in
   `review-gates.md`: always `code-integrity-reviewer`, plus any further lenses it selects (e.g.
   `architecture-reviewer` for structural changes — also give it the plan's Architecture section).
   Each lens gets the story file + that diff text and returns severity-graded findings
   (`block`/`major`/`minor`) and a `PASS`/`CONCERNS`/`FAIL` verdict; aggregate them.
4. **Fix.** First **triage** the panel's findings — dedupe across lenses and drop false positives /
   out-of-scope items, so you forward only real `block`/`major` findings. Prefer `codex-builder`
   for a localized fix with known implicated paths and a concrete reproducer, even when
   `expert-builder` built the story. Write a runtime-only brief at
   `tmp/codex-builder/<story-id>-round-<n>.md` containing the accepted findings or failing command,
   relevant output, implicated paths, exclusions, and verification command; dispatch Codex with
   `Mode: fix` and that evidence path. Use `expert-builder` when the finding is architectural,
   cross-cutting, ambiguous, or Codex says the fix is broader than the brief. If Codex is unavailable
   for an opportunistic fix, use `expert-builder`; an unavailable run does not earn extra retries or
   reset either loop counter. If a **gate** is failing (rather than a review finding), or the builder returns
   the same failing result on a second attempt (no meaningful progress), dispatch `debugger` first to
   root-cause it — give it the failing command's output, the
   diff, and the implicated paths. Then put its fix plan into the evidence brief for
   `codex-builder` when localized, or forward it to `expert-builder` when broad, instead of a blind
   retry (`debugger` is read-only; a builder applies the fix). After each fix, **re-run the gates
   and regenerate the cumulative story diff for re-review**, **up to 3 rounds** — increment `current_story_rounds`
   in `pm/actors/<you>.json` as each round starts; the cap counts rounds already spent by a previous
   session — and if still failing, **escalate to the user**.
5. **External review (optional).** Only if an external reviewer is **explicitly available**:
   secret-scan the **exact outgoing diff** first — prefer a real scanner when one is installed
   (`gitleaks`, `trufflehog`); otherwise pipe the diff through the bundled value patterns:
   `git diff <range> | "${CLAUDE_PLUGIN_ROOT}/hooks/lib.sh" scan` (quote the path — plugin roots
   can contain spaces; non-zero exit = secret-shaped content). If it trips, do **not** send code out. (Scan values, not labels — a name like
   `APIClient` is not a secret, and real credentials are often lowercase.) Then an independent review → feed findings back → fix. If no
   external reviewer is available, **log that it was skipped** — never silently.
6. **Verify.** Before shipping, dispatch `pm-verifier` (read-only) to independently confirm the story
   is shippable — give it the story file, `docs/spec.md`/`docs/plan.md`, the diff text + changed paths,
   the reviewer verdicts, and the gate results. It returns `STATUS: PASS | FAIL | UNKNOWN`. **A story
   may not ship unless STATUS is PASS.** `FAIL` → back to **Fix** (step 4, same ≤3-round bound), then
   re-verify; `UNKNOWN` → obtain the exact missing evidence it names and re-verify, or escalate to the
   user. For non-trivial work, record `docs/verification/<story-id>.md`. See `references/verification.md`.
7. **Ship.** With gates green, no open `block`/`major`, and `pm-verifier` `PASS`, commit **only this
   story's cumulative authoritative paths** to the story branch. **Sync first:** pull/rebase the integration branch; if its
   tip moved after your gates ran, re-gate on the merged result before merging. Then integrate:
   - **Local by default** → check out the integration branch and `--no-ff` merge the story branch
     with a PR-style message.
   - **Remote PR only if the user has explicitly asked for pushes/PRs** *and* `gh auth status`
     succeeds *and* a GitHub remote exists → push the branch, open a PR, and merge it.
   **Never push to a remote without an explicit request** (hard rule).
   **PR / merge message format.** Title `type(scope): subject` (imperative, no trailing period).
   Body sections in this order, dropping any that are empty: `## Why` (intent and why this
   approach), `## Scope` (facts from the diff — real paths and symbols, what is in and out),
   `## Tradeoffs` (real choices only), `## Blast radius` (who and what the change touches and why
   it is safe or risky), `## Verification` (each check you ran and its outcome, not just the
   command). No `## Summary` or `## Test plan` boilerplate.
8. **Log.** Append the story outcome to `pm/log.md` (author-prefixed entry), update
   `pm/actors/<you>.json`, and **remove the story's entry from `assignments`** in
   `pm/pm-state.json`; clear `resolved_builder` after recording the outcome — then **commit this
   `pm/` state update alongside the ship** (on the
   integration branch, right after the merge), so the pushed repo carries the current resume point
   and the released claim. Never write secrets into `pm/`.
9. **Document (optional — at the sprint/project boundary, not per story).** Once a sprint's stories
   are merged, you may dispatch `technical-writer` to refresh user-facing docs (README, usage,
   CHANGELOG) and, at project end, produce the completion report at `docs/completion-report.md` from
   `${CLAUDE_PLUGIN_ROOT}/templates/completion-report.md.template`. It writes docs only — never
   source. Log that it ran, or that you skipped it. When a technical-writing standard skill is
   installed (for example `poteto:technical-writing`), pass its `SKILL.md` path in the dispatch so
   the writer applies it.

## Handoff contracts (keep them tight)
- Send `expert-builder` the story file path and the absolute worktree root when using an isolated
  worktree. It returns status, files changed, a diff summary, what it built and tested, and follow-ups.
- Send `codex-builder` the story file path, absolute worktree root, and mode. For fix mode, also
  send a contained `tmp/codex-builder/*.md` evidence path. It returns runner and Codex status, root
  cause, authoritative actual files changed, summary, tests, actual short git status, model/version,
  and retained diagnostic paths on failure.
- **To the reviewer — down:** the story file path + the diff **text you generated** (the reviewer
  can't diff). **up:** findings + verdict.
- **To the verifier — down:** the story file + `docs/spec.md`/`docs/plan.md` + the diff text + the
  reviewer verdicts + the gate results. **up:** `STATUS` (PASS/FAIL/UNKNOWN) + per-criterion/gate
  evidence + the action to take.
- **You (the PM):** run the deterministic gates yourself — their result is yours, not taken on a
  subagent's word. Never read raw worker transcripts; only their summaries.

## Scope freeze
Once a story starts, its scope is **frozen**. If new requirements appear, stop and run
`/pm-skill:correct-course`: checkpoint the in-flight work, apply the change at the right altitude
(spec / plan / story), re-sign-off if the change is material, then restart the affected story with
fresh counters. Never drip-feed new asks mid-flight.

## Checkpoints
- **Default: sprint-level.** Run all stories in a sprint, then pause for the user's review at the
  sprint boundary. (Configurable per project to *story-level* — pause before each merge — or
  *fully autonomous*.)
- **Always escalate immediately** for high-risk or large-blast-radius merges, regardless of mode.
- **Offer a handoff at natural stops.** At a sprint checkpoint, before a long pause, or when the
  session's context is running long, offer `/pm-skill:handoff` — a committed
  `pm/actors/<id>.HANDOFF.md` is what lets the next session skip re-discovery. (A bundled
  SessionStart hook re-grounds new and freshly-compacted sessions from `pm/` automatically.)
- **Checkpoint before compaction.** When compaction is imminent, write and commit the actor handoff
  first. After resume, verify its base commit, branch, changed paths, last gate results, and next
  action against repository state before dispatching another writer.

See `review-gates.md` for the severity model and the definition of done.
