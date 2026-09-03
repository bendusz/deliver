---
description: Spawn OpenAI Codex CLI review agents over the last commit, the working tree, or the whole codebase — optionally several focused objectives in parallel — and write reports to an untracked folder.
---

Run an independent **Codex CLI code review**. You dispatch `codex-reviewer` agents backed by the
bundled Node runner; you do not review the code yourself and never run `codex` directly. Wrappers
never pass sandbox or approval flags; the runner owns them per platform (workspace-write on macOS
and Linux, full access on Windows with post-run scope detection).

Arguments: $ARGUMENTS

## 1. Parse arguments

All optional, any order, from `$ARGUMENTS`:

- **scope** — `recent` | `worktree` | `codebase`. Default `worktree`.
- **model=<id>** — Codex model id (e.g. `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`).
  Default `gpt-5.6-terra`.
- **effort=<level>** — `minimal|low|medium|high|xhigh` (`max`/`ultra` only on models that
  support them). Default `high`.
- **timeout=<minutes>** — per-agent timeout. Default `10`.
- **objectives** — every remaining token. Presets: `security`, `bugs`, `architecture`, `tests`,
  `performance`; `panel` expands to all five. Any other word or quoted phrase is a **free-form
  objective**. Zero objectives → one general review.

Preset focus lines (use verbatim in prompts):

| Preset | Focus |
|---|---|
| security | authn/authz gaps, injection, secret handling, unsafe deserialization, dependency risk |
| bugs | logic errors, edge cases, error handling, race conditions, silent failures |
| architecture | module boundaries, coupling, abstraction fit, structural drift |
| tests | coverage of changed behavior, missing edge cases, assertion quality, flakiness risk |
| performance | algorithmic complexity, N+1 patterns, unnecessary allocation/IO, hot paths |

## 2. Preflight

Run once, from the repository root (or the current directory for `codebase`):

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/codex/run.mjs" --mode review --scope "$SCOPE" --preflight
```

Stop with the runner's reason on any non-zero exit (missing CLI, not logged in, unsupported
CLI). Never run `codex` yourself.

## 3. Output directory

`<root>/untracked` if it exists, else `<root>/codex`. The runner refuses a directory that
holds tracked files and asks for another; in that case ask the user where reports should go.

## 4. Dispatch

Dispatch one `codex-reviewer` agent per objective (or a single one with no objective),
all in one message so they run in parallel, each with: `Scope`, `Out dir`, `Objective`
(preset name or phrase), and any `Model` / `Effort` / `Timeout seconds` overrides. Do not
poll processes; the agents return when the runner returns.

## 5. Index

When two or more reports exist, write `<STAMP>-codex-review-<scope>-index.md` in the output
directory listing each report path and its top three findings, then relay the digests.

## 6. Report and log

Relay the most severe findings across all reports, with report paths. If `pm/log.md` exists,
append one line in the shared-log schema: `- <YYYY-MM-DD HH:MM> <actor-id> — codex-review
<scope> [<objectives>] → <n> reports, <top finding gist>.`
