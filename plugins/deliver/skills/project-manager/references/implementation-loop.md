# Implementation loop

Run each story through the states below; the story's Execution block, not memory, bounds them.
The integration branch is the one named in the plan's Delivery mode, `main` by default; cut every
story branch from it and merge each back. Run `/deliver:doctor` before the first sprint on a fresh
or unfamiliar clone.

**Parallel.** With 2 or more build-ready `[P]` stories and `git worktree` working, load
`parallel-execution.md`; it owns the batch conditions, every difference, and the fallback here.
Otherwise take one story at a time.

### 0. Ready, then claim
Confirm the story is build-ready against `decomposition.md`'s readiness section and checklist
template; fix an unready story first. A pre-0.13 story needs `pm-meta` added and committed first,
per `migrations.md`. The working tree must be clean before you claim; unrelated changes mean stop
and ask.

Resolve a `pm-meta` builder of `auto` now, by `decomposition.md`'s rules for the field; without
Codex it falls back to `expert-builder`. An explicit `codex-builder` is a readiness blocker and
never switches workers silently.

**Claim.** Pull or rebase the integration branch. Confirm no `pm/<story-id>-*` branch exists
locally or on the remote and that the story has no Execution block owned by someone else. Append
the `## Execution` section per `state.md`, with your `owner`, the resolved `builder`, the branch
name, `status: claimed`, and both counters at `0`, and commit it on the integration branch as
`chore(<story-id>): claim`. Push it only under a standing push permission, then create and check
out `pm/S<sprint>-<n>-<slug>`.

### 1. Build, then commit
Optionally dispatch `test-engineer` first for TDD-red acceptance tests; the builder makes them pass
and adds only *further* coverage, never rewriting them. Set `status: building` and commit. Dispatch
the persisted `builder` with the inputs its agent file lists, plus the absolute repository or
worktree root for every `codex-builder` and for `expert-builder` outside the main checkout. Run
Codex's quota-free `--preflight` first when readiness is not established. Pass the story's `Specs`
when it has any. Builders edit the working tree; you own every git command.

**Scope check, after every writer run.** Two checks, from the repository and never from the
summary. First, the cumulative set: `git diff --name-only --diff-filter=ACDMRTUXB
<integration>...HEAD --`, plus `git diff --name-only HEAD --` and
`git ls-files --others --exclude-standard` for what is still uncommitted, sorted and deduplicated.
Each path must match a `pm-meta.touches` entry, file or directory root, or be the story file or
your own `docs/handoff/<you>.md`. Second, for Codex only, this run's delta: the uncommitted paths
alone (`git diff --name-only HEAD --` plus the untracked list) must equal the builder's `CHANGED`
line, because the runner reports what one run changed, never what earlier commits hold. Any
out-of-scope, protected, or unexplained path **stops** the story before gates or review, working
tree preserved. The three-dot diff excludes the integration tip's own history, so bring that tip
into the story branch by merge, never by cherry-pick.

When the scope check passes, commit the changed paths to the story branch as
`build(<story-id>): <subject>`, with `status: built` in the same commit.

Work broader than its brief re-routes to `expert-builder`: set `builder` in the Execution block and
note the reason, in one commit, before retrying. A blocked or failed builder earns **2** retries
with clarification. Increment `retries` and commit before each retry; that **cap** spans sessions
and a worker switch does not reset it. Then escalate.

### 2. Gate, then review or fix
The gates are the project's `test`, `lint`, and `build` from `docs/plan.md` and `AGENTS.md`;
whatever it lacks is `N/A`. Run them **yourself** after the build and after every fix, never on a
subagent's word. A failing gate loads `fix-loop.md`.

### 3. Review, then fix or verify
Re-derive and scope-check the paths, then produce the diff yourself, since reviewers have no Bash:
`git diff <integration>...HEAD -- <paths>`, plus `git add -N -- <paths> && git diff -- <paths>`
for anything still uncommitted, **never** `git add -A`. Set `status: in-review` and commit.
Dispatch the panel per `review-gates.md`: always `code-integrity-reviewer`, plus the lenses its
risk triggers select, and `architecture-reviewer` also gets the plan's Architecture section. Every
lens gets the story file, that diff text, and the story's `Specs`. Aggregate the lenses' findings;
any open `block` or `major` loads `fix-loop.md`.

### 4. Fix
`fix-loop.md` owns this state. Every fix lands on the story branch as
`fix(<story-id>): round <n>` before the gates re-run.

### 5. Verify, then ship or fix
External review is optional; `/deliver:codex-review branch base=<integration>` owns it, since the
story's work is committed and the `worktree` scope would find nothing. Note a skip in the story's
Execution notes. With the gates green and no `block` or `major` open, dispatch the read-only `pm-verifier`
with the inputs its agent file lists and its `Specs`. `PASS` alone permits shipping. `FAIL` loads
`fix-loop.md`, then re-verify. `UNKNOWN` means you obtain the evidence it named and re-verify, or
escalate. Load `verification.md` only when a criterion needs the running app or the story needs a
durable report.

### 6. Ship
Everything the story changed is already on its branch; `git status --porcelain` must be empty.
Pull or rebase the integration branch, and re-gate on the merged result if its tip moved after your
gates ran. Then check it out and `--no-ff` merge the story branch. **Never** push without an
explicit request. `environment.md` owns the opt-in remote PR path.

**Merge and PR message format.** Title `type(scope): subject`, imperative, no trailing period. Body
sections in this order, dropping any that are empty: `## Why` (intent and why this approach),
`## Scope` (facts from the diff, real paths and symbols, what is in and out), `## Tradeoffs` (real
choices only), `## Blast radius` (who and what the change touches, and why it is safe or risky),
`## Verification` (every command and its result). No `## Summary` or `## Test plan` boilerplate.
This body is the story's record; there is no separate log.

### 7. Close, then take the next story
On the integration branch, set `status: merged` in the story's Execution block, add a note line
naming the merge commit, and commit it as `chore(<story-id>): merged`. Keep or delete the story
branch per the user's policy. With a wiki, dispatch `librarian ingest` per `knowledge.md`, and
`lint` at the sprint boundary. `documentation.md` owns user-facing docs, at a sprint or project
boundary and never per story.

A story is done only with every criterion met, no open `block` or `major`, green gates, a
`pm-verifier` `PASS`, and `status: merged` committed. `/deliver:correct-course` owns scope changes
and the scope freeze, `planning-and-signoff.md` checkpoints, escalation triggers, and handoff
timing, `fix-loop.md` the fix rounds and their escalation, and `review-gates.md` severities and
lens selection.
