---
description: Check environment readiness before implementation, covering tooling, versions, and whether the project's gates actually run.
---

Use the `project-manager` skill to run a pre-implementation environment readiness check. Inspect and
probe only; the readiness report and its log entry are the only files you may write.

Scope: $ARGUMENTS  (optional, a sub-path or component; default is the whole repo)

Inspect (whichever apply):
- **Toolchain and versions.** The language runtimes, the package manager, and their versions, and
  whether `node --version` reports 20 or newer, which the hooks and the Codex runner need.
- **Claude execution regime.** Run `claude --version` when available and record the configured
  `model` and `effort` frontmatter for every agent the active story may use. For an Opus 5 story,
  flag Claude Code older than `v2.1.219`, a moving `model: opus` alias, or a host-level
  `CLAUDE_CODE_SUBAGENT_MODEL` or `CLAUDE_CODE_EFFORT_LEVEL` override. Do not claim a delivered
  model ID unless the host exposes it.
- **Dependencies.** Lockfiles present, and whether install has been run (`node_modules`, a venv).
- **Gates.** The `test`, `lint`, `build`, and `run` commands from `docs/plan.md` and `AGENTS.md`, and
  whether each actually runs. Use a non-mutating probe (`--version` or help, or the real command only
  when it is safe and fast). Record `N/A` for the ones the project does not have.
- **Config.** A missing `.env.example` or required env vars; CI config.
- **Containers.** A `Dockerfile` or devcontainer that defines the expected environment.
- **Setup steps.** Any documented bootstrap (README, CONTRIBUTING) needed before the gates pass.
- **Codex builder readiness.** If any build-ready story selects `codex-builder`, or the active
  story's `auto` builder may resolve to it, call the bundled runner with
  `--preflight --worktree <absolute-root> --story <story>` (omit `--story` for environment-only
  readiness). Treat `runner_status: ready` as authoritative. It checks exact-root Git state,
  sign-off, ignored runtime temp, Codex auth and capabilities, schemas, and machine story scope, then
  reports the fixed sandbox and environment policy. It never starts model inference and reports
  `quota_consumed: false`. A missing or logged-out Codex blocks only an explicit `codex-builder`
  story; `auto` may resolve to `expert-builder` and should record that fallback.
- **Instructions layer.** `AGENTS.md` exists at the project root; `CLAUDE.md` exists and its first
  line is `@AGENTS.md` (report `standalone` when it is not, and `missing` when absent); `AGENTS.md`
  is under 200 lines and under 32 KiB, the Codex budget, and report both numbers; list any
  `AGENTS.md` lines that restate skill rules (sign-off before implementation, the PM writes no code,
  log after every step, verifier PASS before ship, traceability to FR and AC ids) as trim candidates.
- **PM state health.** When `pm/` exists, run the checks under "State health (doctor)" in
  `references/artifact-consistency.md` and report `OK` or `DRIFT` for each.

Run only non-mutating probes, and do **not** install or upgrade anything. The readiness report under
`tmp/` and its one `pm/log.md` entry are the only permitted writes. Delegate heavy reading to a
read-only subagent if that helps.

Write the findings to `tmp/environment-check.md` (runtime-only): each check as `OK`, `MISSING`, or
`UNKNOWN` with the evidence, then a one-line verdict (ready, or the blockers and what is missing).
Append a one-line entry to `pm/log.md`.

Run this before the implementation loop on an unfamiliar or freshly-cloned project. Environment and
dependency gaps are a common cause of mid-build failure.
