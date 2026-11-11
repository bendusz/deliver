# Contributing to bstack

bstack is prose and templates plus two scripts in `plugins/bstack/scripts/`, `log.sh` and
`scan-secrets.sh`. A contribution is almost always a prose change: a reference, a skill, a
role's soul or a template.

## Ground rules
- **Keep `SKILL.md` lean.** Detail goes in `references/`, one level deep, each loaded only when the
  moment needs it.
- **Trust the agents.** Roles are souls with ground rules and a recommended model, not tool
  restrictions. Review independence is a process rule: the reviewer is never the builder.
- **No new code.** `log.sh` and `scan-secrets.sh` stay the only code in the plugin. Prefer what
  T3 Code and git already give over new machinery.

## Before opening a PR
- Run `bash .github/scripts/check.sh`. It enforces the Conventions in [`AGENTS.md`](AGENTS.md),
  lints the scripts when `shellcheck` is installed and runs their tests. CI runs the same script.
- Ask for a review, and expect the reviewer to check the by-hand items in that list.
- Update `CHANGELOG.md`, with the new entry on top.

## When T3 Code changes
`references/host.md` describes T3 behaviour that bstack observed, not a published contract. After
a T3 update that touches delegation or worktrees, check these again with throwaway children and
update `host.md`, the README's "last checked" line and `check.sh`'s model list:
- `orchestrator_capabilities` still lists the provider ids, model ids and option names the
  defaults use.
- A `delegate_task` child with `isolation: "worktree"` starts from the parent's HEAD commit, at
  `~/.t3/worktrees/<project>/t3-<id>` on a `t3/<slug>` branch, and its result carries neither.
- T3 still leaves the worktree and that branch behind when the child finishes.
- `t3_thread_send` to a finished child starts a new run with its context intact.
- A reused `clientRequestId` returns the original child, and the original send.
- A Claude child still sees the bstack skills, so every soul's first line still matters.

## How it is built
The plugin was itself developed with a PM-orchestrated spec, plan, build and review flow. See
`docs/specs/` and `docs/plans/` for the current design; earlier history is in git.
