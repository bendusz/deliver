# Loop: one story, claim to ship

Run these steps for each build-ready story of the current sprint, in the plan's Stories order. A
story's state lives in its `pm-exec` line (`state.md` `## Execution block`); `<id>` is its
`S<sprint>-<n>`, and `<integration>` is the plan's `Integration branch:`.

**Mark `<status>`** means: set `pm-exec.status`, commit it on the integration branch with
`docs/log.md` staged, and log one line that says why, not just what:
`bash "<plugin>/scripts/log.sh" "S1-2: fixing, round 2, null path in parse()"`.
Every status change below is a mark. Log decisions made without asking the same way.

**Gates** are the plan's `## Commands` test, lint and build, `N/A` where none exists. `setup`
is not a gate: it is what makes a fresh worktree able to run them.

**Dispatch** is `host.md` `## Dispatch` with the `roles.md` model and brief. Keys are
`<id>-<role>-<round>`, `round` the current `pm-exec.rounds`. A second dispatch of a role in the
same round adds a letter (`S1-2-reviewer-1b`): T3 answers a reused key with the original child.
Tests first uses `<id>-tests-0`; a fix round's send carries `<id>-fix-<round>`. A reply that
lacks STATUS, the head COMMIT or a CRITERIA line goes back first (`roles.md` `## The brief`).

1. **Claim.** Append the `## Execution` heading and the `pm-exec` line, `status: claimed`,
   `rounds: 0`, with `role_model` from `roles.md` `## Models` (`state.md` `## Execution block`).
   Commit on the integration branch and log it, before any dispatch: T3 starts a worktree
   child from your HEAD commit, so an uncommitted claim never reaches it.
   - `Design review: yes` (storage, data model, migration, versioning): dispatch the design
     review first, `isolation: "shared"`, key `<id>-design-0`. Triage as step 6; write each
     ruling into the story's Context and commit it before the build. It spends no fix round.

2. **Tests first**, when the story has testable acceptance criteria.
   - Dispatch a builder with the tests-only GOAL, `isolation: "worktree"`, BRANCH
     `pm/<id>-<slug>-tests`. Record its thread, branch and worktree in `pm-exec` and commit them,
     so a resume can find it (`state.md` `## Resume`); status stays `claimed`.
   - Its COMMIT is the tests commit; no copy is needed. Check that it touched only test files
     (`git diff --name-only <integration>...<tests sha>`) and that CRITERIA report them unmet for
     the stated reason.
   - Otherwise send a correction to its `thread` (`t3_thread_send`). Each correction is a fix
     round under the step 6 cap: increment `rounds`, commit and log it first; status stays
     `claimed`. At the cap, or on `STATUS: blocked`, go to step 10.
   - Add one line under the `pm-exec`, `Tests: <tests sha> <test paths>`, commit it and log it.
     Clean the tests worktree per `host.md` `## Worktrees` steps 1 to 4; keep its branch.
   - The build starts from the tests commit: its BASE is that sha and PROTECTED lists the paths.

3. **Build.** Dispatch the builder at `role_model`, `isolation: "worktree"`, key
   `<id>-builder-<round>`, BRANCH `pm/<id>-<slug>`. Mark `building` with `thread` the new
   `childThreadId`, `branch` set and `worktree` empty, so no tests-stage coordinates survive.
   On `STATUS: done`, record its BRANCH/WORKTREE line and mark `built`; `blocked` or `partial`
   goes to step 10 or a fix round. If the build is interrupted while `worktree` is empty,
   `t3_thread_send` its `thread` asking for `git rev-parse --show-toplevel` and
   `git branch --show-current`, record both, then tell it to continue (`host.md` `## Messaging`).

4. **Gate.** Run the gates yourself in the recorded worktree (`cd <worktree>`), never on a
   child's word: its CHECKS are a claim, your run is the evidence. If a gate cannot start
   because the worktree lacks dependencies, run the plan's `setup` there once, then the gates;
   a gate that still cannot start is red. A check that fails, then passes on a rerun, is still a
   Fix item, with the failed run's text; if it timed out while other builders ran, also cut to one
   builder at a time (Rules, Caps). Then check scope:
   - `git diff --name-only <integration>...<branch>` stays inside `pm-meta.touches`.
   - After step 2, `git -C <worktree> diff <tests sha>..HEAD -- <test paths>` prints nothing.
   A red gate, a path outside `touches` or an edited acceptance test is a Fix item (step 6).
   Only a green, in-scope build goes to review.

5. **Review.** Mark `reviewing`. Dispatch the reviewer, `isolation: "shared"`, WORKTREE the
   recorded one, in the family opposite the build's `role_model`, with a neutral brief
   (`roles.md` `## The brief`). Add a second, `focus:` reviewer when the story's `Review focus:`
   is not `none`, or the diff touches auth, untrusted input, a hot path or module structure.
   After a fix round, PRIOR lists the round's Fix items. A review counts only when its COMMIT is
   the branch head; otherwise dispatch it again with a letter on the key.
   - `PASS` from every reviewer: record `review: PASS <head sha>` and verify (step 7).
   - `CONCERNS`: minors only. Fix them in a round if cheap, else note them; record the review
     at the head it covered, then verify. A later code commit needs a new review at the new head;
     only commits to PM records and a clean merge of `<integration>` (step 8) keep it.
   - `FAIL`: a `block` or `major` is open. Fix (step 6).

6. **Fix.** You are the lead reviewer, not an aggregator. Check every finding against the code,
   even when both reviewers report it. A "what if this is null" counts only if a call path can
   produce it. "I would have done it differently" and flags on code the story did not touch are
   missing context. Be slower to dismiss security and correctness than style.
   - Triage into **Fix** and **Dismissed**, each dismissal with a one-line reason. Log the
     dismissals; the user can overrule them. An empty Fix list uses no round: verify (step 7).
   - **Cap: 3 rounds.** If `rounds` is already 3 and a `block` or `major` is open, go to step 10.
     Else increment `rounds` and mark `fixing` first.
   - `t3_thread_send` the Fix list to the recorded builder `thread`, never a reviewer's raw output,
     key `<id>-fix-<round>`, naming the branch and worktree. One line per item:
     `F<n> <sev> <file:line> | behaviour to pin | test file | done when <proof>`
   - A bug fix, a red gate, or a correctness or security finding names the behaviour to pin and
     the test file inside `touches`. The builder writes that test, sees it fail, then fixes. A
     round whose diff lacks the test is not closed. A name, dead code or comment is exempt.
   - On a second identical failure, the next send uses the diagnose GOAL. Never a blind retry.
   - When the builder returns: re-gate (step 4), then a new review dispatch (step 5) with the
     new round in its key. Never a send to an old reviewer thread.

7. **Verify.** Dispatch the verifier, `isolation: "shared"`, on the recorded worktree, key
   `<id>-verifier-<round>`. The brief lists the gates, PRIOR the `block` and `major` findings with
   their resolutions, and `<main checkout>/docs/evidence/<id>/` for artifacts. A user-visible
   criterion needs running-app evidence (`host.md` `## Evidence and secrets`); name any project
   skill that drives the app.
   - `STATUS: PASS` at the branch head: record `verifier: PASS <sha>`, commit any evidence with
     it, and mark `verified`. A plan `## Waivers` row for the verifier records `verifier: WAIVED`.
   - `FAIL`: record `verifier: FAIL <sha>`; its unmet CRITERIA are the Fix list (step 6).
   - `UNKNOWN`: record it, get the missing evidence it names, verify again; else escalate.

8. **Ship.**
   - If `docs/gate.txt` says `FAIL` and the story is not tagged `fixes-gate`, stop: no merge
     (Floor 1). Take a story that fixes the gate, or escalate.
   - Bring the branch up to date: `git -C <worktree> merge <integration>`. That tree is what the
     merge will produce: gate it and record `gates: PASS <head sha>`. If that merge brought in
     anything beyond the PM records (`state.md` `## PM records`), verify again (step 7).
   - Scan every commit for secrets:
     `bash "<plugin>/scripts/scan-secrets.sh" <integration>..<branch>`. Never merge on a hit.
     A merge commit counts only what it adds itself, so the merge above does not re-report what
     the integration branch already holds.
     - A real secret: send the builder `thread` the hits as a Fix item: remove it from each
       story-branch commit the hits name (rewrite that unshared branch only, never the
       integration branch). Tell the user to rotate it, then re-gate, scan again and verify again.
     - A false positive, such as a token-shaped test fixture: show the user the hit and the line
       `<pattern name> <path glob>` that would allow it. Only on their yes, add it to
       `.scan-secrets-allow` on the integration branch, commit and log it, and scan again. The
       scan reads that file from `<integration>`, so a line on the story branch allows nothing;
       a builder that edits the file is out of `touches`.
   - On the integration branch, `git merge --no-ff <branch>`; the merge guard checks the records
     above. Title `type(scope): subject`, imperative, no trailing period. Body sections in order,
     dropping empty ones: `## Why`, `## Scope` (real paths and symbols, in and out),
     `## Trade-offs`, `## Blast radius`, `## Verification` (every command and result, the gates
     and verifier shas).
   - Mark `merged` in its own commit, `chore(<id>): merged`, with the ledger row staged:
     `bash "<plugin>/scripts/ledger.sh" <id> merged <review-driven rounds> <blocked+partial replies> <reruns> "<role>=<model>:<min>m …" <parity|n/a>`.
     Minutes come from each child's run in `t3_thread_read`.
   - Run the full gates on the new integration head and write `docs/gate.txt`:
     `PASS|FAIL <sha> <YYYY-MM-DD HH:MM> <failing tests, if any>`. Commit it. `FAIL` holds every
     merge but a `fixes-gate` story's.
   - In PR mode, `host.md` `## PR mode` replaces the local merge, with this body.
   - Clean up in the order `host.md` `## Worktrees` gives, then
     `git branch -d pm/<id>-<slug>-tests` if step 2 ran.

9. **Parallel.** Stories tagged `[P]` in the plan, with no `touches` overlap (no path equals or
   sits under another), may run as concurrent worktree builders, within the Rules' cap.
   - Claim them first; one claim commit may hold several, and it precedes every dispatch.
   - Each runs steps 2 to 7 on its own. Integrate them one at a time through step 8: each next
     story merges the new integration tip and re-gates.
   - A merge conflict goes back to that story's builder as a Fix round, since you never write
     the code. One it cannot resolve cleanly inside `touches` blocks the story (step 10).

10. **Blocked.** Mark `blocked` with the reason in the log line. Escalate to the user, with a push
    notification if the host offers one, in at most 6 lines:
    `DECISION NEEDED | options with cost | what each skips | default if no answer by <time> | evidence path`
    - Once it was reviewed, append its ledger row with status `blocked` (step 8's call).
    - Keep its worktree and branches; a blocked or dirty worktree is never removed.
    - Take the next unblocked, build-ready story in the same sprint that does not depend on the
      blocked one. Never start a later sprint's story early.
    - When every remaining story in the sprint is blocked or depends on one, stop and wait.

**Sprint end.** When every story in the sprint is `merged`, or `blocked` and escalated, load
`retro.md`.
