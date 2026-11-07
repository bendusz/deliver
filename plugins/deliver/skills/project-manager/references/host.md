# Host: T3 Code

deliver runs only under T3 Code. Every child is a T3 thread you start, message and clean up.

## Probe
At session start, call `orchestrator_capabilities` once; it lists the providers, models and
options you may target. If it is missing or fails, say "deliver requires T3 Code" and stop.
Call it again only after a dispatch error or a provider change the user names.

## Dispatch
- Every role goes through `delegate_task`: model and effort are explicit, and each child has a
  thread you can message. `task` is one `roles.md` soul (`## builder`, `## reviewer`, `## verifier`,
  `## researcher`, `## spec-architect`), then the story or brief; `title` is `<story-id> <role>`.
- `target` shapes, with the model and level from the soul's **Default** or your recorded choice:
  - Claude: `{"providerInstanceId":"claudeAgent","model":"<id>","options":{"effort":"<level>"}}`
  - Codex: `{"providerInstanceId":"codex","model":"<id>","options":{"reasoningEffort":"<level>"}}`
  - Always set Codex `reasoningEffort`: T3's per-model default can be `low`.
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
- The native Explore agent is for quick read-only lookups only, never for a role. Children may
  start their own subagents inside their brief and report them; do not manage those.
- Wait without polling: the default `async` mode wakes you when a child completes. No `task_status`
  loops, sleeps, watchers or scheduled wake-ups. Follow the `next` a result gives.
- A T3 restart or a user Stop cancels running children; resume per `state.md` `## Resume`.

## Messaging
- A fix round goes to the same builder: `t3_thread_send` to the recorded `thread`, so it keeps its
  context; a send to a finished thread starts a new run. Send the triaged Fix list, never a
  reviewer's raw output. To continue a cancelled or interrupted child, send to its `thread` too,
  naming its recorded branch and worktree and telling it to continue the story or Fix list.
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
Only when the user asks for real PRs, `gh auth status` succeeds and a GitHub remote exists. Push
the story branch, open the PR with the merge body `loop.md` gives, then `link_pull_request` and
`watch_pull_request`. A wake is news, not a merge decision: re-run the gates locally. Merge only
on passing gates and a recorded `verifier: PASS <sha>` whose sha is the PR head; if the head moved,
verify again. Never push without the user's request. `unwatch_pull_request` once the PR closes:
- Merged: `git switch <integration branch>`, `git pull --ff-only`, then clean up as in
  `## Worktrees` (`git branch -d` refuses until the local integration branch has the merge).
- Closed unmerged: no cleanup. Keep the worktree and branches, set the story `blocked`, escalate.

## Evidence and secrets
- Running-app evidence comes from `preview_*` or `device_*`, used by the verifier or a builder
  asked for evidence. Screenshots go under `docs/evidence/<story-id>/`.
- Anything only the user can give, a token, login or pairing code, comes through `request_secret`.
  Never put a secret in a file, a brief or the log.
