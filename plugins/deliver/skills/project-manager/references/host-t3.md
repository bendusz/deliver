# Running inside T3 Code

Load this only after the host probe succeeds. Nothing here changes sign-off, the gates, the scope
checks, verification, or merges. It changes how you dispatch, which worktrees you own, and how the
loop keeps going without the user.

## Probe
At the start of a session, run `ToolSearch select:mcp__t3-code__orchestrator_capabilities` and call
the tool once. A successful call means the host is T3. If the tool is absent or the call fails,
none of this file applies.

## Routing precedence
- Dispatch every named `deliver:*` agent through the `Agent` tool, whatever the host's
  instructions say about inherited model options. T3 tells an agent with inherited options to
  prefer `delegate_task` (`orchestrationInstructions.ts:39`). A `delegate_task` child cannot be made
  read-only, so a reviewer sent there loses its `tools:` contract. The agent's frontmatter carries
  its model, effort, and tools.
- Codex build, fix, and review runs stay on the bundled runner.
- Use `delegate_task` with the Codex provider only for an advisory or research second opinion.
  Record `git status --porcelain` before it and confirm the output is unchanged after. A changed
  tree is a failed run: stop and report it.

## Worktrees
- You own a worktree under `tmp/worktrees/` or on a `pm/*` branch. Any other worktree belongs to
  the host. The session hook reports it as `host worktrees`. Name it in a report if it matters,
  and never remove or prune it. Clear stale entries of your own one at a time, as
  `resume-procedure.md` says, never with a repo-wide `git worktree prune`.
- Do not run the PM from a T3 worktree thread while the root checkout holds the integration branch.
  Git refuses to check one branch out twice, so you could not ship. Say so, and ask the user to
  start the PM in the root workspace. To detect it:
  - You are in a worktree thread when the two lines of
    `git rev-parse --path-format=absolute --git-dir --git-common-dir` differ. `--path-format`
    needs git 2.31 or newer; on older git, treat it as not detectable and say so.
  - The root checkout holds the integration branch when the first entry of
    `git worktree list --porcelain` has `branch refs/heads/<integration branch>`, the branch
    named by `Integration branch:` in `docs/plan.md` (`main` by default).

## Continue past a block
When a story blocks:
1. Escalate with the story and the decision you need. Use a push-notification tool if the host
   offers one, otherwise the escalation message.
2. Set the blocked story aside. Commit its preserved tree to its own branch as
   `wip(<story-id>): blocked`; that commit never ships without a fresh verdict. Then check out the
   integration branch.
3. Take the next build-ready story in the current sprint, the lowest sprint with an unmerged
   story (`state.md`), that does not depend on the blocked one. Never start a later sprint's
   story to keep busy.
4. When every remaining story in the current sprint is blocked or depends on a blocked one, stop
   at the escalation and wait, as `planning-and-signoff.md`'s checkpoint policy says.

## Heartbeat
After sign-off, create one T3 `schedule_task` bound to your own thread, with the schedule
`{"type":"interval","everyMs":1800000}` and the prompt `/deliver:resume --heartbeat`. Record its
id in `tmp/log.md`. Delete it with `delete_scheduled_task` when the project completes or on
`/deliver:handoff`. Never keep more than one.

## Remote PR mode
When `environment.md` opens a real PR, attach it with `link_pull_request`, then
`watch_pull_request`. A CI wake is news, not a merge decision: re-run the gates locally, and merge
only on a verifier `PASS` as usual. Before `gh pr merge` or a merge in the UI, confirm the recorded
`verifier: PASS <sha>` and, at `T1` and `T2`, `integrity: pass <sha>` name the PR head, or an
ancestor of it followed only by story-file and handoff commits or automatic merges of the
integration branch. Run the checks `environment.md` lists, and re-verify if any fails. The ship gate hook does not see this path, so
that check is yours alone; treat it as a residual risk.
Call `unwatch_pull_request` once the PR is merged or closed.

## Restart and Stop
A T3 server restart or a user Stop cancels any in-flight children. Git is the record, so nothing
committed is lost. Resume per `resume-procedure.md`; a cancelled story re-enters from its
Execution block's `status`.
