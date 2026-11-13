---
name: doctor
description: Check readiness before implementation, covering the T3 host, the toolchain, whether the project's gates pass, Codex availability, log.sh and the pre-push secret scan.
argument-hint: "[sub-path or component]"
---

If you were dispatched as a child agent (your task begins 'You are a bstack … child'), do not use this skill.

`references/…` below means `${CLAUDE_PLUGIN_ROOT}/skills/project-manager/references/…`, and
`<plugin>` in any reference means `${CLAUDE_PLUGIN_ROOT}`. Neither is a shell variable: write the
path out in every command.

Run the `bstack:project-manager` skill's procedure (load that skill first) for a readiness check.
Install or upgrade nothing, and write no file of your own. Running a gate may leave the artifacts
a normal run produces (build output, caches, coverage); leave them as the run left them.

Scope: $ARGUMENTS  (optional, a sub-path or component; default is the whole repo)

Check, in order, each with its evidence:
1. **T3 host.** Load `ToolSearch select:mcp__t3-code__orchestrator_capabilities` and call it once
   (`references/host.md` `## Probe`). If it is absent or fails, report
   `MISSING: bstack requires T3 Code` and stop: the other checks mean nothing without it.
2. **Toolchain**, `OK`, `MISSING` or `UNKNOWN`. The runtimes, package manager and dependencies
   behind the plan's `## Commands` (or, before a plan exists, what the manifests and lockfiles
   name): each resolves on `PATH`, with its version from a `--version` probe, and install has been
   run (`node_modules`, a venv, a lockfile in sync). This shows the tools exist, not that gates pass.
   `UNKNOWN` too when the gates need installed dependencies and the plan's `setup` is missing or
   `N/A`: every builder starts in a fresh worktree that could not run them.
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
   models `references/roles.md` `## Models` names. Without it there is no opposite-family reviewer
   for a Claude build, so the default workflow cannot run: report `MISSING` as a blocker. Recommend
   restoring Codex in T3, or an explicit change of workflow the user approves and the log records.
   Never move a Codex default to a Claude model on your own: same-family review breaks the
   hard rule that the reviewer is never the builder.
5. **Decision log**, `OK` or `MISSING`. `"${CLAUDE_PLUGIN_ROOT}/scripts/log.sh"` exists and is
   executable (`test -x`). Do not call it: a call writes a line.
6. **Secret scan**, `OK`, `MISSING`, `OUTDATED` or `BYPASSED`. Check `pre-push` in the `hooks`
   directory of `git rev-parse --git-common-dir`. If `git config core.hooksPath` prints a path,
   git ignores that hook: `BYPASSED` unless the `pre-push` under that path calls it; name the path
   and offer the one-line call `references/planning.md` `## 5. Scaffold, after sign-off` gives.
   `OK`: executable and byte-equal (`cmp`) to
   `"${CLAUDE_PLUGIN_ROOT}/scripts/scan-secrets.sh"`. `OUTDATED`: it has the
   `# bstack secret-scan pre-push` line, or the old `# deliver secret-scan pre-push` one, but
   differs; offer to refresh it with that copy.
   `MISSING`: absent, not executable, or another hook without either line (show it; never replace it
   unasked). Install it as `references/planning.md` `## 5. Scaffold, after sign-off` says.

7. **Merge guard**, `OK` or `OFF`. `OFF` when `BSTACK_NO_ENFORCE` is `1` in this session's
   environment (`printenv BSTACK_NO_ENFORCE`): story merges go unchecked. Only the user unsets it.
8. **Hygiene**, warnings only. Run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/hygiene.sh"` from the main
   checkout and quote every `WARN` line: `AGENTS.md` over 32 KiB, an integration branch too far or
   too long ahead of main, a tag missing from main, branches or worktrees of merged stories, PM
   scripts outside a tracked `ops/pm/`, a stale copy of `heavy.sh`. Each names its fix.

End with a one-line verdict: ready only when the host, toolchain, Codex, log, secret scan and
merge guard checks are `OK` and every gate is `PASS` or `N/A`. Otherwise name the blockers and
what each needs. Hygiene warnings never block; list them after the verdict.
