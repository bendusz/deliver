# Loop: one story, claim to ship

Run these steps for each build-ready story of the current sprint, in the plan's Stories order. A
story's state lives in its `pm-exec` line (`state.md` `## Execution block`); `<id>` is its
`S<sprint>-<n>`, and `<integration>` is the plan's `Integration branch:`.

**Mark `<status>`** means: set `pm-exec.status`, commit it on the integration branch with
`docs/log.md` staged, and log one line that says why, not just what:
`bash "<plugin>/scripts/log.sh" "S1-2: fixing, round 2, null path in parse()"`.
Every status change below is a mark. Log decisions made without asking the same way (`state.md`
`## Log`).

**Gates** are the plan's `## Commands` test, lint and build, `N/A` where none exists. Its `setup`
is not a gate: it is what makes a fresh worktree able to run them.

**Dispatch** is `host.md` `## Dispatch`: a `roles.md` soul, then the story file and the brief
lines. Keys are `<id>-<role>-<round>`, with `round` the current `pm-exec.rounds`. A second
dispatch of a role in the same round adds a letter (`S1-2-reviewer-1b`), because T3 answers a
reused key with the original child. Tests first uses `<id>-tests-0`. A fix round's send to the
builder carries `<id>-fix-<round>` (`host.md` `## Messaging`).

1. **Claim.** Append the `## Execution` heading and the `pm-exec` line, `status: claimed`,
   `rounds: 0`, to the story (`state.md` `## Execution block`). Resolve `pm-meta.builder`: `auto`
   becomes Codex or Claude per `roles.md` `## builder` **Default**; record it in `role_model`.
   Commit on the integration branch and log it, before any dispatch: T3 starts a worktree
   child from your HEAD commit, so an uncommitted claim never reaches it.

2. **Tests first**, when the story has testable acceptance criteria.
   - Dispatch a builder with the `roles.md` tests-only line, `isolation: "worktree"`, branch
     `pm/<id>-<slug>-tests`. Record its thread, branch and worktree in `pm-exec` and commit them,
     so a resume can find it (`state.md` `## Resume`); status stays `claimed`.
   - Its commit on that branch is the tests commit; no copy is needed. Check that it touched only
     test files (`git diff --name-only <integration>...<tests sha>`) and that its result reports the
     tests red for the stated reason.
   - Otherwise send a correction to its `thread` (`t3_thread_send`). Each correction is a fix
     round under the step 6 cap: increment `rounds`, commit and log it first; status stays
     `claimed`. At the cap, or on a `blocked` result, go to step 10.
   - Add one line under the `pm-exec`, `Tests: <tests sha> <test paths>`, commit it and log it.
     Clean the tests worktree per `host.md` `## Worktrees` steps 1 to 4; keep its branch.
   - The build starts from the tests commit, so it has the tests: its brief's first line is
     `git switch -c pm/<id>-<slug> <tests sha>`, and it says not to edit the listed test paths.

3. **Build.** Dispatch the builder soul at `role_model`, `isolation: "worktree"`, key
   `<id>-builder-<round>`. The brief names the branch `pm/<id>-<slug>` and, after step 2, the
   tests sha and paths. Mark `building` with `thread` the new `childThreadId`, `branch` set to
   `pm/<id>-<slug>` and `worktree` empty, so no tests-stage coordinates survive. When its JSON
   block returns `done`, record its `branch` and `worktree` and mark `built`. `blocked` goes to
   step 10. If the build is interrupted while `worktree` is still empty, `t3_thread_send` its
   `thread` asking for `git rev-parse --show-toplevel` and `git branch --show-current`, record
   both, then tell it to continue (`host.md` `## Messaging`).

4. **Gate.** Run the gates yourself in the recorded worktree (`cd <worktree>`), never on a
   child's word: its `tests` field is a claim, your run is the evidence. If a gate cannot start
   because the worktree lacks dependencies, run the plan's `setup` there once, then the gates;
   a gate that still cannot start is red. Then check scope:
   - `git diff --name-only <integration>...<branch>` stays inside `pm-meta.touches`.
   - After step 2, `git -C <worktree> diff <tests sha>..HEAD -- <test paths>` prints nothing.
     The build started on that commit, so any change there is the builder's.
   A red gate, a path outside `touches` or an edited acceptance test is a Fix item (step 6).
   Only a green, in-scope build goes to review.

5. **Review.** Mark `reviewing`. Dispatch the reviewer soul, `isolation: "shared"`, pointed at
   the recorded worktree, on `git diff <integration>...<branch>`, in the family opposite the
   build's `role_model` (`roles.md` `## reviewer` **Default**). Add a second, `focus:` reviewer
   when the story's `Review focus:` is not `none`, or the diff touches auth, untrusted input, a
   hot path or module structure: `focus: security`, `performance` or `design`. After a fix
   round, each brief lists the prior round's Fix items so the reviewer can check them. A review
   counts only when its `COMMIT` line is the branch head: otherwise dispatch it again with a
   letter on the key.
   - `PASS` from every reviewer: verify (step 7).
   - `CONCERNS`: minors only. Fix them in a round if cheap, else note them; then verify.
   - `FAIL`: a `block` or `major` is open. Fix (step 6).

6. **Fix.** You are the lead reviewer, not an aggregator. Check every finding against the code,
   even when both reviewers report it. A "what if this is null" counts only if a call path can
   produce it. "I would have done it differently" and flags on code the story did not touch are
   missing context. Be slower to dismiss security and correctness than style.
   - Triage into **Fix** and **Dismissed**, each dismissal with a one-line reason. Log the
     dismissals; the user can overrule them. An empty Fix list uses no round: verify (step 7).
   - **Cap: 3 rounds, then escalate.** If `rounds` is already 3, escalate to the user with the
     open findings and the diff (step 10). Else increment `rounds` and mark `fixing` first.
   - `t3_thread_send` the Fix list to the recorded builder `thread`, never a reviewer's raw output,
     with key `<id>-fix-<round>` (`host.md` `## Messaging`). Name the recorded branch and worktree.
   - A bug fix, a red gate, or a correctness or security finding names the behaviour to pin and
     the test file inside `touches`. The builder writes that test, sees it fail, then fixes. A
     round whose diff lacks the test is not closed. A name, dead code or comment is exempt.
   - On a second identical failure, the next send uses the `roles.md` diagnose line: show the
     failure with a command before naming a cause, then fix. Never a blind retry.
   - When the builder returns: re-gate (step 4), then a new review dispatch (step 5) with the
     new round in its key. Never a send to an old reviewer thread.

7. **Verify.** Dispatch the verifier soul, `isolation: "shared"`, on the recorded worktree,
   key `<id>-verifier-<round>`. The brief lists the gates, the prior `block` and `major` findings
   with their resolutions, and `<main checkout>/docs/evidence/<id>/` for artifacts. Where an
   acceptance criterion is user-visible, running-app evidence is required (`roles.md`
   `## verifier`, `host.md` `## Evidence and secrets`); name any project skill that drives the app.
   - `STATUS: PASS` alone proceeds, and only when its `COMMIT` is the branch head. Record
     `verifier: PASS <sha>`, commit any evidence with it, and mark `verified`.
   - `FAIL`: record `verifier: FAIL <sha>`; its ACTION lines are the Fix list (step 6).
   - `UNKNOWN`: record it, get the missing evidence it names, verify again; else escalate.

8. **Ship.**
   - Bring the branch up to date: `git -C <worktree> merge <integration>`, then re-gate. If that
     merge brought in anything beyond `docs/stories/`, `docs/log.md` and `docs/evidence/`, verify
     again (step 7) so the `verifier` sha is the head.
   - Scan every commit for secrets:
     `bash "<plugin>/scripts/scan-secrets.sh" <integration>..<branch>`. Never merge on a hit.
     A merge commit counts only what it adds itself, so the merge above does not re-report what
     the integration branch already holds.
     - A real secret: send the builder `thread` the hits as a Fix item: remove it from each
       story-branch commit the hits name (rewrite that unshared branch only, never the
       integration branch). Tell the user to rotate it, then re-gate, scan again and verify
       again (step 7).
     - A false positive, such as a token-shaped test fixture: show the user the hit and the line
       `<pattern name> <path glob>` that would allow it. Only on their yes, add it to
       `.scan-secrets-allow` on the integration branch, commit and log it, and scan again. The
       scan reads that file from `<integration>`, so a line on the story branch allows nothing;
       a builder that edits the file is out of `touches`. A push honours the line only once it
       is on the remote's default branch, never from the work tree or the pushed branch.
   - On the integration branch, `git merge --no-ff <branch>`. Title `type(scope): subject`,
     imperative, no trailing period. Body sections in order, dropping empty ones:
     - `## Why`: intent, and why this approach.
     - `## Scope`: facts from the diff, real paths and symbols, what is in and out.
     - `## Trade-offs`: real choices only.
     - `## Blast radius`: who and what it touches, and why that is safe or risky.
     - `## Verification`: every command and its result, and the verifier's sha.
   - Mark `merged` in its own commit after the merge, `chore(<id>): merged`.
   - In PR mode, `host.md` `## PR mode` replaces the local merge, with this body.
   - Clean up in the order `host.md` `## Worktrees` gives, then
     `git branch -d pm/<id>-<slug>-tests` if step 2 ran.

9. **Parallel.** Stories tagged `[P]` in the plan, with no `touches` overlap (no path equals or
   sits under another), may run as concurrent worktree builders, at most 3 at once.
   - Claim them first; one claim commit may hold several, and it precedes every dispatch.
   - Each runs steps 2 to 7 on its own. Integrate them one at a time through step 8: each next
     story merges the new integration tip and re-gates.
   - A merge conflict goes back to that story's builder as a Fix round, since you never write
     the code. One it cannot resolve cleanly inside `touches` blocks the story (step 10).

10. **Blocked.** Mark `blocked` with the reason in the log line. Escalate to the user with the
    story and the decision you need, with a push notification if the host offers one.
    - Keep its worktree and branches; a blocked or dirty worktree is never removed.
    - Take the next unblocked, build-ready story in the same sprint that does not depend on the
      blocked one. Never start a later sprint's story early.
    - When every remaining story in the sprint is blocked or depends on one, stop and wait.

**Why one reviewer by default.** bstack's design keeps one calibration result
(`docs/specs/2026-11-07-v1.0-bstack-redesign.md` §9 in the bstack repository, not in this
project), measured on 2026-10-25 against a review corpus since removed: at both the 10% and the
5% miss targets, the best measured choice was a single Codex generalist lens, with a 4.44% upper
bound on the miss rate and 0 false positives. The Claude specialist lenses (security,
performance, architecture) added no measured coverage over it. Hence the default: one
opposite-family generalist reviewer, plus an optional `focus:` reviewer. That lens was Codex's
built-in `codex exec review` prompt. A T3 child running the reviewer soul is a different,
uncalibrated reviewer: weigh its verdict as one reviewer's, which your gates and the verifier
back up.

**Sprint end.** When every story in the sprint is `merged`, or `blocked` and escalated, load
`retro.md`.
