---
description: Check environment readiness before implementation, covering tooling, versions, and whether the project's gates actually run.
---

Use the `project-manager` skill to run a pre-implementation environment readiness check. Inspect and
probe only; the readiness report is the only file you may write, apart from the merge gate install below.

Scope: $ARGUMENTS  (optional, a sub-path or component; default is the whole repo)

Inspect (whichever apply):
- **Toolchain and versions.** The language runtimes, the package manager, and their versions, and
  whether `node --version` reports 20 or newer.
- **Claude version and agent settings.** Run `claude --version` when available and record the
  configured `model` and `effort` frontmatter for every agent the active story may use. For a story that
  uses an Opus agent, flag Claude Code older than `v2.1.292` (no per-dispatch effort, so the fix loop
  cannot escalate), a moving `model: opus` alias, or a host-level
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
  `--mode build --preflight --worktree <absolute-root> --story <story>` (omit `--story` for environment-only
  readiness). Treat `runner_status: ready` as authoritative. It never starts model inference and
  reports `quota_consumed: false`. A missing or logged-out Codex blocks only an explicit
  `codex-builder` story; `auto` may resolve to `expert-builder` and should record that fallback.
- **Instructions layer.** `AGENTS.md` exists at the project root; `CLAUDE.md` exists and its first
  line is `@AGENTS.md` (report `standalone` when it is not, and `missing` when absent); `AGENTS.md`
  is under 200 lines and under 32 KiB, the Codex budget, and report both numbers; list any
  `AGENTS.md` lines that restate skill rules (sign-off before implementation, the PM writes no code,
  commit as you go, verifier PASS before ship, traceability to FR and AC ids) as trim candidates.
- **T3 Code host.** Only when the probe in `references/host-t3.md` succeeds:
  - T3 accepts a custom Claude `homePath`, which can hide this plugin. Confirm the `deliver`
    agents and `/deliver:*` commands are visible in this session.
  - `node` and `codex` resolve on the PATH T3 gives the session (`command -v`, or `where` on
    Windows).
  - `claude --version` meets the minimum above, `v2.1.292`.
  - The PM thread runs in the root workspace, not a host worktree. The two lines of
    `git rev-parse --path-format=absolute --git-dir --git-common-dir` (git 2.31 or newer) are
    equal from anywhere in the root checkout and differ in a linked worktree. Without
    `--path-format`, the plain output differs in a subdirectory too.
- **Git-level merge gate.** In a deliver project, run
  `node "${CLAUDE_PLUGIN_ROOT}/hooks/git-hook-install.mjs" --check <project-root>`. It exits 0
  (`OK`) only when the `reference-transaction` shim in `git rev-parse --git-path hooks` (on git
  older than 2.28, `pre-merge-commit` and `pre-commit`) carries `# deliver-merge-gate v2` on line
  2, is executable, points to a `git-merge-gate.mjs` that exists, runs a node that starts, and
  names the current integration branches. It prints the git version against 2.28, and below git
  2.38 the line "merged-tree check needs git 2.38; merges are not compared with the verified
  automatic merge" (the verdicts are still checked; below 2.28 the fallback also misses
  fast-forwards, squash merges, and cherry-picks, and compares a merge's staged result only where
  git needs no content merge). A foreign hook that already runs deliver's lines shows as
  `chained`, which is in place, in any hooks directory; `chained-inactive` (not executable; run
  the printed `chmod +x`), `chained-crlf` (CRLF line endings; convert the hook to LF),
  `chained-stale` (lines from an earlier version; replace them as printed), and `copy-missing`
  or `copy-stale` (run the installer without `--check`) are not. For a hook whose interpreter is
  not sh, it prints an sh wrapper to install instead. It reports mode `none` on git 2.28 or newer
  when the plan's integration branch is a `pm/*` name (no hook is written; fix the plan); an
  invalid branch name, or a branch that does not exist, is reported, and `--check` exits 1. It
  also reports an integration branch with no upstream ("set one with git branch
  --set-upstream-to"). It
  reports `merge gate: disabled` and exits 1 when `git config deliver.mergeGate` is `off`, which
  `--uninstall` sets; ask before re-enabling, since the user turned it off. It also reports a
  deliver shim it cannot remove, such as a v1 shim in an in-tree `core.hooksPath`. On any other
  failure, run the same command without `--check`, which installs or repairs it (and clears
  `deliver.mergeGate off`), and report what it could not fix: a hook it will not overwrite, or a
  hooks directory in the working tree, behind a symlink outside the git directory, or from global
  `core.hooksPath`, each with the lines to add right after that hook's `#!` line. `--uninstall`
  removes it and keeps it off; `--check` and `--uninstall` together are refused.
- **State health.** When `docs/approval.json` or a legacy `pm/` exists, run the checks in
  `references/state-health.md` and report `OK` or `DRIFT` for each.

Do **not** install or upgrade anything, except deliver's own git-level merge gate as above. Delegate heavy reading to a read-only subagent if that
helps.

Write the findings to `tmp/environment-check.md` (runtime-only): each check as `OK`, `MISSING`, or
`UNKNOWN` with the evidence, then a one-line verdict (ready, or the blockers and what is missing).

Run this before the implementation loop on a fresh or unfamiliar clone.
