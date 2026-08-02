# pm-skill — a Project/Product Manager skill for Claude Code

Turn Claude into a disciplined **Project / Product Manager** that discovers, specifies, plans, gets
your sign-off, decomposes work into stories, and **orchestrates** the build through specialist
subagents — gate, review, fix, verify, ship, and log — **without writing the code itself**.

One repeatable way of working:

> **discover → specify → clarify → plan → sign-off → analyze → decompose → build → gate → review → verify → ship → log**

It is generic and self-contained: it works on a bare Claude Code install and gets richer if you
happen to have other tools.

## Install

Run these two steps **separately** — submit the first, wait for it to finish, then run the second
(don't paste both at once, or the second line gets swallowed into the first command's argument):

**1. Add the marketplace**

```
/plugin marketplace add https://github.com/bendusz/pm-skill
```

**2. Install the plugin**

```
/plugin install pm-skill@pm-skill
```

Use the full `https://` URL above — the `owner/repo` shorthand resolves to SSH, which fails on
machines without a GitHub SSH key/host key set up.

If it doesn't appear right away, restart your Claude Code session.

## Use

- Just describe the work — e.g. *"act as my PM to build a CLI todo app"* — and the
  `project-manager` skill activates, or
- run the command explicitly:

```
/pm-skill:pm build a CLI todo app
```

The PM runs discovery with you, writes a plan, and **waits for your explicit sign-off** before
building anything.

## How it works

| Phase | What happens |
|-------|--------------|
| Discovery | You and the PM agree the problem and the best solution. |
| Specification | A durable `docs/spec.md` — user stories, requirements, acceptance criteria, success metrics (what & why, not how). |
| Clarification | Open `[NEEDS CLARIFICATION]` questions resolved one at a time before planning. |
| Plan & sign-off | A written `docs/plan.md` that derives from the spec (with traceability); **you approve it** before any code. |
| Analyze | A read-only cross-artifact consistency check (coverage, contradictions, constitution) after the plan, before decomposition — optionally before sign-off. |
| Decomposition | Sprints → self-contained story files under `docs/stories/`, each tracing to requirement IDs. |
| Implementation loop | Per story: **build → gate → review → fix → verify → ship → log**, run by subagents. |
| Parallel stories | Independent `[P]` stories can build at once in isolated **git worktrees**, then integrate one at a time (opt-in; safe fallback to sequential). |
| Review & verification | A separate read-only reviewer + the project's real test/lint/build gates + a final read-only `pm-verifier` PASS; bounded fix loops. |
| Logging | A shared author-prefixed `pm/log.md` + per-actor state under `pm/actors/` so concurrent PM sessions never overwrite each other and any lost session can resume. |

Bundled specialist agents do the work — a builder (**`expert-builder`**), a risk-selected read-only
**review panel** (**`code-integrity-reviewer`**, **`architecture-reviewer`**, **`security-auditor`**),
a **`test-engineer`** (tests only), a **`debugger`** (read-only root-cause → fix plan), a read-only
final **`pm-verifier`** (independent PASS/FAIL before ship), a **`technical-writer`** (docs only), a
**`codebase-analyst`** for brownfield work, and two research roles — a web-capable
**`researcher`** and an optional Codex-CLI-backed **`codex-researcher`** (independent
second-model opinion) — whose sourced reports land under `docs/research/`. The PM stays an
orchestrator and protects its own context by handing each agent only what it needs.

Default check-in is **sprint-level** (you review at each sprint boundary); configurable to
story-level or fully autonomous. Pick a **scale** (`tiny`→`regulated`) to right-size the workflow —
tiny work stays lightweight; regulated work makes every gate mandatory.

## Commands

| Command | What it does |
|---------|--------------|
| `/pm-skill:pm` | Act as the PM end to end — discover, plan, get sign-off, orchestrate delivery. |
| `/pm-skill:specify` | Capture/refine `docs/spec.md` — the product spec (what & why). |
| `/pm-skill:clarify` | Resolve open `[NEEDS CLARIFICATION]` in the spec, one question at a time (≤5). |
| `/pm-skill:constitution` | Create/update `docs/constitution.md` — project-specific governing rules. |
| `/pm-skill:analyze` | Read-only consistency & quality report across all artifacts (never edits). |
| `/pm-skill:checklist` | Generate/evaluate a spec/plan/story/verification quality checklist under `docs/checklists/`. |
| `/pm-skill:doctor` | Check environment readiness (toolchain, deps, gates run) and PM-state health before building. |
| `/pm-skill:correct-course` | Handle a mid-flight scope change — re-plan at the right altitude, re-sign-off if material. |
| `/pm-skill:handoff` | End a session cleanly — write a token-efficient `pm/actors/<id>.HANDOFF.md` briefing for the next agent. |
| `/pm-skill:resume` | Read saved state, handoff, and logbook — then continue where you left off. |
| `/pm-skill:codex-review` | Spawn parallel OpenAI Codex CLI review agents (scope: `recent`/`worktree`/`codebase`; `model=`/`effort=`; objective presets or free-form) — reports land in `untracked/` or a gitignored `codex/`. Requires the `codex` CLI. |
| `/pm-skill:codex-help` | Ask Codex for a second opinion on a consequential decision (`model=`/`effort=`, default `gpt-5.6-sol` @ `medium`). Answer relayed in chat. Requires the `codex` CLI. |

## Artifacts

Committed under `docs/` (authoritative):

- `docs/spec.md` — product specification (user stories, requirements, acceptance criteria, metrics).
- `docs/plan.md` — delivery plan, derived from the spec with traceability.
- `docs/stories/*.md` — self-contained story files, each tracing to requirement IDs.
- `docs/constitution.md` — project-specific governing principles (optional).
- `docs/checklists/*.md` — spec/plan/story/verification quality checklists (optional).
- `docs/verification/*.md` — per-story verification reports (optional; recommended for non-trivial work).

Committed under `pm/` (tracked session state — the project's resume point; solo is a team of one):

- `pm/pm-state.json` — shared project state (sign-off, sprint, active story claims).
- `pm/log.md` — one shared, append-only, author-prefixed logbook (`merge=union` — concurrent
  appends merge cleanly).
- `pm/actors/<id>.json` + `pm/actors/<id>.HANDOFF.md` — each person's working position and
  end-of-session briefing; nobody writes anyone else's files (a bundled hook enforces it).
- State updates are committed alongside the work they describe. Never write secrets into `pm/`.

Scratch under `tmp/` (gitignored, disposable — never load-bearing for resume):

- `tmp/environment-check.md` — `/pm-skill:doctor`'s readiness report.
- `untracked/` or `codex/` (gitignored) — `/pm-skill:codex-review` reports: `<stamp>-codex-review-<scope>[-<objective>].md` (+ an index file for multi-objective runs).
- Worktrees, prompts, raw agent output, and other ephemera.

## Safety

- **No implementation before your sign-off** — behavioural rule plus a bundled fail-open hook.
- **No secrets in tracked state:** a bundled hook blocks secret-shaped content (key tokens, PEM
  blocks, credential assignments) from being written into the git-tracked `pm/` directory.
- **Actor isolation:** a bundled hook blocks writes to another person's `pm/actors/` state files.
- **Repository safety:** the PM never overwrites your files without asking, commits only what it
  created for the current story, runs `git init` only after asking, and never pushes without an
  explicit request.
- **Optional hardening:** for *mechanical* enforcement (a read-only Bash posture, sign-off), the
  bundled hardening guide uses plain Claude Code permissions/hooks — no external process or dependency.

## Optional enhancements (work alongside — not required)

pm-skill is fully functional on its own. If your environment also has any of these, the PM may
prefer them where useful — but nothing here is a dependency:

- A dedicated planning / TDD skill suite for richer discovery and planning.
- An external code-review tool (for example an OpenAI Codex–based reviewer, or another model's CLI)
  for the optional independent review step.
- `gh` plus a GitHub remote for real pull requests (otherwise the PM uses local merges).

The spec / clarify / analyze / constitution steps add spec-driven rigor (inspired by spec-driven
development tools), and `pm-verifier` adds an independent final check — but they are **built in and
self-contained**. pm-skill does **not** depend on `spec-kit`, and there is **no external verifier
harness and no separate process** in this workflow: `pm-verifier` is an ordinary read-only Claude
Code subagent the PM dispatches.

## License

GPL-3.0-or-later — see [LICENSE](LICENSE). Copyright (c) 2026 bendusz.

This project is free software: you can redistribute it and/or modify it under the terms of the
GNU General Public License as published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version. If you distribute copies or modified versions,
they must remain under the GPL with source made available; private modifications you do not
distribute carry no such obligation.
