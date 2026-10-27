# Running inside T3 Code

Load this only after the host probe succeeds. Nothing here changes sign-off, the gates, the scope
checks, verification, or merges. It changes how you dispatch, Codex included, which worktrees you
own, and how the loop keeps going without the user.

## Probe
At the start of a session, run `ToolSearch select:mcp__t3-code__orchestrator_capabilities` and call
the tool once. A successful call means the host is T3. If the tool is absent or the call fails,
none of this file applies.

## Routing precedence
- Dispatch every named `deliver:*` agent through the `Agent` tool, whatever the host's
  instructions say about inherited model options, except the four Codex wrappers below. T3 tells
  an agent with inherited options to prefer `delegate_task` (`orchestrationInstructions.ts:39`). A
  `delegate_task` child cannot be made read-only, so a reviewer sent there loses its `tools:`
  contract. The agent's frontmatter carries its model, effort, and tools.
- Every Codex call (build, fix, review, advice, and research) goes through `delegate_task`
  instead of its Sonnet wrapper (`codex-builder`, `codex-reviewer`, `codex-advisor`,
  `codex-researcher`). Without T3 the wrappers and the runner work as `environment.md` says.

## A Codex call through `delegate_task`
1. **Emit the prompt.** Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/codex/run.mjs" --emit-prompt`
   with the arguments the wrapper would pass, from the directory it would run in. The runner
   makes every check a real run makes before codex starts (sign-off, the plan digest, the story's
   `pm-meta` and `protected` paths, the review scope and `--out`) and never launches codex. A non-zero exit is
   the wrapper's refusal, and `runner_status: nothing-to-review` its empty review: act on either
   as you would on the wrapper's report. Otherwise it prints `{mode, model, effort, cwd, readOnly,
   prompt}`: the runner's defaults for the mode, or the values you passed, and the exact prompt
   codex would get plus a contract for what the runner would enforce. Build and fix end with the
   builder result schema. Review, advise, and research name `cwd` and are told not to write.
   Skip the runner's `--preflight`: it probes the local Codex CLI, which a T3 child does not use.
2. **Read-only modes** (`readOnly: true`: review, advise, research). Before the call, take the
   advisory snapshot below in the emitted `cwd`, and in your own checkout when it differs.
3. **Call** `delegate_task` with:
   - `task`: the emitted `prompt`, verbatim.
   - `target`: `{providerInstanceId: "codex", model: <model>, options: {reasoningEffort: <effort>}}`.
     Always set `reasoningEffort`: T3 defaults it to `low`.
   - `isolation: "shared"`, and `role`: `implementation` for build and fix, `review`, or
     `research` for advise and research.
   - `clientRequestId`: `<story-id>-<mode>-<round>` (or `<topic>-<mode>-<stamp>` outside a
     story), the same on every retry of this run, so a resumed call reuses its child.
4. **Read** the result with `task_status`. Its `summary` is the child's final message.
5. **Read-only check.** Run the snapshot again and compare. Any difference is a failed run: stop,
   report what changed, and never grade or relay its output. Otherwise use the summary as the
   wrapper's answer. Grade review findings per `review-gates.md`, and save the summary as
   `<out>/<stamp>-codex-review-<scope>[-<objective slug>]-t3.md`, `<stamp>` being the review
   run's shared `PM_CODEX_STAMP`. A research answer goes to
   `docs/research/YYYY-MM-DD-<slug>-codex.md` as `codex-researcher` would write it, attributed
   "Codex (<model>) via T3", with search left to T3's Codex settings.
6. **Build and fix.** The child works in the story's worktree, which the prompt names. Parse the
   last fenced JSON block of the summary as the result `codex-builder` would relay; a missing or
   malformed one is a failed run. Nothing runner-side checks a T3 child, so run exactly what you
   run after any writer: the scope check against `pm-meta.touches` and the story's `protected`
   paths, `test-integrity.mjs` at `T1` and `T2`, and the gates. The block's `files_changed` must
   match the diff you see.
7. **Fallback.** When T3 refuses the call, the call fails, or the child ends in failure, dispatch
   the wrapper agent for the same run and record `codex via wrapper: <reason>` in the story's
   Execution notes, or in `tmp/log.md` outside a story. A read-only run that changed anything is
   not a fallback case; step 5 stops it. A build or fix child that wrote before failing leaves a
   writer's tree: scope-check it first, then fall back.

**Calibration.** A Codex review through T3 is not the calibrated `codex-reviewer` lens. Record it
in the Execution block's `panel` as `codex-reviewer-t3`. It meets the opposite-family rule, but
`retro-stats.mjs --trust` counts the story below panel and withholds its tier's bound, so a tier
whose measured panel needs `codex-reviewer` runs the maximum panel instead (`review-gates.md`). A
review that fell back to the wrapper is the calibrated lens again and is recorded as
`codex-reviewer`.

## Advisory snapshot
A `delegate_task` child can write, and an overwrite of an already modified or untracked file, or
a commit, leaves `git status --porcelain` unchanged, so compare content instead. From the checkout
root, run these before the call and keep their output:

<!-- advisory-snapshot -->
```
git rev-parse HEAD
git stash create
git -c core.quotePath=false ls-files -o --exclude-standard
git -c core.quotePath=false ls-files -o --exclude-standard | git hash-object --stdin-paths
```

They give the commit, a commit whose tree holds the tracked changes (it prints nothing when there
are none, and touches neither the working tree, the index, nor the stash list), and the untracked
files with their content hashes. Run them again after the call and compare, reading each `stash
create` commit as its tree (`git rev-parse <sha>^{tree}`), since the commit itself carries a
timestamp. Any difference is a failed run: stop, investigate what changed, and report it.

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
   `wip(<story-id>): blocked`. That commit may hold paths outside the story's scope, so it never
   ships without a fresh scope check and verdict. Then check out the integration branch.
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
only on a verifier `PASS` as usual. Before `gh pr merge` or a merge in the UI, confirm the claim
fields are unchanged at the PR head and the recorded `verifier: PASS <sha>` and, at `T1` and `T2`, `integrity: pass <sha>` name the PR head, or an
ancestor of it followed only by story-file and handoff commits or automatic merges of the
integration branch. Run the checks `environment.md` lists, and re-verify if any fails. The ship gate hook does not see this path, so
that check is yours alone; treat it as a residual risk.
Call `unwatch_pull_request` once the PR is merged or closed.

## Restart and Stop
A T3 server restart or a user Stop cancels any in-flight children. Git is the record, so nothing
committed is lost. Resume per `resume-procedure.md`; a cancelled story re-enters from its
Execution block's `status`.
