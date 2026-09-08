# State health (doctor)

`/deliver:doctor` runs these when `docs/approval.json` or a legacy `pm/` exists, reporting `OK` or
`DRIFT` per check. Start from `node "${CLAUDE_PLUGIN_ROOT}/hooks/lib.mjs" state .`, which prints the
derived position as JSON (`approval.plan_changed`, `unmerged`, `claims`, `worktrees`,
`uncommitted`, `handoff.current`), and inspect git only for what it does not carry.

- `docs/approval.json` parses, has a valid `status`, is a regular file, and is tracked
  (`git ls-files --error-unmatch docs/approval.json` succeeds; `git check-ignore` fails).
- The plan's Sign-off line agrees with the marker: a filled-in line beside `pending`, or a blank
  line beside `approved`, is DRIFT.
- `plan_digest` equals `git hash-object docs/plan.md`; otherwise the plan changed since approval,
  the hook and the runner are already blocking implementation writes, and the user confirms the
  edit (refresh the digest) or runs `/deliver:correct-course`. A null digest on an approved
  marker is DRIFT too: nothing enforces the plan then.
- `sprints_without_retro` is empty, or the scale skips retrospectives; `unreadable` is empty.
- Every story's `pm-exec` block parses, its `status` is one of the six, an unmerged block has an
  `owner` and a `builder`, and its `branch` exists locally or on the remote. A story branch with no
  Execution block, or two blocks naming one branch, is DRIFT.
- Claims: an unmerged branch with no commit in 14 days is a possibly stale claim, reported with its
  owner and never released automatically. Overlapping `pm-meta.touches` between two unmerged
  stories with different owners is reported.
- Worktrees: every `git worktree list` entry beyond the main checkout maps to an unmerged story
  branch; the rest are orphans, pruned only when clean.
- `docs/handoff/<you>.md`, when present, has a `BASE_COMMIT`, and `git diff --name-only
  <BASE_COMMIT> HEAD` is empty or lists only that handoff file; otherwise STALE.
- Legacy: `pm/pm-state.json`, `tmp/pm-state.json`, `pm/actors/`, `pm/log.md`,
  `.claude/rules/pm-state.md`, or a `pm/log.md merge=union` attribute means the 0.24 migration has
  not run.
- `tmp/` is ignored, and your actor id is derivable, meaning git `user.email` or `user.name` is set.
