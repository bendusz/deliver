# Codex CLI reference (for pm-skill's codex commands)

Everything here was verified on 2026-07-16 against **codex-cli 0.145.0-alpha.4** (latest stable
`rust-v0.144.5`), the hosted docs (`learn.chatgpt.com/docs/*` — all `developers.openai.com/codex/*`
URLs 308-redirect there), and live runs. It backs `/pm-skill:codex-review`, `/pm-skill:codex-help`, and the `codex-researcher` agent.
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
| `gpt-5.6-sol` | flagship; strongest coding judgment; default for paid ChatGPT plans | $5 / $30 |
| `gpt-5.6-terra` | balanced everyday workhorse | $2.50 / $15 |
| `gpt-5.6-luna` | fast/cheap, high volume | $1 / $6 |
| `gpt-5.5`, `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.3-codex` | previous generations, still selectable (`5.4-mini` ≈ 30% of 5.4 quota cost) | — |

- Reasoning effort: `minimal | low | medium | high | xhigh` (xhigh model-dependent), plus
  `max`/`ultra` on the 5.6 generation (`ultra` spawns internal subagents, Plus tier+).
- **No dedicated review model exists**; `review_model` in `~/.codex/config.toml` overrides the
  session model for `/review` — pm-skill never touches that file, passing `-m`/`-c` per call.
- ChatGPT sign-in is quota-based (Free/Go: Terra only); API-key auth is per-token.

## pm-skill's chosen defaults (decided 2026-07-16)

| Command | Model | Effort | Rationale |
|---|---|---|---|
| `/pm-skill:codex-review` | `gpt-5.6-terra` | `high` | balanced cost for possibly-parallel review agents; Sol@xhigh available via `model=`/`effort=` for high-stakes reviews |
| `/pm-skill:codex-help` | `gpt-5.6-sol` | `medium` | judgment work gets the top tier; used sparingly by design |

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

## Web search (`--search`) — noted 2026-08-02, codex-cli 0.145.0

`codex exec --help` does NOT accept `--search` as of codex-cli 0.145.0 (verified: `codex exec
--help | grep -i -- '--search'` returns no match, and the full `--help` output has no
search-related flag). `codex exec review --help` likewise has no `--search`. The `codex-researcher`
agent probes `codex exec --help` for this flag at its own runtime and adds it when present, so on
installations where it is supported it should still get live sources; on installations like this
one it falls back to model knowledge + repo reading.
