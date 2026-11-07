# State: git is the record

Keep on disk only what git cannot derive: whether the plan is approved, where each claimed story
stands, and why things were decided. Everything else is branches, commits and tracked `docs/`.

## Approval
- When planning starts, create `docs/approval.json` from `templates/approval.json.template`
  (`"status":"pending"`, the other fields `null`).
- Sign-off is conversation style. Show the plan, and only after the user says approved, write
  `{"status":"approved","approved_at":"<YYYY-MM-DD HH:MM>","plan_commit":"<sha>"}`, where
  `plan_commit` is the commit holding the signed-off `docs/plan.md`. Commit it with a log line.
- Nothing is built while the record is not `approved`.
- On a material plan change, stop: show `git diff <plan_commit> -- docs/plan.md`, ask again, and
  write a new record only on a new approval.

## Execution block
The claim commit, on the integration branch and before any dispatch, appends to the story:
```
## Execution
<!-- pm-exec: {"role_model":"<role provider/model effort>","thread":"<childThreadId>","branch":"pm/S<sprint>-<n>-<slug>","worktree":"<absolute path>","status":"<claimed|building|built|reviewing|fixing|verified|merged|blocked>","rounds":0,"verifier":"<PASS|FAIL|UNKNOWN> <sha>"} -->
```
- `role_model` is the builder's choice, such as `builder codex/gpt-6-astra high`. `thread`,
  `branch` and `worktree` come from the builder's dispatch and result (`host.md` `## Dispatch`).
- `rounds` counts fix rounds. Increment and commit it before the round's dispatch; the cap is 3.
- `verifier` is absent until the first verification, then the verifier's `STATUS` and `COMMIT`
  (`roles.md` `## verifier`). `merged` is terminal; the block stays as history.
- Only you edit the block, in your commits on the integration branch. Story branches never do.
- Fields older deliver versions wrote (`owner`, `builder`, `tier`, `panel`, counters and the like)
  are ignored; an old `in-review` status reads as `reviewing`.

## Log
- `docs/log.md` in the main checkout is the decision log, tracked, headed `# Decision log`. Each
  line is `YYYY-MM-DD HH:MM  <message>`, with the message at most 100 characters.
- Append only with `bash "${CLAUDE_PLUGIN_ROOT}/scripts/log.sh" "<message>"`, never by editing
  the file. It works from any worktree and writes the main checkout's file.
- Log sign-off, each claim, build, fix round, block and merge, and every decision you make
  without asking, with the why: `S2-3: chose SQLite over Postgres, single-user CLI, no server`.
  A long thought is two or three lines.
- Only the PM writes it. Children report back; you decide what is worth a line.
- Stage `docs/log.md` into your next commit on the integration branch, whatever it is. Make a
  log-only commit only at session end, if entries are still unstaged. Story branches never touch
  it, so it cannot conflict.
- It is a history, never a source of state. When it disagrees with git or a `pm-exec`, they win.

## Resume
Read, in order: `docs/approval.json`; `git log --first-parent <integration branch>`; every
story's `pm-exec`; `git worktree list --porcelain`; `t3_thread_read` of each thread a non-merged
block records; the last ~20 lines of `docs/log.md`. Not approved means planning; approved with no
stories means decomposition. Then re-enter each story from its `status` (steps per `loop.md`):
- `claimed`: no build yet. Dispatch the tests-first or build step.
- `building` or `fixing`: if the thread finished, take its result JSON and gate. If cancelled or
  interrupted, `t3_thread_send` to `thread`: its branch, worktree, and continue (`host.md`
  `## Messaging`). No `thread` yet: retry with the same `clientRequestId` in case the response was
  lost; if no child comes back, dispatch a new builder with the next round in the key.
- `built`: gate, then review. `reviewing`: re-gate, then a new review of the committed diff.
- `verified`: re-check that `verifier` names the branch head, then ship.
- `blocked`: present the blocker to the user before anything else.
- `merged`: finish any cleanup `host.md` `## Worktrees` lists, then take the next story.
A recorded worktree `git worktree list` no longer shows: if its branch survives, `git worktree add`
it at a new path, record that path, and name it in any fix round. Otherwise log it, rebuild.
