# Contributing to bstack

bstack is prose and templates plus two scripts in `plugins/bstack/scripts/`, `log.sh` and
`scan-secrets.sh`. A contribution is almost always a prose change: a reference, a command, a
role's soul or a template.

## Ground rules
- **Keep `SKILL.md` lean.** Detail goes in `references/`, one level deep, each loaded only when the
  moment needs it.
- **Trust the agents.** Roles are souls with ground rules and a recommended model, not tool
  restrictions. Review independence is a process rule: the reviewer is never the builder.
- **No new code.** `log.sh` and `scan-secrets.sh` stay the only code in the plugin. Prefer what
  T3 Code and git already give over new machinery.

## Before opening a PR
- Check the change against the Conventions in [`AGENTS.md`](AGENTS.md): there is no automated
  validation, so those checks are done by hand.
- Ask for a review, and expect the reviewer to check the same list.
- Update `CHANGELOG.md`, with the new entry on top.

## How it is built
The plugin was itself developed with a PM-orchestrated spec, plan, build and review flow. See
`docs/specs/` and `docs/plans/` for the current design; earlier history is in git.
