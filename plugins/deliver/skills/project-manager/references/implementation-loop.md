# Implementation loop

**Enter** with build-ready stories. **Leave** the sprint when every story is `merged` and, at
`standard` scale and above, `/deliver:retro` has run.

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
and a pre-0.29 story with no `Tier` needs one set and committed before the claim, both per
`migrations.md`. The working tree must be clean before you claim; unrelated changes mean stop
and ask.

Resolve a `pm-meta` builder of `auto` now, by `decomposition.md`'s rules for the field; without
Codex it falls back to `expert-builder`. An explicit `codex-builder` is a readiness blocker and
never switches workers silently.

**Claim.** Pull or rebase the integration branch. Confirm no `pm/<story-id>-*` branch exists locally
or on the remote and that the story has no Execution block owned by someone else. Append the
`## Execution` section per `state.md`, with your `owner`, the resolved `builder`, the branch name,
`status: claimed`, the story's `tier`, every counter at `0`, and the `deliver` version, and commit
it on the integration branch as `chore(<story-id>): claim`. Push it only under a standing push
permission, then create and check out `pm/S<sprint>-<n>-<slug>`.

### 1. Build, then commit
**Acceptance tests first.** At `T1` and `T2`, dispatch `test-engineer` before any builder for
TDD-red acceptance tests, inside `pm-meta.touches`; at `T0` this is optional. Commit them on the
story branch as `test(<story-id>): acceptance`; that commit is the protected base. Then commit
`protected` (their paths) and `protected_base` (that commit's full SHA) to the Execution block on
the integration branch as `chore(<story-id>): protect`, where the ship gate reads them. Merge the
integration branch into the story branch before the first builder dispatch, so the story branch
carries the same fields and the ship merge base includes the protect commit; set and commit `status:
building` only after that merge, or after the claim when the story has no acceptance tests. The
builder makes the protected tests pass and adds only *further* coverage. Its brief lists the
protected paths and says that any change to them, or to any story file, stops the story.

**Holdout checks, at `T2`.** In the same dispatch, give `test-engineer` a new empty directory
under the OS temp directory, outside every checkout, for holdout checks and their `RUN` file. Store
them with `node "${CLAUDE_PLUGIN_ROOT}/scripts/holdout.mjs" store <story-id> <dir>`, which
commits them to the private ref `refs/deliver/holdout/<story-id>` without checking anything out,
then delete the directory. Never push that ref. Never name it, the checks, or their directory in a
builder brief, fix brief, or continuation.

Dispatch the persisted `builder` with the inputs its agent file lists, plus the absolute repository
or worktree root for every `codex-builder` and for `expert-builder` outside the main checkout. Run
Codex's quota-free `--preflight` first when readiness is not established. Pass the story's `Specs`
when it has any. Builders edit the working tree; you own every git command.

**Scope check, after every writer run.** Two checks, from the repository and never from the
summary. First, the cumulative set: `git diff --name-only --diff-filter=ACDMRTUXB
<integration>...HEAD --`, plus `git diff --name-only HEAD --` and
`git ls-files --others --exclude-standard` for what is still uncommitted, sorted and deduplicated.
Each path must match a `pm-meta.touches` entry, file or directory root, or be the story file or
your own `docs/handoff/<you>.md` in a commit you made. Any uncommitted change under
`docs/stories/` is out of scope: you commit your own Execution updates before each dispatch, so a
writer made it. No path in `protected` may have changed since the protected
base: `git diff --name-only <protected base> HEAD -- <protected>`, the uncommitted diff, and the
untracked list, each limited to those paths, must all be empty. Second, for Codex only, this run's
delta: the uncommitted paths alone (`git diff --name-only HEAD --` plus the untracked list) must
equal the builder's `CHANGED` line, because the runner reports what one run changed, never what
earlier commits hold. Any
out-of-scope, protected, or unexplained path **stops** the story before gates or review, working
tree preserved. The three-dot diff excludes the integration tip's own history, so bring that tip
into the story branch by merge, never by cherry-pick.

**Open criteria, after a builder reports done.** Place each acceptance criterion against the
changed paths and the builder's test result. When one is plainly unaddressed, its test absent or
failing or its named file untouched, wait for any background agent still running, then send the
same builder one continuation that names the open criteria and nothing else; for `codex-builder`
that is a `Mode: fix` dispatch whose brief lists them. A continuation is neither a retry nor a fix
round; add a dated note line to the Execution block for each. **Two** at most. Still open, set
`status: blocked` and escalate.

When the scope check passes, commit the changed paths to the story branch as
`build(<story-id>): <subject>`, with `status: built` in the same commit.

Work broader than its brief re-routes to `expert-builder`: set `builder` in the Execution block and
note the reason, in one commit, before retrying. A blocked or failed builder earns **2** retries
with clarification. Increment `retries` and commit before each retry; that **cap** spans sessions
and a worker switch does not reset it. Then escalate. The first `expert-builder` dispatch runs at
its frontmatter effort; a retry passes `effort: high` on the dispatch, on Claude Code `v2.1.292` or
newer.

### 2. Gate, then review or fix
The gates are the project's `test`, `lint`, and `build` from `docs/plan.md` and `AGENTS.md`;
whatever it lacks is `N/A`. Run them **yourself** after the build and after every fix, never on a
subagent's word.

**Integrity gate, at `T1` and `T2`.** After every writer run, once its changes are committed, run
`node "${CLAUDE_PLUGIN_ROOT}/scripts/test-integrity.mjs" <integration> HEAD --protected <paths>
--protected-base <protected_base>`, adding `--allow <kind>` for each `pm-meta.integrity_allow`
entry, and `--root <worktree>` in parallel mode. Take `protected`, `protected_base`, and
`integrity_allow` from the integration branch's copy of the story
(`git show <integration>:docs/stories/<file>`), never from the story branch. Record its verdict and
the commit it judged as `integrity: "<pass|fail> <sha>"`, the full `git rev-parse HEAD`, or
`git -C <worktree> rev-parse HEAD` in parallel mode, and commit it. Exit 1 is `fail`: increment
`integrity_fails` in the same commit. Exit 64 means the command could not judge the diff: fix the
invocation, and never record `pass`.

A failing gate, the integrity gate included, loads `fix-loop.md`.

### 3. Review, then fix or verify
Re-derive and scope-check the paths, then produce the diff yourself, since reviewers have no Bash:
`git diff <integration>...HEAD -- <paths>`, plus `git add -N -- <paths> && git diff -- <paths>` for
anything still uncommitted, **never** `git add -A`. Set `status: in-review` and commit. Dispatch the
panel per `review-gates.md`: the story's tier panel plus the lenses its risk triggers add, which
always include `code-integrity-reviewer`. Once the first review returns,
record the lenses that actually ran as `panel` and commit it. When a fix round's re-review runs
without one of those lenses, drop it from `panel` in that round's commit. List a lens once per trial
that ran, so two trials of one lens appear twice. `architecture-reviewer` also gets the plan's
Architecture section, and `performance-reviewer` its Non-functional requirements. Every lens gets
the story file, that diff text, and the story's `Specs`. Aggregate the lenses' findings; any open
`block` or `major` loads `fix-loop.md`.

**Opposite-family review.** `review-gates.md` owns which family's lens each round needs. Dispatch
`codex-reviewer` with `Scope: branch`, `Base:` the integration branch, at
the runner's default model and effort, after the secret scan and preflight that
`/deliver:codex-review` describes. Grade its findings yourself against `review-gates.md`'s
severities and aggregate them with the panel's. When `review-gates.md` calls for `codex-reviewer`
this round and Codex is absent or refuses, note the gap in the story's Execution notes. At `T0` and
`T1`, continue under `review-gates.md`'s missing-Codex-lens exception, so `panel` lists only the
lenses that ran. At `T2`, set `status: blocked` and escalate.

### 4. Fix
`fix-loop.md` owns this state. Every fix lands on the story branch as
`fix(<story-id>): round <n>` before the gates re-run.

### 5. Verify, then ship or fix
With the gates green and no `block` or `major` open, dispatch the read-only `pm-verifier` with the
inputs its agent file lists and its `Specs`. At `T2`, run the holdout checks yourself on the same
commit:
`node "${CLAUDE_PLUGIN_ROOT}/scripts/holdout.mjs" run <story-id> --target <story checkout root>`
materialises them under the OS temp directory, runs them, and deletes the copy. A `fail` makes the
verdict `FAIL` and increments `holdout_fails`, committed with the verdict. Exit 66 means the ref is
missing, as in a fresh clone: dispatch `test-engineer` to regenerate the checks into a new temporary
directory, with a brief that says holdout directory only, never touch the repository; store them,
then verify. Record the verdict and the commit it judged as
`verifier: "<verdict> <sha>"`, the full `git rev-parse HEAD`, and commit it on the story branch.
`PASS` alone permits shipping. `FAIL` loads `fix-loop.md`, then re-verify; a fix brief for a holdout
failure names the broken behaviour and the criterion, never the holdout check. `UNKNOWN` means you
obtain the evidence it named and re-verify, or escalate. Load `verification.md` only when a
criterion needs the running app or the story needs a durable report.

### 6. Ship
Everything the story changed is already on its branch; `git status --porcelain` must be empty.
Pull or rebase the integration branch, and re-gate on the merged result if its tip moved after your
gates ran. Then check it out and `--no-ff` merge the story branch. **Never** push without an
explicit request. `environment.md` owns the opt-in remote PR path.

The `require-verified.mjs` hook blocks that merge unless the story branch's Execution block records
`verifier: PASS <sha>` and, at the claimed tier `T1` or `T2`, `integrity: pass <sha>`, with the
claim fields `state.md` lists unchanged from the integration branch. Every commit on the branch
after either `<sha>` may only record state in the story file and `docs/handoff/*.md`, or merge the
integration tip exactly as git would automatically, which the re-gate covers. Any other change, a
conflict resolution in code included, needs a fresh verdict. Run the merge as its own Bash command,
from the project directory or with `git -C <project>`, after at most a plain `git checkout` or
`git switch` of the integration branch, and name the story branch literally. The merge's own
directory identifies the project; at a monorepo root a story-like merge blocks.

```
git checkout <integration> && git merge --no-ff pm/S1-2-x -m "$(cat <<'EOF'
feat(todo): add and list items
...
EOF
)"
```

The hook refuses a shell variable or substitution, `-` or `@{-1}`, a `git pull` of a story branch, a
commit short of the branch tip, and a tag that shadows the branch; the quoted heredoc message is
fine. The hook catches honest mistakes such as a
missed or stale verdict, a careless chain, or a wrong tier; it is not a boundary against an agent
set on evading it, which is the 0.30 sandbox's job. A block means a state was skipped: go back to
it, and never set `DELIVER_NO_ENFORCE` to get past it.

**Merge and PR message format.** Title `type(scope): subject`, imperative, no trailing period. Body
sections in this order, dropping any that are empty: `## Why` (intent and why this approach),
`## Scope` (facts from the diff, real paths and symbols, what is in and out), `## Tradeoffs` (real
choices only), `## Blast radius` (who and what the change touches, and why it is safe or risky),
`## Verification` (every command and its result). No `## Summary` or `## Test plan` boilerplate.
This body is the story's record; the gitignored `tmp/log.md` carries the narrative around it.

### 7. Close, then take the next story
On the integration branch, set `status: merged` in the story's Execution block, add a note line
naming the merge commit, and commit it as `chore(<story-id>): merged`. Keep or delete the story
branch per the user's policy. With a wiki, dispatch `librarian ingest` per `knowledge.md`, and
`lint` at the sprint boundary. `documentation.md` owns user-facing docs, at a sprint or project
boundary and never per story.

Every state change above gets its `tmp/log.md` entry, per `state.md`.

A story is done only with every criterion met, no open `block` or `major`, green gates, at `T1` and
`T2` `integrity: pass <sha>`, a `pm-verifier` `PASS`, and `status: merged` committed.
`/deliver:correct-course` owns scope changes and the scope freeze, `planning-and-signoff.md`
checkpoints, escalation triggers, and handoff timing, `fix-loop.md` the fix rounds and their
escalation, and `review-gates.md` severities, tier panels, and lens selection.
