# State health (doctor)

`/deliver:doctor` runs these when `docs/approval.json` or a legacy `pm/` exists, reporting `OK` or
`DRIFT` per check.

- `docs/approval.json` parses, has a valid `status`, is a regular file, and is tracked
  (`git ls-files --error-unmatch docs/approval.json` succeeds; `git check-ignore` fails).
- The plan's Sign-off line agrees with the marker: a filled-in line beside `pending`, or a blank
  line beside `approved`, is DRIFT.
- `plan_digest` equals `git hash-object docs/plan.md`; otherwise the plan changed since approval
  and the user confirms it or runs `/deliver:correct-course`.
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
