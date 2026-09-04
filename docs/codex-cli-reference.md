# Codex CLI reference (for pm-skill's codex commands)

Everything here was re-verified on 2026-08-23 against **codex-cli 0.149.0**, the
[official command reference](https://learn.chatgpt.com/docs/developer-commands), and local help
output. It backs `/pm-skill:codex-review`, `/pm-skill:codex-help`, `codex-researcher`, and the
write-capable `codex-builder` agent.
Re-verify against `codex exec --help` / `codex exec review --help` when the
CLI major-bumps. Third-party blogs are unreliable; several claim a `--effort` flag that does not
exist.

## Invocation shapes

| Task | Command |
|---|---|
| One-shot non-interactive run | `codex exec [OPTIONS] [PROMPT]` (alias `codex e`; prompt via arg, stdin, or `-`) |
| Non-interactive code review | `codex exec review [OPTIONS] [PROMPT]` (`codex review` is a thin alias) |
| Resume a prior exec session | `codex exec resume --last "<follow-up>"` or `codex exec resume <SESSION_ID>` |
| Auth check | `codex login status`, exit 0 logged in, non-zero logged out |

## Flag matrix: `codex exec` against `codex exec review`

| Flag | `exec` | `exec review` | Notes |
|---|---|---|---|
| `-m, --model <id>` | ✓ | ✓ | |
| `-c, --config key=value` | ✓ | ✓ | value parsed as TOML, falls back to literal string |
| `-o, --output-last-message <file>` | ✓ | ✓ | final agent message → file; the review report |
| `--json` | ✓ | ✓ | JSONL event stream on stdout |
| `--output-schema <file>` | ✓ | ✓ | JSON Schema for the final response |
| `--ephemeral` | ✓ | ✓ | no session files persisted |
| `--ignore-user-config` | ✓ | ✓ | ignores `$CODEX_HOME/config.toml`; auth still uses `CODEX_HOME` |
| `--ignore-rules` | ✓ | ✓ | ignores repository execution rules; passed by every runner mode |
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

## Review scope semantics: mutually exclusive, including with PROMPT

Exactly one of these, per clap's `conflicts_with_all` and verified live. Combining any two is exit 2.

| Scope | Meaning |
|---|---|
| `--uncommitted` | staged + unstaged + untracked changes |
| `--base <branch>` | diff against a base branch (PR-style) |
| `--commit <sha>` | changes introduced by one commit (`--title` labels it, requires `--commit`) |
| `PROMPT` (or `-`) | custom-instructions review; the prompt IS the scope |
| *(none)* | error: `Specify --uncommitted, --base, --commit, or provide custom review instructions` |

An objective-focused review cannot combine a prompt with `--uncommitted`. Put the scope and
objective in one prompt instead: "Review the uncommitted changes, staged, unstaged, and untracked.
Focus exclusively on ...". Native scope flags are still preferred whenever no custom
objective is needed, because diff selection stays deterministic and prompt-as-scope is a capability
fallback. Whole-codebase review is not native at all: use `codex exec --sandbox read-only` with an
audit prompt.

## Model lineup (as of GPT-5.6 GA, 2026-07-09)

| Model | Position | API price /1M in/out |
|---|---|---|
| `gpt-5.6-sol` | flagship; strongest coding judgment; default for paid ChatGPT plans | $4 / $20 promotional pricing |
| `gpt-5.6-terra` | balanced everyday workhorse | $2.50 / $15 |
| `gpt-5.6-luna` | fast/cheap, high volume | $1 / $6 |
| `gpt-5.5`, `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.3-codex` | previous generations, still selectable (`5.4-mini` is about 30% of 5.4 quota cost) | n/a |

- The [official GPT-5.6 Sol model page](https://developers.openai.com/api/docs/models/gpt-5.6-sol)
  lists `none | minimal | low | medium | high | xhigh | max` reasoning effort. The builder uses
  `high`.
- No dedicated review model exists. `review_model` in `~/.codex/config.toml` overrides the session
  model for `/review`, and pm-skill never touches that file, passing `-m` and `-c` per call.
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
- Unauthenticated `codex exec` retries about 5 times over roughly 15 to 20 seconds, then exits 1.
  Always gate on `codex login status` first.
- Exit codes: `0` success · `1` runtime/auth failure · `2` CLI usage error.
- Streams: progress + session header (model/sandbox/effort/session id) → **stderr**; final
  message → **stdout** (or the `-o` file).

## Runner, rewritten in Node with codex-cli 0.149.0 (v0.16)

No pm-skill agent or command assembles a Codex command line in prose or shells out to `codex`
directly. Every invocation goes through one bundled cross-platform CLI,
`plugins/pm-skill/scripts/codex/run.mjs` (`node --test`-covered under
`plugins/pm-skill/scripts/tests/`), called by a thin Sonnet wrapper agent (`codex-builder`,
`codex-reviewer`, `codex-advisor`, `codex-researcher`). `scripts/validate.sh` fails the build on
any direct `codex exec` string found in an agent or command prompt.

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

No free-form Codex flags are accepted; unrecognized arguments are a usage error. The model id is
checked against a safe-character regex, the effort against
`none|minimal|low|medium|high|xhigh|max`, and the timeout is bounded to 1 through 7200 seconds,
defaulting to 600. The timeout bounds the model process only. Each preflight probe has its own
30-second limit. A timed-out `login status`, `exec --help`, or `exec review --help` returns
`unavailable` with the reason "codex did not respond within 30 s". A timed-out `--version` is not
fatal: it yields `codex_version: "unknown"` and the run continues. `--preflight` never invokes model
inference and always reports `quota_consumed: false`. Defaults per mode are build and fix
`gpt-5.6-sol` / `high`, review and research `gpt-5.6-terra` / `high`, and advise `gpt-5.6-sol` /
`medium`, unchanged from the retired bash runner.

A usage error is the one invocation that emits **no** envelope: it writes the message and the
usage line to stderr and exits 64.

Exit codes (mirroring the old bash runner): `64` usage · `65` rejected (bad input) · `66` blocked
(fail-closed precondition, e.g. missing sign-off) · `69` unavailable (`codex` missing, unauthenticated,
or too old) · `70` failed (Codex/runtime error) · `74` safety violation (out-of-scope or protected
change) · `124` timed out · `130` interrupted (`INT`/`TERM`/`HUP`) · `0` completed / ready /
nothing-to-review.

### The five modes' exact Codex argument lists

**`build` and `fix`.** An exact behavioural port of the retired bash runner. It fails closed on a
missing or unsigned `pm/pm-state.json`, an untracked story, or a fix mode without `--evidence`, and
it parses the story's `pm-meta` for the allowed touch paths.

```
codex exec --ignore-user-config --ignore-rules --strict-config -C "$WORKTREE" \
  --sandbox workspace-write --ephemeral --color never \
  -m "$MODEL" -c model_reasoning_effort="$EFFORT" \
  -c allow_login_shell=false \
  -c sandbox_workspace_write.network_access=false \
  -c sandbox_workspace_write.exclude_slash_tmp=true \
  -c sandbox_workspace_write.exclude_tmpdir_env_var=true \
  -c shell_environment_policy.inherit="core" \
  -c shell_environment_policy.ignore_default_excludes=false \
  -c shell_environment_policy.experimental_use_profile=false \
  -c shell_environment_policy.set.TMPDIR="<worktree>/tmp/codex-runtime/<run>" \
  -c shell_environment_policy.set.TMP="<worktree>/tmp/codex-runtime/<run>" \
  -c shell_environment_policy.set.TEMP="<worktree>/tmp/codex-runtime/<run>" \
  -c agents.enabled=false -c web_search="disabled" -c mcp_servers={} -c features.hooks=false \
  --output-schema "$RESULT_SCHEMA" -o "$SCRATCH/result.json" - < "$SCRATCH/prompt.md"
```

On `win32` the `--sandbox` value and the three `sandbox_workspace_write.*` and network config keys
change; see Windows behaviour below. Every other flag is identical on all platforms.

The runner snapshots the worktree independently before and after the run. It hashes the content of
tracked and untracked files, fingerprints ignored files by size, mtime, and inode, and covers the
protected PM paths even when an ignore rule hides them. From the two snapshots it derives
`actual_files_changed` and cross-checks that list against Codex's own claim. It also fingerprints
HEAD, every ref, staged contents, index flags (`assume-unchanged`, `skip-worktree`), the hooks
directory, `info/exclude`, local Git config, and worktree registrations. Any mismatch, or any
out-of-scope or protected-path change, becomes a safety violation with exit 74 rather than an
accepted result, and the worktree is preserved for inspection either way.

Ignored files inside the worktree are audited and reported separately as `ignored_files_changed`.
Tracked and untracked non-ignored files are both enforced against the story's `pm-meta.touches`, so
overwriting a pre-existing ignored file such as `.env` outside `pm-meta.touches` is reported rather
than blocked.
Protected PM paths are still enforced on both lists. The audit covers the worktree only and says
nothing about writes elsewhere on the host.

**`review`.** One of three native scopes, or a whole-codebase read-only audit. An objective is
expressed in the prompt, because the CLI forbids a custom prompt alongside a native scope flag.

```
recent, no objective:     codex exec review --commit HEAD <tail>
worktree, no objective:   codex exec review --uncommitted <tail>
codebase, no objective:   codex exec --sandbox read-only --skip-git-repo-check --color never <tail> -
recent/worktree, w/ obj.: codex exec review <tail> "Review the <recent|uncommitted> changes … <objective clause>"
codebase, w/ objective:   codex exec --sandbox read-only --skip-git-repo-check --color never <tail> -
  (stdin: "<codebase prompt> <objective clause>")

tail = --ignore-user-config --ignore-rules --strict-config --ephemeral -m "$MODEL" \
       -c model_reasoning_effort="$EFFORT" -c mcp_servers={} -c features.hooks=false \
       -c agents.enabled=false -c web_search="disabled" -o "$REPORT"
```

`--ignore-user-config` only skips `$CODEX_HOME/config.toml`, so the read-only modes also pin
`mcp_servers`, `features.hooks`, `agents.enabled`, and `web_search` on the command line: a trusted
repository's `.codex/config.toml` could otherwise start MCP server processes, which run outside the
shell sandbox. `research` omits the `web_search` override only when `--search` was actually
requested and the CLI supports it.

`--sandbox`, `-C`, and `--color` are never passed to `codex exec review` (exit 2 otherwise). The
report is written to a scratch directory outside the repo, then copied into `--out` (must be
`<root>/untracked` or `<root>/codex`, holding no tracked files, and not itself a symlink or
junction: the runner `lstat`s it, requires its realpath to be `<root>/<name>`, and copies with
`COPYFILE_EXCL` so a same-second collision cannot overwrite an earlier report). The runner never
edits `.gitignore` itself; when run inside a git repo and the output directory is not already ignored,
it reports the root-anchored rule that is needed (`gitignore_rule_needed: '/<dir>/'`) so the PM
can apply it, asking the user first for a pre-existing non-ignored directory that may already
hold user files. `PM_CODEX_STAMP` pins the report stamp; used by the tests.

**`advise` and `research`.** Always read-only, on every platform.

```
codex exec --ignore-user-config --ignore-rules --strict-config --sandbox read-only --ephemeral \
  --color never -m "$MODEL" -c model_reasoning_effort="$EFFORT" \
  -c mcp_servers={} -c features.hooks=false -c agents.enabled=false \
  [-c web_search="disabled" | --search] [--skip-git-repo-check] \
  -o "$SCRATCH/answer.md" - < "$PROMPT_FILE"
```

`--search` replaces the `web_search="disabled"` pin only in `research` mode, when `--search auto`
(the default) is in effect and `codex exec --help` lists the flag on the installed CLI. Every other
invocation pins web search off. `--skip-git-repo-check` is added only when the current directory is
not a repository.

### Envelope fields per mode

Every mode emits exactly one JSON envelope on stdout, and `runner_status` says which shape it is.
There are three success shapes. A `completed` run carries that mode's full field set, a preflight
probe carries `ready`, and review alone can return `nothing-to-review`, which exits 0 and carries
`mode`, `scope`, `reason`, and `codex_version` only. Every other status is a failure envelope, which
is much smaller and carries no mode context at all. Do not expect a completed run's fields on a
failure.

**Failure envelope, identical for every mode.** `runner_status`
(`rejected`|`blocked`|`unavailable`|`failed`|`safety-violation`|`timed-out`|`interrupted`),
`reason`, `scratch_dir`, `codex_version`, `codex_exit`, and `diagnostics_retained`. When the runner
got far enough to snapshot the worktree it also carries `actual_files_changed` and
`ignored_files_changed`; when it retained a stderr log outside a build it carries `stderr_path`. A
failed build instead retains `stderr.log` inside the `scratch_dir` it reports and emits no
`stderr_path`. It never carries
`model`, `effort`, `worktree`, `story`, `mode`, `sandbox`, `git_status_short`, `report_path`, or
`answer_path`.

**Completed envelopes, per mode.**

- **build/fix**: `runner_status: completed`, `codex_version`, `model`, `effort`, `worktree`,
  `story`, `mode`, `timeout_seconds`, `sandbox` (`workspace-write` or `none (win32)`),
  `diagnostics_retained: false`, `actual_files_changed`, `ignored_files_changed`,
  `git_status_short`, and the builder's own `result` object (`status`, `summary`, `files_changed`,
  `tests`, `root_cause`; a blocked run explains itself in `root_cause`).
- **review**: `runner_status: completed`, `mode` (always `'review'`), `scope`, `objective`,
  `report_path`, `model`, `effort`, `codex_version`, `codex_exit`, `gitignore_rule_needed` (a
  root-anchored `/<dir>/` string, or `null` when the output directory is already ignored). A clean
  worktree or no commit returns the `nothing-to-review` success shape instead of running Codex.
- **advise/research**: `runner_status: completed`, `mode`, `answer_path`, `stderr_path`,
  `scratch_dir`, `codex_version`, `model`, `effort`, `codex_exit`, `search_used`.

**Preflight envelopes** carry `runner_status: ready`, `preflight: true`, `codex_version`, and
`quota_consumed: false`, never a Codex run's fields.

- **build**: plus `worktree`, `story`, `story_builder`, `story_scope_checked`, `allowed_paths`, and
  `policy` (the platform's sandbox, network, and environment shape). Preflight is rejected for
  `fix`.
- **review**: plus `mode` (always `'review'`) and `scope`.
- **advise/research**: plus `mode` and `search_available`.

### Windows behaviour

- **Executable resolution**: on `win32` the runner walks `PATH` × `PATHEXT`, preferring
  `codex.exe`. A `codex.cmd` npm shim is bypassed by invoking its JS entry point
  (`node_modules/@openai/codex/bin/codex.js`) with `node` directly, with no shell and no quoting. A bare
  `.cmd` with no discoverable JS entry falls back to `cmd.exe /d /s /c`, built only from
  runner-validated argv (never user-controlled text) with a strict character check
  (`"`, `%`, CR, LF) that refuses to spawn rather than risk shell reinterpretation. The prompt
  always arrives on stdin, never on the command line, on every platform. With a bare `codex.cmd`
  and no npm `node_modules/@openai/codex/bin/codex.js` beside it (global) or
  `../@openai/codex/bin/codex.js` (a project-local `node_modules/.bin` shim), build and fix stop
  with exit **70** (`failed`) and the read-only modes with exit **65** (`rejected`): their argv
  contains quoted config values that the cmd.exe fallback refuses. Install `codex.exe` or the npm
  package. `codex.exe` is preferred over any shim regardless of `PATHEXT` order, because the runner
  sweeps the whole `PATH` for it first.
- **Process tree kill**: timeout and `INT`/`TERM`/`HUP` run `taskkill /T /F /PID <pid>` on
  `win32`; POSIX signals the detached process group.
- **`build`/`fix` sandbox**: Codex's Windows sandbox is off by default, and with it off
  `codex exec` (approvals are always `never`) refuses most shell commands. Decision: do not
  enable the Windows sandbox. `win32` build/fix pass `--sandbox danger-full-access` instead of
  `workspace-write`, and the `sandbox_workspace_write.*`/network config keys that only apply
  inside that sandbox are dropped. The envelope records `sandbox: "none (win32)"`. Everything
  else the runner enforces is unchanged: fail-closed sign-off, tracked story, the touches
  allowlist, before and after snapshots, the repository metadata fingerprint, and out-of-scope
  detection, which is still a safety violation with exit 74 and the worktree preserved for
  inspection. But on Windows
  build and fix run with **full host access and network**. The runner audits only the worktree
  afterwards (tracked, untracked, and ignored files inside it), so a write elsewhere on the machine
  or any network use is **not detectable at all**. For edits inside the worktree, the difference
  from POSIX is prevention versus detection: a POSIX sandbox blocks an out-of-scope write during
  the run; Windows only catches it after the run completes.
- **`review`, `advise`, and `research` sandbox**: `--sandbox read-only` everywhere, including
  Windows. It is a policy shape only, since these modes never write.
- **Paths**: worktree containment and the exact-root check use native realpath resolution; the
  worktree root compares the two native realpaths exactly; git output is read tolerant of both
  path separators.
- **Runtime temp**: `TMPDIR`, `TMP`, and `TEMP` all point at the worktree-local
  `tmp/codex-runtime/<run>` directory, which the runner removes on exit (build/fix only). Scratch
  and runtime cleanup are best effort: an antivirus or indexer lock on Windows (`EBUSY`/`EPERM`)
  can leave either directory behind after an otherwise successful run.
- **Snapshots**: on `win32` the executable bit is ignored (git's index mode for tracked files,
  `100644` for untracked), since Windows has no POSIX exec bit.
- Bypass flags (`--yolo` / `--dangerously-bypass-approvals-and-sandbox`) are never passed on any
  platform. The runner instead expresses the user's approved full access as
  `--sandbox danger-full-access` on `win32`, which is equivalent under `codex exec` since approvals
  are already hard-set to `never`, while POSIX keeps `workspace-write` by default because it costs
  nothing. Every agent and command prompt states this as: "wrappers never pass sandbox or
  approval flags; the runner owns them per platform."
- **Open live-check item**: confirm on a Windows machine that `--sandbox danger-full-access` runs
  commands headlessly under `codex exec`.

### Preflight and smoke test

```
node plugins/pm-skill/scripts/codex/run.mjs --mode build --preflight --worktree <root> [--story <story>]
```

validates sign-off, authentication, required CLI flags, the ignored `tmp/` setup, the bundled
result schema, and optional story metadata. For the `recent` and `worktree` scopes, review preflight
also verifies that `codex exec review` exists and offers `--commit`, `--uncommitted`,
`--ignore-rules`, `--ephemeral`, `--strict-config`, and `--ignore-user-config`. The `codebase` scope
uses plain `exec` and is not gated on that check. It returns JSON with
`quota_consumed: false` and performs no model inference. The opt-in live smoke test,
`PM_CODEX_LIVE=1 node plugins/pm-skill/scripts/codex/smoke-live.mjs` (also reachable as
`PM_CODEX_LIVE=1 scripts/smoke-codex-builder-live.sh`, now a thin wrapper around the same script),
checks exactly two things in a disposable repository: that the two expected result files are
written with their exact content, and that a secret-shaped environment variable was filtered out of
the tool shell. It removes the temporary repository afterwards unless `PM_CODEX_KEEP=1`.

This remains an OS sandbox rather than a VM-level security boundary. Use the builder only with
trusted repositories and stories.

## Web search (`--search`), noted 2026-08-02 on codex-cli 0.145.0

`codex exec --help` does NOT accept `--search` as of codex-cli 0.145.0 (verified: `codex exec
--help | grep -i -- '--search'` returns no match, and the full `--help` output has no
search-related flag). `codex exec review --help` likewise has no `--search`. The `codex-researcher`
agent probes `codex exec --help` for this flag at its own runtime and adds it when present, so on
installations where it is supported it should still get live sources; on installations like this
one it falls back to model knowledge + repo reading.
