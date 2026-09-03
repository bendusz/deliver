# Contributing to pm-skill

Thanks for your interest! `pm-skill` is a generic, self-contained Claude Code plugin.

## Ground rules
- **Keep it generic.** Nothing under `plugins/pm-skill/` may depend on a specific third-party plugin
  or a particular environment. Name external tools only as optional examples in `README.md` / `docs/`.
- **Keep `SKILL.md` lean** (< 500 lines); put detail in `references/` (one level deep).
- **Reviewer / analyst agents stay read-only** (`Read, Grep, Glob`).

## Before opening a PR
- Run `bash scripts/validate.sh` (and `claude plugin validate ./plugins/pm-skill` if you have the CLI).
  Node.js 20 or newer is required to run the tests and the validator.
- If you change the sign-off hook, run `node --test plugins/pm-skill/scripts/tests/`.
- Update `CHANGELOG.md`.

## How it's built
The plugin was itself developed with a PM-orchestrated spec → plan → build → review flow. See
`docs/specs/` and `docs/plans/` for the design history.
