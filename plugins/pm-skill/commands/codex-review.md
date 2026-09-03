---
description: Spawn OpenAI Codex CLI review agents over the last commit, the working tree, or the whole codebase, optionally several focused objectives in parallel, and write reports to an untracked folder.
---

Run an independent Codex CLI code review. You dispatch `codex-reviewer` agents backed by the bundled
Node runner. You do not review the code yourself and never run `codex` directly. Wrappers never pass
sandbox or approval flags; these commands run Codex read-only on every platform, and the runner owns
the flags.

Arguments: $ARGUMENTS

## 1. Parse arguments

All optional, in any order, from `$ARGUMENTS`:

- **scope**: `recent`, `worktree`, or `codebase`. Default `worktree`.
- **model=<id>**: a Codex model id such as `gpt-5.6-sol`, `gpt-5.6-terra`, or `gpt-5.6-luna`.
  Default `gpt-5.6-terra`.
- **effort=<level>**: `none|minimal|low|medium|high|xhigh|max`. Default `high`.
- **timeout=<minutes>**: the per-agent timeout. Default `10`.
- **objectives**: every remaining token. The presets are `security`, `bugs`, `architecture`, `tests`,
  and `performance`, and `panel` expands to all five. Any other word or quoted phrase is a free-form
  objective. Zero objectives means one general review. The runner owns each preset's focus clause.

## 2. Scan the outgoing code for secrets

A review sends repository content to an external service, so scan it before you launch. Prefer a real
scanner when one is installed (`gitleaks`, `trufflehog`); otherwise pipe the diff through the bundled
value patterns with `git diff <range> | node "${CLAUDE_PLUGIN_ROOT}/hooks/lib.mjs" scan`. Quote the
path, because plugin roots can hold spaces; a non-zero exit means secret-shaped content. If it trips,
do **not** launch the review. Scan values, not labels: a name like `APIClient` is not a secret, and
real credentials are often lowercase. For `codebase` scope there is no diff; scan the tracked tree instead with `git ls-files -z | xargs -0 cat | node "${CLAUDE_PLUGIN_ROOT}/hooks/lib.mjs" scan` (PowerShell: `git ls-files | ForEach-Object { Get-Content $_ -Raw } | node ... scan`).

## 3. Preflight

Run once, from the repository root, or from the current directory for `codebase`:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/codex/run.mjs" --mode review --scope "$SCOPE" --preflight
```

Preflight verifies the CLI is present and that you are logged in. For the `recent` and `worktree`
scopes it also verifies that the installed CLI supports the review flags the runner needs, among them
`--commit`, `--uncommitted`, and `--ignore-rules`. The `codebase` scope uses plain `exec` and is not
gated on that check. Stop with the runner's reason on any non-zero exit: missing CLI, not logged in,
or unsupported CLI. Never run `codex` yourself.

## 4. Output directory

Use `<root>/untracked` if it exists, else `<root>/codex`. Announce the output directory when
launching. The runner rejects a directory that holds tracked files with exit 65, and if both
`untracked/` and `codex/` are unusable the user must clear one of them first. After the run, if any
digest reports `gitignore_rule_needed`, append that root-anchored rule to `.gitignore`. For a
pre-existing non-ignored directory, an `untracked/` that may already hold user files, ask the user
before editing `.gitignore`.

## 5. Dispatch

Compute one run stamp yourself, now, in the format `YYYYMMDD-HHMMSS`. Every reviewer in this run
shares it, so the reports and the index sort together instead of each runner stamping its own start
second.

Dispatch one `codex-reviewer` agent per objective, or a single one with no objective, all in one
message so they run in parallel, each with `Scope`, `Out dir`, `Stamp` (that shared value),
`Objective` (a preset name or phrase), and any `Model` or `Effort` overrides. The parsed
`timeout=<minutes>` is in minutes and the agent's `Timeout seconds` input is in seconds, so convert:
pass
`Timeout seconds: <timeout minutes times 60>`, meaning `timeout=5` becomes `Timeout seconds: 300`.
Omit `Timeout seconds` entirely when the user did not set `timeout=`, and the runner's default of
600 seconds then applies. Do not poll processes; the agents return when the runner returns.

## 6. Index

When two or more reports exist, write `<stamp>-codex-review-<scope>-index.md` in the output
directory, using the shared stamp from step 5, and list each report path with its top three findings.
Then relay the digests.

## 7. Report and log

Relay the most severe findings across all reports, with report paths. If `pm/log.md` exists, append
one line in the shared-log schema: `- <YYYY-MM-DD HH:MM> <actor-id>: codex-review <scope>
[<objectives>], <n> reports, <top finding gist>.`
