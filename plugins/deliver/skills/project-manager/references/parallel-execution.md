# Parallel execution (`[P]` stories)

A delta on `implementation-loop.md`. Build several independent stories at once in isolated git
worktrees, then integrate them one at a time. The loop still owns routing, path scope checks, retry
and fix bounds, gates, review, verification, ship, and the Execution blocks; only the differences
below are new. Parallel is never required: when worktrees are unsupported, setup fails, or a story
misbehaves, finish it sequentially.

Builders edit separate worktrees. You run all git operations serially, and none at all while a
wave of builders is running.

## 1. Choose the batch (at sprint start)
A batch is the sprint's stories that are all of:
- build-ready by loop state 0, and marked `[P]`; and
- their `Depends on` stories are already merged; and
- they do not share a file domain. Compare each story's `pm-meta.touches`. If two would write the
  same files, **serialize** them: one this batch, the other after.

You need 2 or more stories after that filter, and `git worktree` must work. **Cap** concurrency at 3
by default; conflict and coordination cost grows roughly with the square of the batch size. Run
larger sets in waves.

## 2. Claim the whole batch, then build in parallel
- Resolve every `auto` builder by loop state 0 before dispatch. Then, in the clean integration
  checkout, claim **every** batch story at once: append each story's Execution block with its
  owner, builder, branch, and `status: building`, and commit them together as
  `chore(<ids>): claim batch`.
- Give each story its own branch and worktree. Prefer the host's native worktree isolation if it
  offers any; otherwise
  `git worktree add tmp/worktrees/<slug> -b pm/S<sprint>-<n>-<slug> <integration_branch>`, having
  first confirmed `tmp/` is gitignored. Every dispatch for that story gets its worktree path.
- Run `--mode build --preflight` against every Codex worktree and story pair first. A failed
  preflight drops that story from the batch without consuming task quota.
- Dispatch the batch's builders together, as concurrent subagent calls in one step, each with its
  story file path and the absolute worktree root. Tell each to implement and self-check only, with
  no full test-suite run, because you run the authoritative gates serially next and shared ports and
  databases would collide.
- **Run no git command that changes a ref, the index, or a worktree while any builder is running.**
  The Codex runner fingerprints every ref in the repository, so a commit on one branch fails a
  concurrent run on another. Leave every story's edits uncommitted and every Execution block
  untouched until the whole wave has returned.
- Once the wave has returned, run loop state 1's scope check per story against its own worktree,
  prefixing each git command with `-C <worktree>`, then commit each passing story's build to its
  branch from its worktree and set `status: built`. A story that fails the scope check stops with
  its worktree preserved.
- A builder still blocked at loop state 1's retry cap gets `status: blocked` and a note. The rest
  of the batch carries on.

## 3. Integration tail, serial
Take one story at a time and land it before starting the next. Steps 1 and 2 run in that story's
worktree, so each git command takes `-C <worktree>`. Steps 3 and 4 run from the main checkout,
since git refuses to check the integration branch out twice.

1. Run loop states 2 to 5 in the worktree, in order, against the committed diff
   `git diff <integration>...HEAD`. Each fix round commits to the story branch before the gates
   re-run, as in the loop. If the worktree lacks runtime deps such as `node_modules` or `.env`,
   install them first, **never** committing those artifacts.
2. On `pm-verifier` `PASS`, merge the latest integration tip into the story branch, then re-gate
   the merged result per loop state 6. A failure re-enters loop state 4 in this worktree. If the
   merge conflicts and you cannot resolve it cleanly, **stop** rather than forcing it: escalate to
   the user with the story and the conflicting paths, set `status: blocked` with a note, and move
   to the next.
3. Ship from the main checkout per loop state 6, then run loop state 7.
4. Remove the now-clean, merged worktree with `git worktree remove`.

A partial batch still checkpoints at the sprint boundary.

## Cleanup preconditions
- **Never** remove or prune a worktree that still holds uncommitted work. A stopped or `blocked`
  story keeps its worktree for inspection.
- Remove only with `git worktree remove`, **never** `rm -rf` and **never** `--force`. Check
  `git -C <wt> status --porcelain` first, then preserve and report.
- A dirty or blocked worktree **stays** until the user resolves it, then must go. Name any worktree
  you hold in the story's Execution notes; an unnamed one is an orphan.
- Give every worktree its own branch, and never run `git gc` while worktrees are active.
- The sign-off hook is satisfied inside a worktree: `docs/approval.json` is tracked, so the
  checkout carries it.

## State and resume
Each story's Execution block carries its own `status`, `rounds`, and `retries`, and
`git worktree list` names the worktrees, so there is no batch file. After an interruption,
`resume-procedure.md`'s Parallel batches section owns the reconciliation and where each story
re-enters.
