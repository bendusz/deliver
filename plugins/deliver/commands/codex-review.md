---
description: Spawn OpenAI Codex CLI review agents over the last commit, the working tree, or the whole codebase, optionally several focused objectives in parallel, and write reports to an untracked folder.
---

Dispatch `codex-reviewer` agents, backed by the bundled Node runner, for an independent Codex
review. Never review the code yourself and never run `codex`. Wrappers pass no sandbox or approval
flags; the runner owns them and keeps Codex read-only.

Arguments: $ARGUMENTS

## 1. Parse arguments

All optional, in any order:

- **Scope.** `recent`, `worktree`, or `codebase`. Default `worktree`.
- **Model.** `model=<id>`, a Codex model id. Default `gpt-6-astra`, with a one-time runner
  fallback to `gpt-5.6-sol` at `medium` if the account is refused it.
- **Effort.** `effort=<level>`, one of `none|minimal|low|medium|high|xhigh|max`. Default `high`.
- **Timeout.** `timeout=<minutes>`, the per-agent timeout. Default `10`.
- **Objectives.** Every remaining token. Presets are `security`, `bugs`, `architecture`, `tests`,
  `performance`; `panel` expands to all five; any other word or quoted phrase is free-form; none
  means one general review. The runner owns each preset's focus clause.

## 2. Scan the outgoing code for secrets

A review sends repository content to an external service, so scan everything Codex can read first.
Use `gitleaks` or `trufflehog` when installed, otherwise the bundled value patterns:
`node "${CLAUDE_PLUGIN_ROOT}/hooks/lib.mjs" scan` (quote the path; plugin roots hold spaces). A
non-zero exit means secret-shaped content: do **not** launch. Scan values, not labels; `APIClient`
is no secret, and real credentials are often lowercase.

Scan what the scope exposes, tracked and untracked non-ignored files alike, piping each command's
output through the scanner:

- `recent`, `worktree`: `git diff <range>`, then
  `git ls-files --others --exclude-standard -z | xargs -0 cat`.
- `codebase`: `git ls-files --cached --others --exclude-standard -z | xargs -0 cat`, or in
  PowerShell `git ls-files --cached --others --exclude-standard | ForEach-Object { Get-Content $_ -Raw }`.

## 3. Preflight

Run once from the repository root, or the current directory for `codebase`:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/codex/run.mjs" --mode review --scope "$SCOPE" --preflight
```

Stop with the runner's reason on any non-zero exit.

## 4. Output directory

Use `<root>/untracked` if it exists, else `<root>/codex`, and announce it when launching. If the
runner rejects both, relay its reason and ask the user to clear one. After the run, append any
`gitignore_rule_needed` rule a digest reports to `.gitignore`. When that file already exists, show
the diff and get the user's approval first, whether or not the report directory pre-existed.

## 5. Dispatch

Compute one run stamp now, as `YYYYMMDD-HHMMSS`. Every reviewer gets it as `Stamp` and passes it to
the runner as `PM_CODEX_STAMP`, so the reports and the index sort together.

Dispatch one `codex-reviewer` per objective, or one with no objective, all in a single message so
they run in parallel, each with `Scope`, `Out dir`, `Stamp`, `Objective` (a preset name or phrase),
and any `Model` or `Effort` override. `timeout=` is minutes and the agent's `Timeout seconds` is
seconds, so `timeout=5` becomes `Timeout seconds: 300`; omit it when unset, and the runner's
600-second default applies. Do not poll; agents return when the runner returns.

## 6. Index

With two or more reports, write `<stamp>-codex-review-<scope>-index.md` in the output directory,
using that shared stamp, listing each report path with its top three findings.

## 7. Report and log

Relay the most severe findings across all reports, with report paths. If `pm/log.md` exists, append
one line in the shared-log schema: `- <YYYY-MM-DD HH:MM> <actor-id>: codex-review <scope>
[<objectives>], <n> reports, <top finding gist>.`
