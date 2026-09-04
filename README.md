# deliver, a Project/Product Manager skill for Claude Code

Claude acts as the project manager. It agrees requirements and a plan with you, waits for sign-off,
then delegates implementation and review to specialist agents. It never writes code.

One repeatable way of working:

> **discover → specify → clarify → plan → sign-off → skeleton (optional) → analyze → decompose → build → gate → review → verify → ship → log**

It works on a bare Claude Code install and can use optional tools when they are present.

## Install

Run these two steps separately. Submit the first, wait for it to finish, then run the second. If you
paste both at once, the second line gets swallowed into the first command's argument.

**Requirements.** Node.js 20 or newer on your PATH. The plugin's hooks and its Codex runner are Node
scripts, so the same install works on macOS, Linux, and Windows without bash or jq. The OpenAI Codex
CLI is optional and only needed for the `codex-*` agents and commands.

**1. Add the marketplace**

```
/plugin marketplace add https://github.com/bendusz/deliver
```

**2. Install the plugin**

```
/plugin install deliver@deliver
```

Use the full `https://` URL above. The `owner/repo` shorthand resolves to SSH, which fails on
machines without a GitHub SSH key and host key set up.

If it does not appear right away, restart your Claude Code session.

**3. Optional: install the `poteto` companion**

```
/plugin install poteto@deliver
```

Lauren Tan's [pstack](https://github.com/cursor/plugins/tree/main/pstack) engineering skills
(`how`, `why`, `architect`, `arena`, `interrogate`, `blast-radius`, `unslop`, a technical-writing
standard, verification-skill generators, and 21 principles), ported to Claude Code under her MIT
license. The deliver plugin uses them when present and works without them. See
[`plugins/poteto/README.md`](plugins/poteto/README.md).

## Upgrade from pm-skill

The plugin was called `pm-skill` through 0.20. Remove the old marketplace, add the new one, and
install under the new name:

```
/plugin marketplace remove pm-skill
/plugin marketplace add https://github.com/bendusz/deliver
/plugin install deliver@deliver
```

Nothing in your project needs to change. The `pm/` state directory, the `AGENTS.md` pointer, and
`.claude/rules/pm-state.md` are read exactly as before, and `/deliver:resume` continues from them.
`DELIVER_NO_ENFORCE=1` is the documented kill switch now, and the old `PM_SKILL_NO_ENFORCE=1` keeps
working until 0.22.

## Use

- Just describe the work, "act as my PM to build a CLI todo app" for example, and the
  `project-manager` skill activates.
- Or run the command explicitly:

```
/deliver:pm build a CLI todo app
```

The PM runs discovery with you, writes a plan, and waits for your explicit sign-off before building
anything.

## How it works

| Phase | What happens |
|-------|--------------|
| Discovery | You and the PM agree the problem and the best solution. |
| Specification | A durable `docs/spec.md`: user stories, requirements, acceptance criteria, success metrics. What and why, not how. |
| Clarification | Open `[NEEDS CLARIFICATION]` questions resolved one at a time before planning. |
| Plan and sign-off | A written `docs/plan.md` that derives from the spec, with traceability. You approve it before any code. |
| Skeleton (optional) | With `Skeleton: specdd` in the plan, `spec-architect` writes the sprint's `.sdd` contracts, the shape of the code, before any code exists. |
| Analyze | A read-only cross-artifact consistency check for coverage, contradictions, and constitution, run after the plan and before decomposition, optionally before sign-off. |
| Decomposition | Sprints, then self-contained story files under `docs/stories/`, each tracing to requirement IDs. |
| Implementation loop | Per story: build, gate, review, fix, verify, ship, log, run by subagents. |
| Parallel stories | Independent `[P]` stories can build at once in isolated git worktrees, then integrate one at a time. Opt-in, with a safe fallback to sequential. |
| Review and verification | A separate read-only reviewer, the project's real test, lint, and build gates, and a final read-only `pm-verifier` PASS, with bounded fix loops. |
| Logging | A shared author-prefixed `pm/log.md` and per-actor state under `pm/actors/`, so concurrent PM sessions never overwrite each other and any lost session can resume. |

Bundled specialist agents do the work:

| Role | Agent |
|------|-------|
| Build with broad repo context | `expert-builder` (Opus) |
| Build one bounded outcome | `codex-builder` (Codex CLI, optional) |
| Risk-selected read-only review panel | `code-integrity-reviewer`, `architecture-reviewer`, `security-auditor` |
| Write tests, nothing else | `test-engineer` |
| Root cause and a fix plan, read-only | `debugger` |
| Independent PASS, FAIL, or UNKNOWN before ship | `pm-verifier` |
| Docs only | `technical-writer` |
| Map a brownfield codebase | `codebase-analyst` |
| Maintain the project wiki, its only writer | `librarian` |
| Write SpecDD `.sdd` contracts before code | `spec-architect` |
| External research, reports under `docs/research/` | `researcher` (web), `codex-researcher` |
| Second opinion on code and on decisions | `codex-reviewer`, `codex-advisor` |

`codex-reviewer` writes reports under `untracked/` or a gitignored `codex/`, and `codex-advisor`
relays its answer in chat. Every Codex invocation goes through one of these thin Sonnet wrappers and
the bundled Node runner; the PM never runs `codex` itself. The PM stays an orchestrator and protects
its own context by handing each agent only what it needs.

Each story carries a one-line `pm-meta` JSON comment naming its builder (`expert-builder`,
`codex-builder`, or `auto`) and its machine-readable touch paths. Opus remains the default for broad
features, architecture, and changes spread across the codebase. Codex is selected for bounded
implementation, failing tests, and localized fixes with concrete evidence. Both feed the same
deterministic gates, independent review panel, and final verifier.

Default check-in is sprint-level, so you review at each sprint boundary, and it is configurable to
story-level or `autonomous`. Choose a scale from `tiny` through `regulated` to right-size the
workflow. Tiny work stays lightweight, and regulated work makes every gate mandatory.

## Commands

| Command | What it does |
|---------|--------------|
| `/deliver:pm` | Act as the PM end to end: discover, plan, get sign-off, orchestrate delivery. |
| `/deliver:specify` | Capture or refine `docs/spec.md`, the product spec of what and why. |
| `/deliver:clarify` | Resolve open `[NEEDS CLARIFICATION]` in the spec, one question at a time, 5 at most. |
| `/deliver:constitution` | Create or update `docs/constitution.md`, the project-specific governing rules. |
| `/deliver:skeleton` | Write or extend the SpecDD `.sdd` skeleton for a sprint, after sign-off and before decomposition. |
| `/deliver:analyze` | Read-only consistency and quality report across all artifacts. Never edits. |
| `/deliver:checklist` | Generate or evaluate a spec, plan, story, or verification quality checklist under `docs/checklists/`. |
| `/deliver:doctor` | Check environment readiness (toolchain, deps, gates run) and PM-state health before building. |
| `/deliver:benchmark-builders` | Run Opus and Codex on the same story in isolated worktrees, score the measured results, and merge neither. |
| `/deliver:correct-course` | Handle a mid-flight scope change: re-plan at the right level, re-sign-off if material. |
| `/deliver:handoff` | End a session cleanly by writing a token-efficient `pm/actors/<id>.HANDOFF.md` briefing for the next agent. |
| `/deliver:resume` | Read saved state, handoff, and logbook, then continue where you left off. |
| `/deliver:codex-review` | Spawn parallel OpenAI Codex CLI review agents. Scope `recent`, `worktree`, or `codebase`, plus `model=` and `effort=` and objective presets or free-form text. Reports land in `untracked/` or a gitignored `codex/`. Requires the `codex` CLI. |
| `/deliver:codex-help` | Ask Codex for a second opinion on a consequential decision, with `model=` and `effort=`, defaulting to `gpt-6-astra` at `medium` with a one-time fallback to `gpt-5.6-sol` at `medium`. The answer is relayed in chat. Requires the `codex` CLI. |

## Artifacts

At the project root:

- `AGENTS.md`, the project's instructions file: commands, layout, conventions, gotchas. Facts only,
  under 200 lines. Codex, Cursor, and Copilot read it natively.
- `CLAUDE.md`, a two-line bridge whose first line is `@AGENTS.md`, so Claude Code reads the same
  file. Existing files are never overwritten; the PM proposes a migration instead.
- `.claude/rules/pm-state.md` and `pm/AGENTS.md`, optional path-scoped `pm/` discipline, enabled by
  `Instruction rules: pm-state` in the plan's Delivery mode.
- `<root>.sdd`, `.specdd/bootstrap.md`, and `.sdd` files beside the code they describe: the SpecDD
  skeleton, when the plan's Delivery mode says `Skeleton: specdd`. Optional.

Committed under `docs/`, which is authoritative:

- `docs/spec.md`, the product specification: user stories, requirements, acceptance criteria,
  metrics.
- `docs/plan.md`, the delivery plan, derived from the spec with traceability.
- `docs/stories/*.md`, self-contained story files, each tracing to requirement IDs.
- `docs/constitution.md`, project-specific governing principles. Optional.
- `docs/checklists/*.md`, spec, plan, story, and verification quality checklists. Optional.
- `docs/research/*.md`, sourced research reports from `researcher` and `codex-researcher`. Optional.
- `docs/verification/*.md`, per-story verification reports. Optional, and recommended for
  non-trivial work.
- `docs/completion-report.md`, the end-of-project summary `technical-writer` produces. Optional.
- `docs/wiki/`, the project wiki: an index, a schema, and decision, concept, and source pages the
  `librarian` maintains. On at `standard` scale and above.

Committed under `pm/`, the tracked session state and the project's resume point. Solo is a team of
one.

- `pm/pm-state.json`, the shared project state: sign-off, sprint, active story claims.
- `pm/log.md`, one shared, append-only, author-prefixed logbook, with `merge=union` so concurrent
  appends merge cleanly.
- `pm/actors/<id>.json` and `pm/actors/<id>.HANDOFF.md`, each person's working position and
  end-of-session briefing. Nobody writes anyone else's files, and a bundled hook enforces it.
- State updates are committed alongside the work they describe. Never write secrets into `pm/`.

Gitignored scratch and reports, disposable and never load-bearing for resume. The first four live
under `tmp/`; the report directories sit at the repository root:

- `tmp/environment-check.md`, `/deliver:doctor`'s readiness report.
- `tmp/codex-builder/*.md`, focused fix briefs passed to `codex-builder`. Never authoritative and
  safe to discard after the story.
- `tmp/codex-runtime/*`, per-run tool temp directories, ignored and removed on exit. Best effort: an
  antivirus or indexer lock on Windows can leave them.
- `tmp/builder-benchmark/*`, opt-in two-builder evaluations. Never part of delivery or resume state.
- `untracked/` or `codex/`, gitignored, holding `/deliver:codex-review` reports named
  `<stamp>-codex-review-<scope>[-<objective>].md`, plus an index file for multi-objective runs.
- Worktrees, prompts, raw agent output, and other ephemera.

## Safety

- **No implementation before your sign-off.** A behavioural rule the PM holds, plus the bundled
  `require-signoff.mjs` hook. The hook runs on `Write`, `Edit`, and `MultiEdit` only, and blocks a
  write when `pm/pm-state.json`, or the legacy `tmp/pm-state.json`, has `signed_off: false`. It
  exempts `docs/`, `pm/`, `tmp/`, `.git/`, `.claude/rules/`, `.specdd/`, every `.sdd` file,
  `CLAUDE.md`, `AGENTS.md`, `.gitignore`, and `.gitattributes`, fails open on any uncertainty, and
  does not see writes made through `Bash`.
- **Guarded Codex writes.** Codex builds require signed-off tracked state and bounded story touch
  paths. POSIX runs use `workspace-write`. Windows runs with full host access and an after-run
  worktree audit. See `docs/codex-cli-reference.md` for the flag matrix, audited state, exit codes,
  and platform limits.
- Repository `AGENTS.md` and `CLAUDE.md`, and non-safety project configuration, remain trusted
  project inputs. Command-line overrides win for every safety-sensitive setting above. This is an OS
  sandbox, not a VM boundary.
- **No secrets in tracked state.** A bundled hook blocks secret-shaped content, meaning key tokens,
  PEM blocks, and credential assignments, from being written into the git-tracked `pm/` and
  `docs/wiki/` directories.
- **Actor isolation.** A bundled hook blocks writes to another person's `pm/actors/` state files.
- **The companion plugin is inert.** The optional `poteto` plugin ships skills only, with no hooks,
  agents, or commands, so it cannot change any guardrail above.
- **Repository safety.** The PM never overwrites your files without asking, commits only what it
  created for the current story, runs `git init` only after asking, and never pushes without an
  explicit request.
- **Optional hardening.** For mechanical enforcement of a read-only Bash posture and sign-off, the
  bundled hardening guide uses Claude Code permissions and hooks. Its verifier Bash allowlist
  requires `jq`.

Three of the four bundled hooks are fail-open accident tripwires on the Write, Edit, and MultiEdit
tools; the fourth runs at session start and only reads `pm/`. None is a security boundary. Bash
coverage is the optional hardening allowlist described in
`plugins/deliver/skills/project-manager/references/hardening.md`.

**Windows.** Hooks and the Codex runner run under `node` directly, with no Git Bash needed. There is
no platform sandbox on Windows: build and fix run with full host access and network. The runner
audits only the worktree afterwards, meaning tracked, untracked, and ignored files inside it, so
writes elsewhere on the machine and any network use are not detectable, and out-of-scope edits inside
the worktree are reported after the fact, as a safety violation with changes preserved, rather than
prevented. Review, advice, and research modes are read-only on every platform.

## Optional tools

The deliver plugin needs none of the optional tools below. If your environment has any of them, the PM may
prefer them where useful.

- The `poteto` companion plugin from this marketplace. [Install](#install) step 3 lists its skills.
  The PM's references name them as optional examples, and nothing breaks without them.
- A dedicated planning or TDD skill suite for richer discovery and planning.
- An external code-review tool, an OpenAI Codex-based reviewer or another model's CLI for example,
  for the optional independent review step.
- The OpenAI Codex CLI for `codex-builder`, `codex-researcher`, `codex-reviewer`, `codex-advisor`,
  and the Codex commands. An `auto` story or opportunistic fix falls back to `expert-builder` when
  Codex is unavailable; a story that explicitly requires `codex-builder` waits for `codex login`
  rather than switching workers silently.
- To exercise the real write path after an install or a Codex upgrade, run
  `PM_CODEX_LIVE=1 node plugins/deliver/scripts/codex/smoke-live.mjs`, or the equivalent
  `PM_CODEX_LIVE=1 scripts/smoke-codex-builder-live.sh` wrapper. In PowerShell, use
  `$env:PM_CODEX_LIVE='1'; node plugins/deliver/scripts/codex/smoke-live.mjs`. It runs one
  low-effort Codex task in a disposable signed-off repository, which is removed afterwards unless you
  set `PM_CODEX_KEEP=1`, and it is deliberately excluded from default validation.
- `gh` plus a GitHub remote for real pull requests. Otherwise the PM uses local merges.

The spec, clarify, analyze, and constitution steps add spec-driven rigor, inspired by spec-driven
development tools, and `pm-verifier` adds an independent final check. All of them are built in and
self-contained. The deliver plugin does not depend on `spec-kit`, and there is no external verifier process in
this workflow: `pm-verifier` is an ordinary read-only Claude Code subagent the PM dispatches.

## License

GPL-3.0-or-later; see [LICENSE](LICENSE). Copyright (c) 2026 bendusz.

This project is free software: you can redistribute it and modify it under the terms of the GNU
General Public License as published by the Free Software Foundation, either version 3 of the License
or, at your option, any later version. If you distribute copies or modified versions, they must
remain under the GPL with source made available; private modifications you do not distribute carry no
such obligation.
