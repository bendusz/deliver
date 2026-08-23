# Codex CLI reference (for pm-skill's codex commands)

Everything here was re-verified on 2026-08-23 against **codex-cli 0.149.0**, the
[official command reference](https://learn.chatgpt.com/docs/developer-commands), and local help
output. It backs `/pm-skill:codex-review`, `/pm-skill:codex-help`, `codex-researcher`, and the
write-capable `codex-builder` agent.
Re-verify against `codex exec --help` / `codex exec review --help` when the
CLI major-bumps — third-party blogs are unreliable (several claim a `--effort` flag that does not
exist).

## Invocation shapes

| Task | Command |
|---|---|
| One-shot non-interactive run | `codex exec [OPTIONS] [PROMPT]` (alias `codex e`; prompt via arg, stdin, or `-`) |
| Non-interactive code review | `codex exec review [OPTIONS] [SCOPE]` (`codex review` is a thin alias) |
| Resume a prior exec session | `codex exec resume --last "<follow-up>"` or `codex exec resume <SESSION_ID>` |
| Auth check | `codex login status` — exit 0 logged in, non-zero logged out |

## Flag matrix — `codex exec` vs `codex exec review`

| Flag | `exec` | `exec review` | Notes |
|---|---|---|---|
| `-m, --model <id>` | ✓ | ✓ | |
| `-c, --config key=value` | ✓ | ✓ | value parsed as TOML, falls back to literal string |
| `-o, --output-last-message <file>` | ✓ | ✓ | final agent message → file; the review report |
| `--json` | ✓ | ✓ | JSONL event stream on stdout |
| `--output-schema <file>` | ✓ | ✓ | JSON Schema for the final response |
| `--ephemeral` | ✓ | ✓ | no session files persisted |
| `--ignore-user-config` | ✓ | ✓ | ignores `$CODEX_HOME/config.toml`; auth still uses `CODEX_HOME` |
| `--strict-config` | ✓ | ✓ | rejects unrecognized config keys instead of ignoring them |
| `--skip-git-repo-check` | ✓ | ✓ | |
| `-s, --sandbox <mode>` | ✓ | ✗ **exit 2** | exec default is `read-only`; review is read-only by design |
| `-C, --cd <dir>` | ✓ | ✗ **exit 2** | for review, `cd` to the repo root first |
| `--color <always\|never\|auto>` | ✓ | ✗ **exit 2** | cost us a 5-agent run; keep it off review |
| `-i, --image <file>` | ✓ | ✗ | |
| `--dangerously-bypass-approvals-and-sandbox` (`--yolo`) | ✓ | ✓ | never pass in pm-skill commands |
| Reasoning effort | `-c model_reasoning_effort="<level>"` | same | **no dedicated flag**; `-e`/`--effort` do not exist |

Approvals: `codex exec` hard-sets approval to `never` (no `-a/--ask-for-approval`; failures are
returned to the model). `--full-auto` is deprecated (hidden alias for `--sandbox workspace-write`).

## Review scope semantics — mutually exclusive, incl. with PROMPT

Exactly one of (clap `conflicts_with_all`, verified live — combining any two is **exit 2**):

| Scope | Meaning |
|---|---|
| `--uncommitted` | staged + unstaged + untracked changes |
| `--base <branch>` | diff against a base branch (PR-style) |
| `--commit <sha>` | changes introduced by one commit (`--title` labels it, requires `--commit`) |
| `PROMPT` (or `-`) | custom-instructions review — the prompt IS the scope |
| *(none)* | error: `Specify --uncommitted, --base, --commit, or provide custom review instructions` |

Consequence for objective-focused reviews: you cannot attach "focus on security" to `--uncommitted`
— use **prompt-as-scope** ("Review the uncommitted changes — staged, unstaged, and untracked.
Focus exclusively on …"). Native scope flags are still preferred whenever no custom objective is
needed (deterministic diff selection; prompt-as-scope is a capability fallback). Whole-codebase
review is not native at all: use `codex exec --sandbox read-only` with an audit prompt.

## Model lineup (as of GPT-5.6 GA, 2026-07-09)

| Model | Position | API price /1M in/out |
|---|---|---|
| `gpt-5.6-sol` | flagship; strongest coding judgment; default for paid ChatGPT plans | $4 / $20 promotional pricing |
| `gpt-5.6-terra` | balanced everyday workhorse | $2.50 / $15 |
| `gpt-5.6-luna` | fast/cheap, high volume | $1 / $6 |
| `gpt-5.5`, `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.3-codex` | previous generations, still selectable (`5.4-mini` ≈ 30% of 5.4 quota cost) | — |

- The [official GPT-5.6 Sol model page](https://developers.openai.com/api/docs/models/gpt-5.6-sol)
  lists `none | low | medium | high | xhigh | max` reasoning effort. The builder uses `high`.
- **No dedicated review model exists**; `review_model` in `~/.codex/config.toml` overrides the
  session model for `/review` — pm-skill never touches that file, passing `-m`/`-c` per call.
- ChatGPT sign-in is quota-based (Free/Go: Terra only); API-key auth is per-token.

## pm-skill's chosen defaults (decided 2026-07-16)

| Command | Model | Effort | Rationale |
|---|---|---|---|
| `/pm-skill:codex-review` | `gpt-5.6-terra` | `high` | balanced cost for possibly-parallel review agents; Sol@xhigh available via `model=`/`effort=` for high-stakes reviews |
| `/pm-skill:codex-help` | `gpt-5.6-sol` | `medium` | judgment work gets the top tier; used sparingly by design |
| `codex-builder` | `gpt-5.6-sol` | `high` | precise implementation and fix work; strongest coding judgement with a bounded brief |

Scope keywords: `recent` = last commit (`--commit HEAD`), `worktree` = `--uncommitted` (default),
`codebase` = read-only `codex exec` audit.

## Auth, exit codes, output streams

- Login alternatives: `codex login`, or `printenv OPENAI_API_KEY | codex login --with-api-key`
  (**`CODEX_API_KEY` is not a supported path**).
- Unauthenticated `codex exec` retries ~5× (~15–20 s) then exits 1 — always gate on
  `codex login status` first.
- Exit codes: `0` success · `1` runtime/auth failure · `2` CLI usage error.
- Streams: progress + session header (model/sandbox/effort/session id) → **stderr**; final
  message → **stdout** (or the `-o` file).

## Write-capable builder invocation, added 2026-08-22 with codex-cli 0.149.0

The builder does not assemble this command in agent prose. It calls the bundled
`scripts/codex-builder-run.sh`, which validates the worktree, story, fix evidence, PM sign-off,
auth, and required CLI flags before launching:

```sh
codex exec \
  --ignore-user-config \
  --ignore-rules \
  --strict-config \
  -C "$WORKTREE" \
  --sandbox workspace-write \
  --ephemeral \
  --color never \
  -m gpt-5.6-sol \
  -c model_reasoning_effort=high \
  -c 'sandbox_workspace_write.network_access=false' \
  -c 'sandbox_workspace_write.exclude_slash_tmp=true' \
  -c 'sandbox_workspace_write.exclude_tmpdir_env_var=true' \
  -c 'shell_environment_policy.inherit="core"' \
  -c 'shell_environment_policy.ignore_default_excludes=false' \
  -c 'shell_environment_policy.experimental_use_profile=false' \
  -c 'shell_environment_policy.set.TMPDIR="<worktree>/tmp/codex-runtime/<run>"' \
  -c 'allow_login_shell=false' \
  -c 'agents.enabled=false' \
  -c 'web_search="disabled"' \
  -c 'mcp_servers={}' \
  -c 'features.hooks=false' \
  --output-schema "$RESULT_SCHEMA" \
  -o "$SCRATCH/result.json" \
  - < "$SCRATCH/prompt.md"
```

The runner never accepts free-form Codex arguments and never passes `--add-dir`, `--full-auto`, or a
sandbox-bypass flag. `--ignore-user-config` retains authentication while skipping user defaults;
`--ignore-rules` skips user/project execpolicy rules. Session overrides outrank project config, so
network, web search, inherited MCP servers, and lifecycle hooks stay disabled even when
`.codex/config.toml` requests them. Repository instructions and other non-safety project settings
remain trusted inputs.

The shell policy inherits Codex's reduced `core` environment and activates its default filtering of
variable names containing `KEY`, `SECRET`, or `TOKEN`. Login-shell profile loading and Codex
subagents are disabled. Both `/tmp` and the launcher's `$TMPDIR` are removed from writable sandbox
roots. Tool commands instead receive a fresh `TMPDIR` under the ignored worktree
`tmp/codex-runtime/`; the runner removes that exact directory on every exit.

Codex receives an explicit ban on git-mutating commands. The runner independently snapshots tracked
and non-ignored untracked content, derives `actual_files_changed`, compares it with Codex's claim,
and rejects changes to PM artifacts or outside machine-readable `pm-meta.touches`. It also fingerprints
HEAD, every ref, staged contents, local Git config, and worktree registrations. Any mismatch becomes
a safety violation for the PM to inspect. The PM accumulates runner-derived paths across fix rounds,
regenerates the diff, and re-runs deterministic gates; Codex's structured test report is not
accepted as independent proof.

The default timeout is 600 seconds (bounded override: 1–7200). `INT`, `TERM`, `HUP`, and timeout
terminate the Codex process tree on a best-effort macOS/Linux basis, preserve partial repository
changes, and retain the scratch diagnostics. Completed runs embed their structured result and delete
their scratch directory; failed, interrupted, timed-out, or safety-violating runs retain it.

Run `codex-builder-run.sh --preflight --worktree <root> [--story <story>]` to validate sign-off,
authentication, required flags, ignored temp setup, bundled schema, and optional story metadata. It
returns JSON with `quota_consumed: false` and does not invoke model inference. The opt-in
`PM_CODEX_LIVE=1 scripts/smoke-codex-builder-live.sh` then exercises environment filtering, local
TMPDIR, host-temp denial, bounded writes, structured output, and cleanup in a disposable repository.

This remains an OS sandbox rather than a VM-level security boundary. Use the builder only with
trusted repositories and stories.

## Web search (`--search`) — noted 2026-08-02, codex-cli 0.145.0

`codex exec --help` does NOT accept `--search` as of codex-cli 0.145.0 (verified: `codex exec
--help | grep -i -- '--search'` returns no match, and the full `--help` output has no
search-related flag). `codex exec review --help` likewise has no `--search`. The `codex-researcher`
agent probes `codex exec --help` for this flag at its own runtime and adds it when present, so on
installations where it is supported it should still get live sources; on installations like this
one it falls back to model knowledge + repo reading.
