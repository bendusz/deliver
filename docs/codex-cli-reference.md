# Codex CLI reference (for pm-skill's codex commands)

CLI facts verified 2026-08-23 against **codex-cli 0.149.0**, the
[official command reference](https://learn.chatgpt.com/docs/developer-commands), and local help
output; models and defaults updated 2026-09-04. Re-verify against `codex exec --help` when the CLI
major-bumps.

## Invocation shapes

| Task | Command |
|---|---|
| One-shot non-interactive run | `codex exec [OPTIONS] [PROMPT]` (prompt via arg, stdin, or `-`) |
| Non-interactive code review | `codex exec review [OPTIONS] [PROMPT]` (`codex review` is an alias) |
| Resume a prior exec session | `codex exec resume --last "<follow-up>"` or `<SESSION_ID>` |
| Auth check | `codex login status`, exit 0 logged in, non-zero logged out |

## Flag matrix: `exec` against `exec review`

| Group | Flags |
|---|---|
| Both subcommands | `-m/--model`, `-c/--config` (TOML value, else literal), `-o/--output-last-message` (final message → file, which is the review report), `--json`, `--output-schema`, `--ephemeral`, `--ignore-user-config` (skips `$CODEX_HOME/config.toml`; auth still uses `CODEX_HOME`), `--ignore-rules`, `--strict-config`, `--skip-git-repo-check`, `--dangerously-bypass-approvals-and-sandbox` (never passed by pm-skill) |
| `exec` only, **exit 2** on review | `-s/--sandbox` (`exec` defaults to `read-only`), `-C/--cd` (for review, `cd` to the repo root first), `--color` (cost us a 5-agent run) |
| `exec` only, no error | `-i/--image` |
| Neither | a reasoning-effort flag; use `-c model_reasoning_effort="<level>"` |

`codex exec` hard-sets approval to `never`, so failures go back to the model. `--full-auto` is a
deprecated alias for `--sandbox workspace-write`.

## Review scope semantics: mutually exclusive, including with PROMPT

Exactly one of these, per clap's `conflicts_with_all` and verified live. Any two is exit 2.

| Scope | Meaning |
|---|---|
| `--uncommitted` | staged + unstaged + untracked changes |
| `--base <branch>` | diff against a base branch (PR-style) |
| `--commit <sha>` | changes introduced by one commit (`--title` labels it, requires `--commit`) |
| `PROMPT` (or `-`) | custom-instructions review; the prompt IS the scope |
| *(none)* | error: `Specify --uncommitted, --base, --commit, or provide custom review instructions` |

Because a prompt cannot join `--uncommitted`, an objective-focused review puts scope and objective in
one prompt; native scope flags are preferred otherwise, since diff selection stays deterministic.
Whole-codebase review is not native at all: it is `codex exec --sandbox read-only` with a prompt.

## Model lineup (`gpt-6-astra` released 2026-09-03)

| Model | Position | API price /1M in/out |
|---|---|---|
| `gpt-6-astra` | current flagship; pm-skill's default everywhere | not recorded here |
| `gpt-5.6-sol` | previous flagship; strongest 5.6 coding judgment | $4 / $20 |
| `gpt-5.6-terra` | balanced everyday workhorse | $2.50 / $15 |
| `gpt-5.6-luna` | fast/cheap, high volume | $1 / $6 |
| `gpt-5.5`, `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.3-codex` | previous generations, still selectable | n/a |

Reasoning effort is `none | minimal | low | medium | high | xhigh | max`. No review-specific model
exists; `review_model` in `~/.codex/config.toml` overrides the session model for `/review`, and
pm-skill never touches that file. ChatGPT sign-in is quota-based (Free/Go: Terra only); API-key auth
is per-token.

### The one-time model fallback

A ChatGPT-account login can be refused a model outright. Observed 2026-09-04:
`400 invalid_request_error`, "model is not supported when using Codex with a ChatGPT account".

When the model came from the mode default, never from an explicit `--model`, and Codex exits
non-zero with that refusal naming that model on stdout or stderr, the runner retries the command
once on the one fallback for every mode, `gpt-5.6-sol` at `medium`. Timeouts, interrupts, and other
non-zero exits are returned as they are. The envelope reports `model` and `effort` as the pair that
ran plus `model_fallback: {from, to, reason}`, where `from` and `to` are `{model, effort}` objects
and `reason` is the refusal line cut to 300 characters.
`--timeout-seconds` bounds each attempt, so a fallback run can take twice that.

## pm-skill's chosen defaults (models 2026-09-04, efforts 2026-07-16)

Every caller falls back to `gpt-5.6-sol` at `medium`.

| Caller | Model | Effort |
|---|---|---|
| `/pm-skill:codex-review` | `gpt-6-astra` | `high` |
| `/pm-skill:codex-help` | `gpt-6-astra` | `medium` |
| `codex-researcher` | `gpt-6-astra` | `high` |
| `codex-builder` (build and fix) | `gpt-6-astra` | `high` |

A caller wanting another tier passes `model=` and `effort=`, which reach the runner as `--model` and
`--effort`. Scope keywords: `recent` = last commit (`--commit HEAD`), `worktree` = `--uncommitted`
(default), `codebase` = read-only audit.

## Auth, exit codes, output streams

- Login: `codex login`, or `printenv OPENAI_API_KEY | codex login --with-api-key`
  (**`CODEX_API_KEY` is not a supported path**).
- Unauthenticated `codex exec` retries about 5 times over 15 to 20 seconds, then exits 1, so gate on
  `codex login status` first.
- Codex exit codes: `0` success · `1` runtime/auth failure · `2` CLI usage error.
- Streams: progress and the session header → **stderr**; final message → **stdout** or the `-o` file.

## Runner (Node, against codex-cli 0.149.0, since v0.16)

No pm-skill agent or command assembles a Codex command line or shells out to `codex`. Every
invocation goes through `plugins/pm-skill/scripts/codex/run.mjs`, called by a thin Sonnet wrapper
agent (`codex-builder`, `codex-reviewer`, `codex-advisor`, `codex-researcher`), and
`scripts/validate.sh` fails the build on a direct `codex exec` string in any of them.

`scripts/codex/lib/argv.mjs` and the mode files hold the exact argument lists;
`scripts/tests/codex-run.test.mjs` pins them.

### CLI

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/codex/run.mjs" --mode <mode> [common] [mode options]

common:   [--model <id>] [--effort <level>] [--timeout-seconds <n>]
          [--preflight]  (build, review, advise, research; NOT fix)
build:    --worktree <abs> --story <docs/stories/x.md>
fix:      --worktree <abs> --story <docs/stories/x.md> --evidence <tmp/codex-builder/x.md>
review:   --scope recent|worktree|codebase [--objective "<text>"] --out <dir>
advise:   --prompt-file <abs>
research: --prompt-file <abs> [--search auto|off]
```

Free-form Codex flags are never accepted; an unrecognized argument is a usage error. The model id is
checked against a safe-character regex, the effort against the seven levels, and the timeout is
bounded to 1 through 7200 seconds, default 600, covering the model process only. Each preflight
probe has its own 30-second limit: a timed-out `login status` or `--help` returns `unavailable`
("codex did not respond within 30 s"), a timed-out `--version` yields `codex_version: "unknown"`.

A usage error is the one invocation that emits **no** envelope: message and usage line to stderr,
exit 64. The other runner exit codes are `65` rejected · `66` blocked (a fail-closed precondition
such as missing sign-off) · `69` unavailable (`codex` missing, unauthenticated, or too old) · `70`
failed · `74` safety violation · `124` timed out · `130` interrupted · `0` completed, ready, or
nothing-to-review.

### What each mode enforces

Every mode pins `mcp_servers`, `features.hooks`, `agents.enabled`, and `web_search` on the command
line, because `--ignore-user-config` skips only `$CODEX_HOME/config.toml` and a repository
`.codex/config.toml` could start MCP servers, which run outside the shell sandbox.

`build` and `fix` fail closed on a missing or unsigned `pm/pm-state.json`, an untracked story, or a
fix without `--evidence`, then snapshot the worktree and git metadata around the run: an
out-of-scope change, a protected-path change, or a `files_changed` claim that disagrees with the
snapshot delta is a safety violation, worktree preserved, while changed ignored files are reported
rather than blocked. `review` writes only into `<root>/untracked` or `<root>/codex`, which must hold
no tracked files; one `lstat` rejects a symlink or a path resolving elsewhere, and `COPYFILE_EXCL`
keeps the copy from overwriting an existing report. `advise` and `research` are read-only, and only
research adds `--search`.

### Envelope fields per mode

Every mode emits exactly one JSON envelope on stdout, and `runner_status` says which shape it is.
Review alone can return `nothing-to-review`, exiting 0 with `mode`, `scope`, `reason`, and
`codex_version`.

**Failure envelope, identical for every mode.** `runner_status`
(`rejected`|`blocked`|`unavailable`|`failed`|`safety-violation`|`timed-out`|`interrupted`),
`reason`, `scratch_dir`, `codex_version`, `codex_exit`, `diagnostics_retained`, plus
`actual_files_changed` and `ignored_files_changed` once the worktree was snapshotted, plus
`stderr_path` when a stderr log was retained outside a build (a failed build keeps `stderr.log`
inside its `scratch_dir`). Beyond a fallback's `model`, `effort`, and `model_fallback` it carries no
mode context: no `worktree`, `story`, `mode`, `sandbox`, or output path.

**Completed envelopes, per mode.**

- **build/fix**: `codex_version`, `model`, `effort`, `worktree`, `story`, `mode`, `timeout_seconds`,
  `sandbox` (`workspace-write` or `none (win32)`), `diagnostics_retained: false`,
  `actual_files_changed`, `ignored_files_changed`, `git_status_short`, and the builder's `result`
  object: `status`, `summary` (one to five lines), `files_changed`, `tests`, and `root_cause`, where
  a blocked run explains itself.
- **review**: `mode`, `scope`, `objective`, `report_path`, `model`, `effort`, `codex_version`,
  `codex_exit`, and `gitignore_rule_needed` (a root-anchored `/<dir>/` string, or `null` when the
  output directory is already ignored).
- **advise/research**: `mode`, `answer_path`, `stderr_path`, `scratch_dir`, `codex_version`,
  `model`, `effort`, `codex_exit`, `search_used`.

**Preflight envelopes** carry `runner_status: ready`, `preflight: true`, `codex_version`, and
`quota_consumed: false`, never a Codex run's fields. Build adds `worktree`, `story`,
`story_builder`, `story_scope_checked`, `allowed_paths`, and `policy`; review adds `mode` and
`scope`; advise and research add `mode` and `search_available`. Preflight is rejected for `fix`.

### Windows behaviour

- **Executable resolution**: `codex.exe` wins over any shim whatever `PATHEXT` says, and a
  `codex.cmd` npm shim runs through its JS entry under `node`. A bare `.cmd` with no JS entry falls
  back to `cmd.exe`, which refuses unsafe arguments, so build and fix exit **70** and the read-only
  modes **65**; install `codex.exe` or the npm package.
- **Process tree kill**: `taskkill /T /F /PID <pid>`; POSIX signals the detached process group.
- **`build`/`fix` sandbox**: the Windows sandbox stays off, because `codex exec` under it refuses
  most shell commands. Build and fix pass `--sandbox danger-full-access` and record
  `sandbox: "none (win32)"`. Every other guard holds, but the run has full host access and network
  and the runner audits only the worktree, so writes elsewhere and network use are **not detectable
  at all**. POSIX prevents an out-of-scope write; Windows only detects it afterwards. `review`,
  `advise`, and `research` stay `--sandbox read-only` on every platform.
- **Paths, snapshots, temp**: native realpath comparison, git output read tolerant of both
  separators, the executable bit ignored, and `TMPDIR`/`TMP`/`TEMP` pointed at the worktree-local
  `tmp/codex-runtime/<run>`, removed on exit. Cleanup is best effort: an antivirus lock
  (`EBUSY`/`EPERM`) can leave a directory behind.
- **Open live-check item**: confirm on Windows that `--sandbox danger-full-access` runs commands
  headlessly under `codex exec`.

### Preflight and smoke test

```
node plugins/pm-skill/scripts/codex/run.mjs --mode build --preflight --worktree <root> [--story <story>]
```

`--preflight` never invokes model inference and always reports `quota_consumed: false`. It validates
sign-off, authentication, required CLI flags, the ignored `tmp/` setup, the bundled result schema,
and optional story metadata. For `recent` and `worktree` it also checks that `codex exec review`
offers the flags in `preflight.mjs`'s `REVIEW_FLAGS`; `codebase` uses plain `exec` and skips that
check.

The opt-in live smoke test, `PM_CODEX_LIVE=1 node plugins/pm-skill/scripts/codex/smoke-live.mjs`
(also `PM_CODEX_LIVE=1 scripts/smoke-codex-builder-live.sh`), checks two things in a disposable
repository it then removes unless `PM_CODEX_KEEP=1`: that the two expected result files are written
with their exact content, and that a secret-shaped environment variable was filtered out of the tool
shell. This is an OS sandbox, not a VM-level security boundary: use the builder only with trusted
repositories and stories.

## Web search (`--search`), noted 2026-08-02

Neither `codex exec --help` nor `codex exec review --help` accepts `--search` as of codex-cli
0.145.0. The runner probes `codex exec --help` at research runtime and adds the flag when present,
so research uses live sources where supported and model knowledge plus repo reading where it is
not.
