---
description: Spawn OpenAI Codex CLI review agents over the last commit, the working tree, or the whole codebase — optionally several focused objectives in parallel — and write reports to an untracked folder.
---

Run an independent **Codex CLI code review**. You dispatch `codex-reviewer` agents backed by the
bundled Node runner; you do not review the code yourself and never run `codex` directly.
Wrappers never pass sandbox or approval flags; these commands run Codex read-only on every
platform (the runner owns the flags).

Arguments: $ARGUMENTS

## 1. Parse arguments

All optional, any order, from `$ARGUMENTS`:

- **scope** — `recent` | `worktree` | `codebase`. Default `worktree`.
- **model=<id>** — Codex model id (e.g. `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`).
  Default `gpt-5.6-terra`.
- **effort=<level>** — `none|minimal|low|medium|high|xhigh|max`. Default `high`.
- **timeout=<minutes>** — per-agent timeout. Default `10`.
- **objectives** — every remaining token. Presets: `security`, `bugs`, `architecture`, `tests`,
  `performance`; `panel` expands to all five. Any other word or quoted phrase is a **free-form
  objective**. Zero objectives → one general review. The runner owns each preset's focus clause.

## 2. Preflight

Run once, from the repository root (or the current directory for `codebase`):

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/codex/run.mjs" --mode review --scope "$SCOPE" --preflight
```

Preflight verifies the CLI is present, that you are logged in, and that the installed CLI
supports the review flags the runner needs (`--commit` and `--uncommitted`). Stop with the
runner's reason on any non-zero exit (missing CLI, not logged in, unsupported CLI). Never run
`codex` yourself.

## 3. Output directory

`<root>/untracked` if it exists, else `<root>/codex`. Announce the output directory when
launching. The runner rejects (exit 65) a directory that holds tracked files; both `untracked/`
and `codex/` unusable means the user must clear one of them first. After the run, if any digest
reports `gitignore_rule_needed`, append that root-anchored rule to `.gitignore`; for a
pre-existing non-ignored directory (an `untracked/` that may already hold user files), ask the
user before editing `.gitignore`.

## 4. Dispatch

Dispatch one `codex-reviewer` agent per objective (or a single one with no objective),
all in one message so they run in parallel, each with: `Scope`, `Out dir`, `Objective`
(preset name or phrase), and any `Model` / `Effort` overrides. The parsed `timeout=<minutes>`
is a **minutes** value; the agent's `Timeout seconds` input is **seconds**, so convert:
pass `Timeout seconds: <timeout minutes × 60>` (e.g. `timeout=5` → `Timeout seconds: 300`).
Omit `Timeout seconds` entirely when the user did not set `timeout=` — the agent's own default
of 600 seconds then applies. Do not poll processes; the agents return when the runner returns.

## 5. Index

When two or more reports exist, write `<scope>-index.md`, prefixed with the same
`YYYYMMDD-HHMMSS` stamp the runner used for the reports, in the output directory listing each
report path and its top three findings, then relay the digests.

## 6. Report and log

Relay the most severe findings across all reports, with report paths. If `pm/log.md` exists,
append one line in the shared-log schema: `- <YYYY-MM-DD HH:MM> <actor-id> — codex-review
<scope> [<objectives>] → <n> reports, <top finding gist>.`
