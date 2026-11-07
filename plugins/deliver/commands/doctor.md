---
description: Check readiness before implementation, covering the T3 host, the toolchain, whether the project's gates run, Codex availability and log.sh.
---

Use the `project-manager` skill to run a readiness check. Inspect and probe only: install or
upgrade nothing, and write no file.

Scope: $ARGUMENTS  (optional, a sub-path or component; default is the whole repo)

Check, in order, each as `OK`, `MISSING` or `UNKNOWN` with its evidence:
1. **T3 host.** Load `ToolSearch select:mcp__t3-code__orchestrator_capabilities` and call it once
   (`references/host.md` `## Probe`). If it is absent or fails, report
   `MISSING: deliver requires T3 Code` and stop: the other checks mean nothing without it.
2. **Toolchain.** The runtimes, package manager and dependencies behind the plan's `## Commands`
   (or, before a plan exists, what the manifests and lockfiles name): each resolves on `PATH` with
   its version, and install has been run (`node_modules`, a venv, a lockfile in sync).
3. **Gates.** Each of `test`, `lint`, `build` and `run` from `docs/plan.md` actually runs. Use a
   non-mutating probe (`--version`, help, or the real command when it is safe and fast). Record
   `N/A` for the ones the project does not have.
4. **Codex.** `orchestrator_capabilities` lists the `codex` provider with the models the
   `references/roles.md` defaults name. Without it, a Codex builder or reviewer default cannot be
   dispatched: report which defaults must move to a Claude model.
5. **Decision log.** `"${CLAUDE_PLUGIN_ROOT}/scripts/log.sh"` exists and is executable
   (`test -x`). Do not call it: a call writes a line.

End with a one-line verdict: ready, or the blockers and what each needs.
