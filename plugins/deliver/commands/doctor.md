---
description: Check readiness before implementation, covering the T3 host, the toolchain, whether the project's gates pass, Codex availability and log.sh.
---

Use the `project-manager` skill to run a readiness check. Install or upgrade nothing, and write no
file of your own. Running a gate may leave the artifacts a normal run produces (build output,
caches, coverage); leave them as the run left them.

Scope: $ARGUMENTS  (optional, a sub-path or component; default is the whole repo)

Check, in order, each with its evidence:
1. **T3 host.** Load `ToolSearch select:mcp__t3-code__orchestrator_capabilities` and call it once
   (`references/host.md` `## Probe`). If it is absent or fails, report
   `MISSING: deliver requires T3 Code` and stop: the other checks mean nothing without it.
2. **Toolchain**, `OK`, `MISSING` or `UNKNOWN`. The runtimes, package manager and dependencies
   behind the plan's `## Commands` (or, before a plan exists, what the manifests and lockfiles
   name): each resolves on `PATH`, with its version from a `--version` probe, and install has been
   run (`node_modules`, a venv, a lockfile in sync). This shows the tools exist, not that gates pass.
3. **Gates**, `PASS`, `FAIL`, `UNKNOWN` or `N/A`. Run each of the plan's `test`, `lint` and `build`
   commands for real, from the repository root, exactly as the plan writes it. A version or help
   probe is not evidence here.
   - `PASS`: it exited 0. `FAIL`: it did not; quote the command, the exit code and the first
     error lines.
   - `UNKNOWN`: it cannot run safely here, for example it needs a service, credentials or a
     destructive step. Say what it needs and what stays unverified. Never fake the missing piece.
   - `N/A`: the plan says `N/A`. Before a plan exists, every gate is `UNKNOWN: no plan yet`.
   - `run` is not a gate: step 2 covers the program it starts.
4. **Codex**, `OK` or `MISSING`. `orchestrator_capabilities` lists the `codex` provider with the
   models the `references/roles.md` defaults name. Without it there is no opposite-family reviewer
   for a Claude build, so the default workflow cannot run: report `MISSING` as a blocker. Recommend
   restoring Codex in T3, or an explicit change of workflow the user approves and the log records.
   Never move a Codex default to a Claude model on your own: same-family review breaks the
   hard rule that the reviewer is never the builder.
5. **Decision log**, `OK` or `MISSING`. `"${CLAUDE_PLUGIN_ROOT}/scripts/log.sh"` exists and is
   executable (`test -x`). Do not call it: a call writes a line.

End with a one-line verdict: ready only when the host, toolchain, Codex and log checks are `OK` and every gate
is `PASS` or `N/A`. Otherwise name the blockers and what each needs.
