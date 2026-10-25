# State: git is the record

Keep on disk only what git cannot derive: whether the plan is approved, where each claimed story
stands, the reasoning between commits, and an optional handoff. Everything else, who holds what,
what shipped, and why, is the branches, the commits, and the tracked `docs/` artifacts. Solo is a team of one: the layout is
identical.

## What lives where

| Fact | Where |
| --- | --- |
| The plan is approved, by whom, when | `docs/approval.json` |
| Scale, checkpoint policy, integration branch, skeleton | `docs/plan.md`, Delivery mode |
| What each story must do | `docs/stories/*.md` |
| Who holds a story, its builder, branch, status, tier, protected paths, gate verdicts, and loop counters | the story's `## Execution` block |
| What a story changed, why, and how it was verified | the `--no-ff` merge commit body |
| A `T2` story's holdout checks | the private ref `refs/deliver/holdout/<story-id>`, never checked out or pushed (`implementation-loop.md` state 1) |
| The project history | `git log --first-parent <integration branch>` |
| Progress, decisions, blockers, and next steps as they happen | `tmp/log.md`, gitignored, local to this checkout |
| A session's next step | `docs/handoff/<actor-id>.md`, optional |
| Scratch, prompts, raw output, diffs, worktrees, the log | `tmp/`, gitignored, never load-bearing |

Phase and sprint are derived, in this order of precedence. A marker that is not `approved`, or
whose plan changed since approval, is planning whenever a spec, plan, or story exists, since it
halts every actor (`tiny` starts here, having no spec), and discovery when none of the three
does; a completed sprint with no `docs/retros/sprint-<n>.md` is retrospective, except at `tiny`
and `small`; any story present is implementation, or done when all are `merged`, and an
unreadable story counts as unmerged; then neither spec nor plan is discovery, a spec without a
plan is specification, and a plan without stories is decomposition.
The current sprint is the lowest sprint with an unmerged story.

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
  the Sign-off line is written. The sign-off hook compares it with the plan on every implementation write and the runner
  before every dispatch, so a plan that changed since approval blocks building until
  `/deliver:correct-course` runs or, after a cosmetic edit, the digest is refreshed. Both fail
  open when the digest is null, the plan file is missing, or git cannot answer; the runner refuses
  a plan that is not a regular file.
  `/deliver:correct-course` sets `revoked` for a material change and refreshes the digest for a
  cosmetic one.
- The file must be tracked and a regular file. The runner checks both before it writes.

## The story's `## Execution` block

A claimed story ends with an `## Execution` section holding one JSON comment:

```
## Execution
<!-- pm-exec: {"owner":"v-bende-a1b2c3d4e5f6","builder":"expert-builder","branch":"pm/S1-2-add-and-list","status":"in-review","tier":"T1","protected":["tests/acceptance/add-and-list.test.js"],"protected_base":"3f2a9c1e5b7d4f60a8e2c9b1d3f5a7c9e1b3d5f7","integrity":"pass 8c4e1a7b2d9f3e6c5a1b8d7e4f2a9c3b6d1e5f80","rounds":0,"retries":0,"deliver":"0.29.0","updated":"2026-09-07 10:15"} -->
- 2026-09-07 11:02 external review skipped: codex CLI absent on this machine.
```

- `owner` is your actor id (below). `builder` is the resolved route, never `auto`. `status` is
  `claimed`, `building`, `built`, `in-review`, `merged`, or `blocked`.
- `tier` is `T0`, `T1`, or `T2`, copied from the story's `Tier` at the claim
  (`decomposition.md`).
- `protected` lists the repo-relative paths no builder may change: the acceptance tests
  `test-engineer` wrote before the build, mandatory at `T1` and `T2`. It is `[]` when there are
  none. `protected_base` is the full SHA of the commit that added them. The scope check rejects
  any change to them since that commit, and the integrity gate gets both.
- `integrity` is `"<pass|fail> <sha>"`: the latest `test-integrity.mjs` verdict and the full
  commit SHA it judged, recorded after every writer run at `T1` and `T2`. It is `n/a` at `T0`.
- `verifier` is `"<PASS|FAIL|UNKNOWN> <sha>"`: the latest `pm-verifier` verdict and the full
  commit SHA it judged, recorded at state 5 and absent before the first verification. The
  `require-verified.mjs` hook blocks a merge of the story branch unless this reads `PASS` and,
  at `T1` and `T2`, `integrity` reads `pass`. Each SHA must be the branch head, or a commit after
  which the branch gained only commits to the story file or `docs/handoff/*.md` and merges whose
  tree equals the automatic merge of their parents outside the story file.
- **Claim fields.** `tier`, `deliver`, `branch`, `protected`, `protected_base`, and pm-meta
  `integrity_allow` are set on the integration branch: the first three in the claim commit, the
  protected pair in a `chore(<story-id>): protect` commit that you then merge into the story
  branch. The ship gate and the integrity gate read the integration copy, and the hook blocks a
  branch whose copy differs. Only `verifier` and `integrity` are trusted from the story branch. A
  claim with neither `deliver` nor `tier` predates these fields and ships on the old rules. Any
  other claim needs a parseable `deliver` when it has one and a `tier` of exactly `T0`, `T1`, or
  `T2`, and at `T1` and `T2` a non-empty `protected` and a `protected_base`.
- `rounds` (fix and re-review rounds) and `retries` (builder retries) bound the loop across
  sessions. Increment and commit **before** the dispatch they count, so a builder that dies before
  committing still spent its attempt. The **caps** are 3 rounds and 2 retries.
- `deliver` is the plugin version that claimed the story: the `version` in
  `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json`, read at the claim and never changed after.
  It lets `retro-stats.mjs` compare loop counters across plugin versions.
- Below the comment, optional dated bullet lines record what has no commit of its own: a skipped
  external review, an escalation, a blocker, a worktree that vanished.
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

## `tmp/log.md` (the running narrative)

Create it from `${CLAUDE_PLUGIN_ROOT}/templates/log.md.template` at sign-off. It lives under the
gitignored `tmp/`, so it is never committed and never leaves this checkout. It is append-only and
read by people and by a resuming session on the same machine. Nothing derives phase, ownership,
or counters from it; when it disagrees with an Execution block or with git, they are right, and
a checkout without it loses nothing it needs.

Append one entry at each significant story update: the claim, the build commit, every fix round, a
block or escalation, the merge, and any decision you made without asking the user. Also append one
at sign-off and one at each sprint boundary. An entry is a heading and 3 or 4 sentences covering
progress, decisions and why, blockers, and the next step:

```
## 2026-10-11T14:32:05+02:00 S1-2 fix round 1 (v-bende-a1b2c3d4e5f6)
The review found one major: the list endpoint returned unpaginated rows. Chose cursor pagination
over offset because the table is append-heavy; `codex-advisor` agreed. No blockers. Next: re-run
the gates, then re-review the round's diff.
```

- The timestamp is ISO 8601 with the UTC offset, read from the system clock, never estimated.
- Write to the main checkout's `tmp/log.md`, also when the work runs in a worktree, so one file
  holds the whole account.
- A decision that must outlive this machine goes where it is tracked: the merge commit body, the
  story's Execution notes, the plan, or the handoff. The log only narrates.
- Keep entries short. Findings, diffs, and command output stay in their own artifacts; the entry
  points at them.

## Projects managed before 0.24

They carry `pm/pm-state.json`, `pm/actors/`, and `pm/log.md`. The sign-off hook still honours the
old `signed_off` field until the marker exists, and the runner refuses to write until then.
`migrations.md` owns the one-commit migration `/deliver:resume` performs.
