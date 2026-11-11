# Host: T3 Code

bstack runs only under T3 Code. Every child is a T3 thread you start, message and clean up.

## Probe
At session start, call `orchestrator_capabilities` once; it lists the providers, models and
options you may target. If it is missing or fails, say "bstack requires T3 Code" and stop.
Call it again only after a dispatch error or a provider change the user names.

## Dispatch
- Every role goes through `delegate_task`: model and effort are explicit, and each child has a
  thread you can message. `task` is one `roles.md` soul (`## builder`, `## reviewer`, `## verifier`,
  `## researcher`, `## spec-architect`), then the story or brief; `title` is `<story-id> <role>`.
- `target` shapes, with the model and level from the soul's **Default** or your recorded choice:
  - Claude: `{"providerInstanceId":"claudeAgent","model":"<id>","options":{"effort":"<level>"}}`
  - Codex: `{"providerInstanceId":"codex","model":"<id>","options":{"reasoningEffort":"<level>"}}`
  - Always set Codex `reasoningEffort`: T3's per-model default can be `low`.
- `role` is `implementation` for a builder, `test` for a tests-only builder and the verifier,
  `review` for a reviewer, `research` for a researcher, `design` for the spec-architect.
- `clientRequestId` is `<story-id>-<role>-<round>`, for example `S1-2-builder-0` or
  `S1-2-reviewer-1`. Reuse a key only to retry a dispatch whose response was lost: T3 returns
  the original child. It never restarts one; continue a cancelled child as `## Messaging` says.
- Builders use `isolation: "worktree"`. T3 starts the worktree from your HEAD commit, so commit
  the claim first. Reviewers and verifiers use `isolation: "shared"`; their brief names the
  recorded `pm-exec.worktree` path, and they run git and the gates there (`git -C <worktree>`).
- The `delegate_task` and `task_status` results carry neither the worktree path nor the branch.
  Only the builder reports them, in the JSON block its soul's **Returns** defines. Record
  `childThreadId` as `thread`, and its `branch` and `worktree`, in the story's `pm-exec`
  (`state.md`). At most 3 builders run at once.
- A new worktree holds only what git tracks: no installed dependencies, no `.env`. The builder
  runs the plan's `setup` first (its soul says so), and you run it before your first gate there if
  the gates still cannot start (`loop.md` step 4).
- The native Explore agent is for quick read-only lookups only, never for a role. Children may
  start their own subagents inside their brief and report them; do not manage those.
- Wait without polling: the default `async` mode wakes you when a child completes. No `task_status`
  loops, sleeps, watchers or scheduled wake-ups. Follow the `next` a result gives.
- A T3 restart or a user Stop cancels running children; resume per `state.md` `## Resume`.

## Messaging
- A fix round goes to the same builder: `t3_thread_send` to the recorded `thread`, so it keeps its
  context; a send to a finished thread starts a new run. Send the triaged Fix list, never a
  reviewer's raw output, with `clientRequestId` `<story-id>-fix-<round>`. T3 answers a reused send
  key with the first send and starts no second run, so resending after a lost response is safe.
  To continue a cancelled or interrupted child, send to its `thread` too, naming its recorded
  branch and worktree and telling it to continue the story or Fix list.
- Children may message only thread ids their brief names, such as a researcher's thread. A builder
  never messages its reviewer or verifier, so never name those to it; findings flow through you.
- Read a child's question with `t3_pending_request`; answer it there (`action: "respond"`) when
  the answer is within the signed-off plan, else escalate to the user and log it.
- Every new review or re-check is a new `delegate_task`, never a send to an old reviewer thread.

## Worktrees
- T3 puts a builder's worktree at `~/.t3/worktrees/<project>/t3-<id>`, on a branch `t3/<slug>`
  from the task title. Once the builder switches to its `pm/…` branch, that one stays unused.
- T3 does not clean up. After a story merges, in this order:
  1. Before removal, find the `t3/<slug>` branch: `git worktree list --porcelain` while the worktree
     is on it, else `git -C <worktree> reflog` (`checkout: moving from t3/<slug> to pm/…`).
  2. Confirm it is clean: `git -C <worktree> status --porcelain` prints nothing. If not, stop and
     ask the user; never remove a dirty worktree.
  3. `git worktree remove <worktree>`, never `--force`.
  4. `git branch -d t3/<slug>`, the leftover T3 branch.
  5. `git branch -d pm/S<sprint>-<n>-<slug>`, the merged story branch.
- Never touch a worktree not recorded in a `pm-exec`; never remove or prune any other.
- Do not run the PM from a T3 worktree thread while the root checkout holds the integration
  branch: git refuses to check one branch out twice, so you could not merge. Say so, and ask the
  user to start the PM in the root workspace. To detect it:
  - You are in a worktree thread when the two lines of
    `git rev-parse --path-format=absolute --git-dir --git-common-dir` differ. `--path-format`
    needs git 2.31 or newer; on older git, say it is not detectable.
  - The root checkout holds it when the first entry of `git worktree list --porcelain` has
    `branch refs/heads/<integration branch>`, the `Integration branch:` in `docs/plan.md`.

## PR mode
Only when the user asks for real PRs, `gh auth status` succeeds and a GitHub remote exists. PR mode
needs merge commits: if `gh repo view --json mergeCommitAllowed` says `false`, say so and stay on
local merges, because your commits could never fast-forward onto a squashed or rebased history.
- **State rides in the PR.** Your claim, status and log commits live on the local integration
  branch and are never pushed on their own. `loop.md` step 8 merges that branch into the story
  branch, so each PR carries them, and a protected branch needs nothing more.
- **Open.** Push the story branch through the pre-push scan; a block is escalated to the user,
  never bypassed with `--no-verify`. An approved `.scan-secrets-allow` line counts for a push
  only once the remote's default branch holds it: ask the user to push that one commit, or to
  merge a PR that holds only that file, before the story branch goes up. Open the PR with the merge body `loop.md` gives, then
  `link_pull_request` and `watch_pull_request`. A wake is news, not a merge decision.
- **Merge.** Re-run the gates locally. Merge with `gh pr merge --merge`, only on passing gates and
  a recorded `verifier: PASS <sha>` that covers the PR head: the sha is the head, or
  `git diff --name-only <sha>..<head>` lists nothing outside `docs/stories/`, `docs/log.md` and
  `docs/evidence/`. Otherwise verify again. A user who merges it themselves must use a merge commit.
- **After.** `unwatch_pull_request` once the PR closes.
  - Merged: `git switch <integration branch>`, `git fetch`, then
    `git merge --ff-only origin/<integration branch>`. If you committed since the PR opened, that
    refuses: use a plain `git merge origin/<integration branch>`, never a rebase. Mark `merged`,
    then clean up as in `## Worktrees`.
  - Squashed or rebased instead (`git merge-base --is-ancestor <branch head>
    origin/<integration branch>` fails): stop. The histories have diverged and `git branch -d`
    will refuse. Show the user both and ask how to reconcile; never force.
  - Closed unmerged: no cleanup. Keep the worktree and branches, set the story `blocked`, escalate.
- **Sprint end.** The last `merged` marks, the retro and the completion report are still local.
  Ask the user: push the integration branch, or open one `pm/state-sprint-<n>` PR for them.
- Never push without the user's request.

## Evidence and secrets
- Running-app evidence comes from `preview_*` or `device_*`, used by the verifier or a builder
  asked for evidence. Screenshots go under `docs/evidence/<story-id>/`.
- Anything only the user can give, a token, login or pairing code, comes through `request_secret`.
  Never put a secret in a file, a brief or the log. Every soul tells its child to stop and ask for
  one; answer with only what `request_secret` returns (a `secretRef`, or a `delivery: "file"` path).
