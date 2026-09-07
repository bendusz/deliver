# State: git is the record

Keep on disk only what git cannot derive: whether the plan is approved, where each claimed story
stands, and an optional handoff. Everything else, who holds what, what shipped, and why, is the
branches, the commits, and the tracked `docs/` artifacts. Solo is a team of one: the layout is
identical.

## What lives where

| Fact | Where |
| --- | --- |
| The plan is approved, by whom, when | `docs/approval.json` |
| Scale, checkpoint policy, integration branch | `docs/plan.md`, Delivery mode |
| What each story must do | `docs/stories/*.md` |
| Who holds a story, its builder, branch, status, and loop counters | the story's `## Execution` block |
| What a story changed, why, and how it was verified | the `--no-ff` merge commit body |
| The project history | `git log --first-parent <integration branch>` |
| A session's next step | `docs/handoff/<actor-id>.md`, optional |
| Scratch, prompts, raw output, diffs, worktrees | `tmp/`, gitignored, never load-bearing |

Phase and sprint are derived. No `docs/spec.md` is discovery; a spec without a plan is
specification; a plan whose marker is not `approved` is planning; stories present is
implementation; the current sprint is the lowest sprint with an unmerged story.

**Never** write secrets or credentials into any tracked file. Reference secret *locations*
("`.env` on the box"), never values. The bundled `pm-secrets-guard.mjs` hook is a mechanical
backstop for high-confidence token shapes under `docs/`; the rule is yours to hold.

## `docs/approval.json` (the marker)

Create it from `${CLAUDE_PLUGIN_ROOT}/templates/approval.json.template` when planning starts,
with `status: pending`. Fields: `status` (`pending`, `approved`, `revoked`), `approver`,
`approved_date`, `plan_digest`, `updated`.

- `status` is load-bearing and global. While it is anything but `approved`, the
  `require-signoff.mjs` hook blocks every `Write`, `Edit`, and `MultiEdit` call except those
  targeting `docs/`, `pm/`, `tmp/`, `.git/`, `.claude/rules/`, `.specdd/`, any `.sdd` file,
  `CLAUDE.md`, `AGENTS.md`, `.gitignore`, or `.gitattributes`, and the Codex runner refuses to
  write. The hook fails open on any uncertainty and never sees writes made through `Bash`, so the
  behavioural rule still carries the gate.
- Set `approved`, with `approver` and `approved_date`, only at the sign-off gate, in the same
  commit as the plan's Sign-off line. `plan_digest` is `git hash-object docs/plan.md`, taken after
  the Sign-off line is written; `/deliver:doctor` reports a plan that changed since.
  `/deliver:correct-course` sets `revoked` for a material change and refreshes the digest for a
  cosmetic one.
- The file must be tracked and a regular file. The runner checks both before it writes.

## The story's `## Execution` block

A claimed story ends with an `## Execution` section holding one JSON comment:

```
## Execution
<!-- pm-exec: {"owner":"v-bende-a1b2c3d4e5f6","builder":"expert-builder","branch":"pm/S1-2-add-and-list","status":"building","rounds":0,"retries":0,"updated":"2026-09-07 10:15"} -->
- 2026-09-07 11:02 external review skipped: codex CLI absent on this machine.
```

- `owner` is your actor id (below). `builder` is the resolved route, never `auto`. `status` is
  `claimed`, `building`, `built`, `in-review`, `merged`, or `blocked`.
- `rounds` (fix and re-review rounds) and `retries` (builder retries) bound the loop across
  sessions. Increment and commit **before** the dispatch they count, so a builder that dies before
  committing still spent its attempt. The **caps** are 3 rounds and 2 retries.
- Below the comment, optional dated bullet lines record what has no commit of its own: a skipped
  external review, an escalation, a blocker, a worktree that vanished. This is where the old
  logbook's mid-flight entries go.
- Decomposition never writes the section; the claim commit adds it. `merged` is terminal and the
  block stays as history.

## Claims, branches, and commits

- **Claim.** On the clean, freshly pulled integration branch, confirm no `pm/<story-id>-*` branch
  exists locally or on the remote and no Execution block names another owner. One commit adds the
  Execution block with `status: claimed`; then create the branch. Push the claim only under a
  standing push permission, and say so when you cannot, because until it is pushed only you can
  see it.
- A branch or block held by someone else is their claim. A quiet one is possibly stale, never free
  to take: `/deliver:doctor` flags it and a person decides.
- **Commit as you go** on the story branch: after the build, after every fix round, and whenever
  the Execution block changes. The review diff is `git diff <integration>...HEAD` plus any
  uncommitted paths. Commit only the story's paths and the story file, never `git add -A`.
- **Parallel batches commit nothing while a wave runs.** The Codex runner fingerprints every ref in
  the repository, so a commit on story A's branch fails story B's run. `parallel-execution.md` owns
  the timing.
- **Ship** with a `--no-ff` merge whose body follows the format in `implementation-loop.md`. That
  body is the story's record; nothing else needs writing.

## Actor identity (derived, never configured)

Your actor id comes from git `user.email`, or from `user.name` when no email is set:
`node "${CLAUDE_PLUGIN_ROOT}/hooks/lib.mjs" actor-id .`. Never construct it by hand. It fills
`owner` and names your handoff file. Without any identity the command exits non-zero, so set
`git config user.email` before claiming a story.

## `docs/handoff/<actor-id>.md` (optional)

`/deliver:handoff` writes it from `${CLAUDE_PLUGIN_ROOT}/templates/HANDOFF.md.template`:
agent-to-agent, token-efficient, pointers over prose, with a `BASE_COMMIT` line. It is current
while nothing but the handoff file itself has changed since that commit, and the session hook says
which. **Overwrite** it each handoff,
since history is git. Durable decisions never live only here: they go to the spec, plan, story,
or constitution.

## Projects managed before 0.24

They carry `pm/pm-state.json`, `pm/actors/`, and `pm/log.md`. The sign-off hook still honours the
old `signed_off` field until the marker exists, and the runner refuses to write until then.
`migrations.md` owns the one-commit migration `/deliver:resume` performs.
