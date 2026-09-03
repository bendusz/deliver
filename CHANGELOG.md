# Changelog

All notable changes to this project are documented here.

## 0.16.0 - 2026-09-03

AGENTS.md instructions layer and a cross-platform Node runtime. One instructions file for every
agent, no bash or jq at runtime, and every Codex call behind a Sonnet wrapper.

- **AGENTS.md is canonical.** The scaffold writes a facts-only `AGENTS.md` (commands, layout,
  conventions, gotchas; about 40 lines) and a two-line `CLAUDE.md` bridge starting with
  `@AGENTS.md`. Existing files are never overwritten; the PM proposes a migration. Optional
  `.claude/rules/pm-state.md` and `pm/AGENTS.md` carry `pm/` discipline at `standard` scale and
  above. `references/instruction-layers.md` records where facts, procedure, constraints, and
  persona live; `SOUL.md` is deliberately not adopted. All agents read `AGENTS.md`;
  `/pm-skill:doctor` checks the layout, size, and duplicated rules.
- **Hooks in Node.** The four guardrails and their shared library are Node ESM in exec form
  (`"command": "node"`), with identical exit codes, messages, and actor ids (POSIX `cksum`
  reimplemented and pinned to captured vectors). `jq` is no longer needed. `node lib.mjs scan`
  and `node lib.mjs actor-id` replace the bash CLI.
- **One Codex runner.** `scripts/codex/run.mjs` provides `build`, `fix`, `review`, `advise`, and
  `research` modes with the bash runner's full safety posture, resolves `codex.exe` or the npm
  shim on Windows, kills process trees on timeout, and feeds prompts on stdin. On Windows build
  and fix run with full access (no platform sandbox) and rely on the runner's post-run scope
  detection. Two new Sonnet wrappers, `codex-reviewer` and `codex-advisor`, join `codex-builder`
  and `codex-researcher`; `/pm-skill:codex-review` and `/pm-skill:codex-help` dispatch them and
  never run `codex` in the main session (validate enforces it).
- **CI on three operating systems.** `node --test` runs on ubuntu, macos, and windows.
- **Requirement.** Node.js 20 or newer at runtime.
- **Hardening from review.** Line-oriented secret scan, canonical case and symlink handling,
  sanitised session context, synchronous hook output, a `hooks.json` wiring check in validate,
  `.gitignore` consent for Codex review reports, report-name collision handling, and a `git` probe
  in the runner.

## 0.15.0 - 2026-08-27

Focused Opus 5 defaults. Gate-bearing Claude roles now use a stable model family, re-ground in
current evidence, and stay inside a mechanically checked story boundary.

- **Stable Opus selection.** All seven Opus agents request `claude-opus-5` instead of the moving
  `opus` alias. `/pm-skill:doctor` records the Claude Code version, configured model and effort,
  and host-level subagent override. Claude Code `v2.1.219` is the documented minimum for Opus 5.
- **Builder effort reduced.** `expert-builder` defaults to `high`, down from `xhigh`. Its task
  contract names the allowed path scope, stop condition, and ambiguity rule. No shipped Opus agent
  uses `xhigh` or `max`.
- **Role-specific focus.** Every Opus agent re-reads its current inputs, stays within one explicit
  role and task, stops at its completion criteria, and reports missing evidence instead of guessing.
  The prompts avoid generic extra-verification and delegation requests.
- **Mechanical scope check.** Sequential and parallel delivery now derive changed paths from Git
  after every writer run, compare them with authoritative `pm-meta.touches`, and stop before review
  or ship on an unexplained path. Agent-reported file lists are not trusted as complete.
- **Recovery and validation.** The PM checkpoints actor state before compaction and verifies it
  after resume. The existing validation script locks exact Opus model and effort defaults without
  adding a benchmark product or standalone test harness. The research behind the change is in
  `docs/research/2026-08-26-opus-agent-performance.md`.

## 0.14.0 - 2026-08-26

poteto companion plugin. Lauren Tan's pstack skills ship in this marketplace as a second, optional
plugin, and pm-skill's references learn to use them when they are present.

- **New `poteto` plugin** (`plugins/poteto/`, MIT, copyright Lauren Tan) — 14 workflow skills
  (`how`, `why`, `unslop`, `architect`, `arena`, `blast-radius`, `interrogate`,
  `technical-writing`, `create-verification-skill`, `maintain-verification-skill`, `reflect`,
  `teach`, `typescript-best-practices`, `bro`) and all 21 `principle-*` skills, ported from pstack
  0.14.3. Patches are limited to Claude Code model aliases, subagent parameters, config lookups,
  paths, tool names, and `/poteto:` namespacing; `PORT.md` lists every one and the upstream SHA.
  Skills only, no hooks. Install with `/plugin install poteto@pm-skill`.
- **Reference edits (optional, detect-and-adapt)** — planning and decomposition may run a
  design-exploration skill for Architecture-sensitive work; review triage gains Act on / Consider /
  Noted / Dismissed buckets and filtering rules; a blast-radius lens may join the panel for small
  diffs into shared code; `pm-verifier` drives a project `verify-<app>` skill when one exists;
  ship uses a Why / Scope / Tradeoffs / Blast radius / Verification PR body; `/pm-skill:handoff`
  audits the log against repo state first; `technical-writer` applies a handed-in writing
  standard; the constitution template offers the 21 principles as a menu.
- **Validation** — `scripts/validate.sh` checks the second plugin's manifest, license, README,
  skill frontmatter, and that no Cursor-only string survived the port.
- **Docs** — README install step and Optional-enhancements entry, `docs/prior-art.md` pstack
  entry, v0.14 spec and plan.

## 0.13.0 - 2026-08-22

Codex precision builder. Opus remains the broad-context implementation worker; bounded stories and
localized fix rounds can now use a write-capable Codex worker without weakening the PM gates.

- **New `codex-builder` agent** (`sonnet` / `medium` liaison, inner Codex default
  `gpt-5.6-sol` / `high`) for precise implementation and evidence-rich fixes. It is deliberately
  thin and never solves or edits outside the bundled runner.
- **Hardened runner** fails closed on missing, malformed, unsigned, or symlinked PM state; enforces
  strict `pm-meta` JSON scope; and derives authoritative changes from before/after content snapshots.
  Fixed CLI overrides disable host temp roots, network, web search, inherited MCP servers, lifecycle
  hooks, subagents, login shells, user config, and execpolicy rules; tool shells receive a reduced,
  secret-filtered environment plus a disposable worktree-local `TMPDIR`. Strict config rejects unknown keys. It rejects
  protected/out-of-scope/unreported edits and fingerprints
  HEAD, all refs, staged contents, local config, and worktree registrations.
  Duplicate changed paths are checked after response generation because the API's strict structured
  output subset does not accept JSON Schema `uniqueItems`.
- **Bounded execution** adds a 10-minute default timeout, signal/process-tree cleanup, partial-diff
  preservation, failure-only diagnostics retention, and automatic scratch cleanup after success.
- **Explicit routing** adds `Builder: expert-builder | codex-builder | auto` to stories. Broad,
  cross-cutting, or architecture-heavy work stays with Opus; precise stories and localized
  review/gate fixes prefer Codex. Switching workers never resets the existing retry or fix bounds.
- **Resumable routing and worktrees** persist `resolved_builder` in sequential actor state and a
  `builder` per parallel-batch entry. Parallel `expert-builder` dispatches now receive and verify
  the absolute worktree root.
- **Quota-free behavioral tests** cover missing CLI, failed auth, missing/symlinked/unsigned state,
  nonzero exits, done/blocked results, hostile project config, protected/out-of-scope/unreported
  edits, dirty baselines, timeouts and descendant cleanup, path containment, fix evidence, and broad
  git metadata tampering. `/pm-skill:doctor` now probes Codex only when routing may need it.
- **Operational checks** add `--preflight` for no-inference readiness, an opt-in real Codex smoke
  test, and `/pm-skill:benchmark-builders` with a transparent scorer, result schema, and stable
  routing-case corpus. Benchmark work is isolated and never merged.
- **Docs and references** update the agent roster, model tiers, decomposition, sequential and
  parallel loops, safety guidance, and the local Codex CLI reference for codex-cli 0.149.0.

## 0.12.0 — 2026-08-02

Research agents — the fleet gains an external-research role and an optional second-model
counterpart; findings persist under `docs/research/` instead of dying with the session.

- **New `researcher` agent** (`sonnet`/`medium`) — web-capable (WebSearch/WebFetch); answers one
  tightly-scoped external question per dispatch (library choice, SDK facts, prior art) with
  sourced findings and an explicit recommendation; writes `docs/research/YYYY-MM-DD-<slug>.md`
  and returns a ≤20-line digest. Write access is prompt-constrained to `docs/research/` only.
- **New `codex-researcher` agent** (`sonnet`/`medium`) — drives `codex exec --sandbox read-only
  --ephemeral` (default `gpt-5.6-terra` @ `high`, `--search` when the CLI supports it) for an
  independent second-model research opinion; risk-selected alongside `researcher` for
  consequential or contested questions, mirroring codex-review vs the review panel; returns
  UNAVAILABLE cleanly when the codex CLI is missing; attributed report at
  `docs/research/YYYY-MM-DD-<slug>-codex.md`.
- **Dispatch guidance rerouted** — SKILL.md and the discovery/specification/planning references
  now send research to `researcher` instead of the built-in `general-purpose`/`Explore` agents.
- **Docs** — model-tiering table extended (both new agents on `sonnet`/`medium`); README roster
  updated; codex `--search` non-support (codex-cli 0.145.0) recorded in `docs/codex-cli-reference.md`.

## 0.11.0 — 2026-07-25

Model consolidation for the Claude 5 family — Opus 5 closed the gap that justified Fable for
code-writing, so the shipped defaults get cheaper with quality concentrated where it counts.

- **`expert-builder` re-tiered** from `fable`/`medium` to `opus`/`xhigh` — one model for the whole
  judgement-heavy core, with effort (not model tier) as the quality lever; the builder is now the
  deepest-thinking agent in the fleet.
- **Light roles to `sonnet`**: `codebase-analyst` and `technical-writer` drop from `opus` — the two
  roles least sensitive to model tier. All gate-bearing roles (reviews, verification, tests) stay
  on `opus`; `security-auditor` and `debugger` keep `high` effort.
- **Aliases, not IDs**: pins stay on `opus`/`sonnet`, resolving to Opus 5 / Sonnet 5 today and
  auto-tracking future releases. Re-pin `fable` per agent frontmatter to restore the old builder.
- **Docs updated** — `references/model-tiering.md` rewritten around the v0.11 mapping; the
  SKILL.md tiering summary matches.

## 0.10.1 — 2026-07-16

Hook hardening — fixes the six findings from a whole-codebase codex review (gpt-5.6-sol). New
shared `hooks/lib.sh`; behavioral hook tests (`scripts/test-hooks.sh`, 42 cases) now run in
`validate.sh`/CI.

- **Project-root discovery**: hooks resolve `$CLAUDE_PROJECT_DIR` → git top level → cwd, so
  sessions started in a subdirectory no longer silently disable sign-off enforcement or resume.
- **Canonical path containment**: `pm/../src/…` traversal and symlinked-directory aliases now
  classify by the real target instead of bypassing the allowlists.
- **Secret tripwire**: credential assignments are matched case-insensitively, quoted or unquoted
  (`API_KEY=…`, `Password: …`); placeholders (`$ENV_REF`, `<rotate-me>`, `{{ templates }}`) no
  longer false-positive.
- **Actor ids are globally unique**: slug of the full email + 12-hex digest
  (`v-bende-gmail-com-0719f22c3305`), so same local-part users on different domains — and slug
  homographs like `alex.foo@` vs `alex-foo@` — stop conflating state. Pre-0.10.1 ids appear as
  orphans; `git mv` them to the new id on first resume (documented in logging-and-state.md).
- **Outgoing-diff secret scan**: the external-review step scans the exact diff for secret
  *values* (`hooks/lib.sh scan`, or gitleaks/trufflehog when installed) instead of grepping
  uppercase labels — `APIClient` no longer blocks, lowercase real secrets no longer pass.

## 0.10.0 — 2026-07-16

- **New command `/pm-skill:codex-review`** — runs the OpenAI Codex CLI (`codex exec review`) as an
  independent reviewer: scopes `recent` (last commit) / `worktree` (uncommitted) / `codebase`
  (read-only full audit), `model=`/`effort=`/`timeout=` overrides (default `gpt-5.6-terra` @
  `high`), parallel objective agents (presets `security`/`bugs`/`architecture`/`tests`/
  `performance`, `panel`, or free-form), timestamped reports in `untracked/` or a gitignored
  `codex/`, plus an index file for multi-objective runs.
- **New command `/pm-skill:codex-help`** — ask Codex for advice / a second opinion on a
  consequential decision (default `gpt-5.6-sol` @ `medium`, overridable); read-only, answer
  relayed in chat with Claude's own take. Guardrail: reserved for real changes needing a second
  pair of eyes.
- Project-manager skill: notes `/pm-skill:codex-review` as an optional second-model reviewer
  alongside the risk-selected panel, and `/pm-skill:codex-help` for one-off second opinions.

## 0.9.3 — 2026-07-07

Relicense from MIT to GPL-3.0-or-later.

- **License changed to GPLv3** — `LICENSE` now carries the canonical GNU GPL v3 text; copies and
  modified versions that are distributed must remain under the GPL with source available.
- **Metadata updated** — `plugin.json` `license` field is `GPL-3.0-or-later`; the README License
  section explains the copyleft terms.
- Releases up to and including v0.9.2 remain available under their original MIT terms.

## 0.9.2 — 2026-07-07

Explicit model + effort pinning for every agent.

- **All nine agents ship pinned** — no agent uses `model: inherit` anymore; behaviour no longer
  depends on the session model. `expert-builder` is pinned to `fable` (top tier); the other eight
  are pinned to `opus`.
- **Reasoning effort set per agent** — new `effort:` frontmatter on every agent:
  `security-auditor` and `debugger` run at `high`; all other agents at `medium`.
- **Docs updated** — `references/model-tiering.md` rewritten around the new pinned mapping and the
  `effort:` override; the SKILL.md tiering summary matches.

## 0.9.1 — 2026-07-05

Agent-quality pass, driven by verified community/official best-practice research (Anthropic
subagent docs and engineering posts; wshobson/agents and VoltAgent conventions).

- **Trigger-condition descriptions** — every agent's `description` now states *when* to use it
  (concrete activation conditions, `PROACTIVELY` where standalone use is safe), not just what it
  is, making delegation reliable inside and outside the PM loop.
- **Explicit completion criteria** — every agent now defines what *done* means; `pm-verifier`
  gains the early-victory rule (MUST run the verification command and every runnable non-mutating
  gate itself before PASS), and builder/test-engineer must run what they wrote before reporting.
- **Reviewer calibration** — the three review lenses gain a shared approach/calibration block
  (diff-first evidence, named-risk-only exploration, honest severity, no invented findings).
- **Model tiering on by default for routine roles** — `debugger`, `test-engineer`,
  `technical-writer`, `codebase-analyst` ship pinned to `sonnet`; the five quality-critical agents
  keep `model: inherit`. `references/model-tiering.md` rewritten around the shipped defaults.

## 0.9.0 — 2026-07-05

Multi-actor PM state: several people can run concurrent PM sessions on one repo without
overwriting each other. Solo is a team of one — same layout, no mode switch.
(Design: `docs/specs/2026-07-05-v0.9-multi-actor-state.md`.)

- **Shared core + per-actor state** — `pm/pm-state.json` slims to project facts plus an
  `assignments` claims map; each person's position (story, branch, loop counters, next, handoff
  freshness) lives in `pm/actors/<id>.json`, identity derived from git `user.email`/`user.name`.
- **Shared append-only log** — author-prefixed entries, `merge=union` gitattribute (bootstrap
  writes it) so concurrent appends merge cleanly; the mutable Current State block is removed.
- **Per-actor handoffs** — `/pm-skill:handoff` writes `pm/actors/<id>.HANDOFF.md`; staleness is
  checked against the actor file.
- **Claim & sync discipline** — pull before claim/ship, claims committed on the integration
  branch (pushed only under the user's standing push permission), re-gate if
  the integration tip moved, claims released in the ship commit; `/pm-skill:doctor` and
  `/pm-skill:analyze` flag double-claims, stale claims, and cross-actor `Touches` overlap.
- **`actor-guard.sh`** — new fail-open hook blocking writes to another actor's state files; the
  session hook now shows your position plus teammates' one-liners.
- **Migration** — flat 0.8 layouts split into shared + actor files on resume (log block stripped,
  gitattribute added); pre-0.8 `tmp/` layouts chain through in one pass.

## 0.8.0 — 2026-07-05

Durable, git-tracked session state: the PM state files move from gitignored `tmp/` to a tracked
`pm/` directory.

- **Tracked `pm/` state directory** — `pm/pm-state.json`, `pm/log.md`, and the optional
  `pm/HANDOFF.md` replace `tmp/pm-state.json` / `tmp/log.md`. The state trio is the
  project's only durable resume point, so it now lives in git and travels with every clone/push;
  state updates are committed alongside the work they describe (e.g. with each story's ship/log
  commit). Bootstrap verifies the state files are not gitignored (`git check-ignore
  pm/pm-state.json pm/log.md` — the files, not the directory, so `pm/*`-style rules are caught)
  and commits `pm/` from the first state write.
- **`/pm-skill:handoff`** — end a session by writing `pm/HANDOFF.md` (from the new
  `HANDOFF.md.template`): a token-efficient, agent-to-agent briefing — position, in-flight story
  state, gate results, open findings, decisions not yet in docs, gotchas, `READ_FIRST`/`SKIP`
  pointers, ordered next steps. `/pm-skill:resume` reads it (after `pm-state.json`) when current;
  staleness is a JSON check — the new `handoff_written` state field vs `updated`. A worked
  handoff example ships in `examples/todo-cli/pm/`.
- **Session re-grounding hook** — a new `SessionStart` hook (`hooks/session-context.sh`) injects a
  short pm/-state pointer (phase, story, next step, handoff freshness) into every new, resumed,
  cleared, or **freshly-compacted** session of a PM-managed project; silent everywhere else. The
  PM also offers `/pm-skill:handoff` at sprint checkpoints and when context runs long.
- **Secrets guard hook** — a new `PreToolUse` hook (`hooks/pm-secrets-guard.sh`) blocks writes into
  the tracked `pm/` directory whose content matches high-confidence secret shapes (AWS/GitHub/
  Slack/API tokens, PEM private keys, JWTs, quoted credential assignments). Fail-open, same
  `PM_SKILL_NO_ENFORCE=1` kill switch; a tripwire for accidents, not a scanner.
- **Loop bounds survive resume** — new `current_story_rounds` / `current_story_retries` state
  fields persist the ≤3 fix-round / ≤2 builder-retry caps across sessions (parallel-path batch
  entries carry the same counters), so a resumed session can no longer silently reset the bounds.
- **`/pm-skill:correct-course`** — the sanctioned path for mid-flight scope changes: checkpoint the
  in-flight story, apply the change at the right altitude (spec / plan / story), void sign-off if
  the change is material (`signed_off: false` re-engages the hook), reset the story's counters,
  log and commit.
- **`/pm-skill:doctor` checks PM-state health** — state JSON parses, `pm/` not gitignored, `tmp/`
  ignored, log/state/plan sign-off agreement, and handoff freshness.
- **CI hardening** — the validate workflow now also runs `shellcheck` over all hooks and scripts;
  `validate.sh` checks every bundled hook is executable.
- **`tmp/` stays scratch and gitignored** — prompts, raw subagent/review output, diffs,
  `tmp/environment-check.md`, `tmp/worktrees/`, one-off scripts. Nothing in `tmp/` may be
  load-bearing for resume.
- **No-secrets rule (now load-bearing)** — `pm/` is tracked, so secrets/credentials must never be
  written into the state files; reference secret locations, never values.
- **Migration** — on `/pm-skill:resume` (or any state read), a pre-0.8 project with state still
  under `tmp/` is migrated: files move to `pm/`, one-line pointer stubs are left in `tmp/`, repo
  references are updated, and the result is committed. The sign-off hook reads
  `pm/pm-state.json` and falls back to `tmp/pm-state.json` for not-yet-migrated projects; its
  pre-sign-off allowlist now includes `pm/*`.

## 0.7.0 — 2026-06-06

Mechanical rigor and right-sizing on top of the spec-driven workflow.

- **EARS acceptance criteria** — `spec.md.template` now models behavioural criteria as
  `WHEN <event>, THE SYSTEM SHALL <behaviour>` (plain measurable statements for non-event criteria),
  making them directly testable for `test-engineer` and `pm-verifier`.
- **`/pm-skill:checklist`** — generate (and optionally evaluate, with evidence) the spec / plan /
  story / verification quality checklists under `docs/checklists/`.
- **`/pm-skill:doctor`** — a read-mostly environment-readiness probe (toolchain, lockfiles, and
  whether the gates actually run) → `tmp/environment-check.md`, run before the implementation loop.
- **Scale profiles** (`references/scale-profiles.md`) — `tiny`→`regulated` right-size the workflow;
  scaling down drops artifacts/ceremony but never the hard rules. `pm-state.json` gains `scale`;
  `plan.md` gains a Delivery mode section.
- **Story risk/lens metadata** — stories declare `Risk` and `Review lenses` (+ `Security-sensitive` /
  `Architecture-sensitive`), so `/pm-skill:analyze` checks declared-vs-actual instead of guessing.
- **Optional hardening** (`references/hardening.md` + `claude-settings-hardening.json.template`) — a
  Claude Code-native hook that scopes a read-only Bash allowlist to the `pm-verifier` subagent (via the
  `agent_type` hook input), leaving the PM unaffected; the verifier's read-only Bash is otherwise a
  behavioural rule, not a sandbox.
- **Validation** — `scripts/validate.sh` now also checks reference integrity (SKILL references,
  template references, command frontmatter), parses the JSON templates, and verifies the CHANGELOG top
  matches the plugin version.

## 0.6.0 — 2026-06-06

Spec-driven planning, traceability, and an independent final verification step — all Claude
Code-native and self-contained (no external dependency).

- **New commands:** `/pm-skill:specify` (durable `docs/spec.md`), `/pm-skill:clarify` (resolve
  `[NEEDS CLARIFICATION]`, ≤5 questions), `/pm-skill:constitution` (project rules), `/pm-skill:analyze`
  (read-only cross-artifact consistency report).
- **New agent:** `pm-verifier` — read-only final `PASS`/`FAIL`/`UNKNOWN` gate; a story can't ship
  without PASS.
- **New references:** `specification.md`, `verification.md`, `artifact-consistency.md`.
- **Traceability:** stable spec IDs (`US-`/`FR-`/`AC-`/`SM-`), a story `Covers:` field, and a plan
  `covers` column + Traceability table.
- **New templates:** spec, constitution, verification-report, and four quality checklists.
- Workflow is now discover → specify → clarify → plan → sign-off → analyze → decompose → build → gate
  → review → fix → verify → ship → log. `pm-state.json` gains `spec`, `constitution`,
  `last_analysis_status`, and `current_story_verification_status`.

## 0.5.0 — 2026-06-04

Parallel `[P]` story execution via git worktrees — opt-in, best-effort, with a hard fallback to the
sequential loop.

- New `references/parallel-execution.md`: build independent `[P]` stories at once in isolated git
  worktrees, then integrate them **one at a time** (concurrent build, serialized integration — the
  model behind merge queues / merge trains / the "Not Rocket Science Rule").
- Safe because builders make no commits (the PM owns git): the concurrent phase does zero git writes,
  so there's no shared-`.git` contention. Before each land, the latest integration tip is merged in
  and the full gates re-run — catching semantic conflicts two "independent" stories can create.
- Decomposition records each story's **Touches** (files/modules); `[P]` + non-overlapping Touches
  selects the batch. Default fan-out 3 (configurable). `tmp/worktrees/` (gitignored); native
  worktree isolation preferred when the host offers it.
- Worktree safety: never `rm -rf`, never force-remove a dirty worktree, no orphans (prune on
  resume). `pm-state.json` gains a `parallel_batch` array for resume. Same gates/review panel as
  sequential.

## 0.4.0 — 2026-06-04

More delivery agents and optional model tiering. All additive — defaults unchanged.

- New bundled agents: `security-auditor` (read-only deep security lens, risk-selected),
  `technical-writer` (docs only — README, usage, CHANGELOG, completion report), and `debugger`
  (read-only root-cause diagnosis → fix plan the builder applies).
- `security-auditor` is now a first-class risk-triggered lens in the review panel
  (`review-gates.md`); `debugger` joins the fix loop when a gate fails or it stalls; an optional
  Document step adds `technical-writer` at the sprint/project boundary.
- **Optional model tiering** (`references/model-tiering.md`) — map agents to cheaper/stronger models
  by abstract tier (deep / standard / light). Off by default; every agent still inherits the session
  model and no vendor model IDs are hardcoded.
- New `completion-report.md.template`.

## 0.3.0 — 2026-06-04

Hardening: enforcement, recoverable state, CI, and a worked example.

- **Sign-off enforcement hook** (`hooks/`) — a fail-open `PreToolUse` hook that blocks implementation
  writes until `tmp/pm-state.json` has `signed_off: true`. Inert outside a PM project; kill switch
  `PM_SKILL_NO_ENFORCE=1`.
- **Structured state + resume** — `tmp/pm-state.json` and the `/pm-skill:resume` command.
- **Story-readiness check** before build, and **reviewer-finding triage** before the fix loop.
- **Worked example** under `examples/todo-cli/`.
- **CI + OSS hygiene** — `scripts/validate.sh`, a validate workflow, CONTRIBUTING, and issue/PR templates.

## 0.2.0 — 2026-06-04

Delivery agents and risk-based review.

- New bundled agents: `codebase-analyst` (read-only context pack), `test-engineer` (tests only),
  `architecture-reviewer` (read-only design lens).
- Review generalised into a risk-selected **panel** (`review-gates.md`): always run
  `code-integrity-reviewer`; add `architecture-reviewer` for structural changes.
- Planning gains an optional `codebase-analyst` analyze step for brownfield projects.

## 0.1.0 — 2026-06-02

Initial release.

- `project-manager` skill: discover → plan → sign-off → decompose → orchestrate → review → ship → log.
- Bundled agents: `expert-builder` (implementation) and `code-integrity-reviewer` (read-only review).
- `/pm-skill:pm` command entry.
- Target-project templates: `CLAUDE.md`, `plan.md`, `story.md`, `log.md`.
- Sprint-level checkpoints (configurable); `tmp/log.md` recovery; repository-safety rules.
