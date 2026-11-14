# State: git is the record

Keep on disk only what git cannot derive: whether the plan is approved, where each claimed story
stands, and why things were decided. Everything else is branches, commits and tracked `docs/`.

## Approval
- When planning starts, create `docs/approval.json` from
  `<plugin>/templates/approval.json.template` (`"status":"pending"`, the other
  fields `null`).
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
<!-- pm-exec: {"role_model":"<role provider/model effort>","thread":"<childThreadId>","branch":"pm/S<sprint>-<n>-<slug>","worktree":"<absolute path>","status":"<claimed|building|built|reviewing|fixing|verified|merged|blocked>","rounds":0,"gates":"PASS <sha>","review":"PASS <sha>","verifier":"<PASS|FAIL|UNKNOWN> <sha>|WAIVED"} -->
```
- `role_model` is the builder's model as dispatched, such as `builder claudeAgent/claude-opus-5-5
  high`; a fallback rewrites it. `thread`, `branch` and `worktree` come from the builder's
  dispatch and its BRANCH/WORKTREE line (`host.md` `## Dispatch`).
- `gates` is absent until `loop.md` step 8 gates the up-to-date branch: `PASS <sha>` of that head.
  `review` is the head every reviewer passed (`loop.md` step 5).
- Tests first (`loop.md` step 2) records its child in those three fields, still `claimed`. Once
  its tests are accepted, one line goes under the `pm-exec`: `Tests: <tests sha> <test paths>`.
- `rounds` counts fix rounds. Increment and commit it before the round's dispatch; the cap is 3.
- `verifier` is absent until the first verification, then the verifier's `STATUS` and `COMMIT`
  (`roles.md` `## verifier`). `merged` is terminal; the block stays as history.
- Only you edit the block, in your commits on the integration branch. Story branches never do.
- Fields older versions wrote (`builder` in `pm-meta`, `owner`, `tier`, `panel`, counters) are
  ignored; an old `in-review` status reads as `reviewing`.

## PM records
The PM's records, never a story's code: `docs/stories/`, `docs/evidence/`, `docs/retros/`,
`docs/log.md`, `docs/ledger.md`, `docs/plan.md`, `docs/handoff.md`, `docs/go-no-go.md`,
`docs/acceptance-differences.md`,
`docs/approval.json`, `docs/acceptance.json` and `docs/gate.txt`. A commit that touches only these
leaves a gates or verifier sha valid; the merge guard holds the same list.
- `docs/gate.txt`, one line: `PASS|FAIL <sha> <YYYY-MM-DD HH:MM> <failing tests>`, the full gates on
  the integration head after each merge (`loop.md` step 8). Absent means not yet run.
- `docs/ledger.md`: one row per reviewed story's outcome (merged, blocked, replaced or abandoned),
  appended only by `<plugin>/scripts/ledger.sh`; its lineage column follows `Replaces:` lines.

## Log
- `docs/log.md` in the main checkout is the decision log, tracked, headed `# Decision log`. Each
  line is `YYYY-MM-DD HH:MM  <message>`, with the message at most 100 characters.
- Append only with `bash "<plugin>/scripts/log.sh" "<message>"`, never by editing
  the file. It works from any worktree or submodule and writes that repo's main checkout's file.
- Log sign-off, each claim, build, fix round, block and merge, and every decision you make
  without asking, with the why: `S2-3: chose SQLite over Postgres, single-user CLI, no server`.
  A long thought is two or three lines.
- Only the PM writes it. Children report back; you decide what is worth a line.
- Stage `docs/log.md` into your next integration-branch commit, whatever it is; a log-only commit
  only at session end, for entries still unstaged. Story branches never touch it: no conflicts.
- It is a history, never a source of state. When it disagrees with git or a `pm-exec`, they win.

## Handoff
At each sprint boundary, after the demo, rotate the PM thread: write `docs/handoff.md` from
`<plugin>/templates/handoff.md.template`, commit it, and tell the user to continue in a new
thread with `/bstack:resume`. Long threads lose rules to compaction; a fresh one reads them again.

## Resume
Read, in order: `docs/handoff.md` if present, then skip what its SKIP line lists; `docs/approval.json`; `git log --first-parent <integration branch>`; every
story's `pm-exec`; `git worktree list --porcelain`; `t3_thread_read` of each thread a non-merged
block records; the last ~20 lines of `docs/log.md`. Not approved means planning; approved with no
stories means decomposition. Then re-enter each story from its `status` (steps per `loop.md`):
- `claimed`, no `thread`: dispatch step 2 or 3. Its fixed key returns the child of a lost response.
- `claimed`, a `thread`, no `Tests:` line: the tests child. Finished: check its last result
  (step 2). Cancelled or interrupted: `t3_thread_send` it to continue, as step 3 resumes a build.
- `claimed` with a `Tests:` line: the tests are accepted and their worktree is meant to go. Finish
  any of its cleanup step 2 left undone, then build (step 3).
- `building`: if the thread finished, take its reply and gate. If cancelled or
  interrupted, `t3_thread_send` to `thread`: its branch, worktree, and continue (`host.md`
  `## Messaging`). No `thread` yet: retry with the same `clientRequestId` in case the response was
  lost; if no child comes back, dispatch a new builder with the next round in the key.
- `fixing`: first make sure round `rounds` was sent. If the thread's last message from you is not
  that round's Fix list, send it again under the same `<id>-fix-<round>` key: T3 returns the first
  send if there was one, and the round is not spent twice. Never gate a result that predates the
  send. Then, as `building`: take the finished result and gate, or tell an interrupted child to
  continue.
- `built`: gate, then review. `reviewing`: re-gate, then a new review of the committed diff.
- `verified`: re-check that `verifier` names the branch head, then ship.
- `blocked`: present the blocker to the user first, unless a `Replaced by:` line makes it history.
- `merged`: finish any cleanup `host.md` `## Worktrees` lists, then take the next story.
From `building` to `verified`, a recorded worktree no longer listed: if its branch survives,
`git worktree add` it at a new path, record it and name it in any fix round; else log it, rebuild.
