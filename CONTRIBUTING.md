# Contributing to pm-skill

`pm-skill` is a generic, self-contained Claude Code plugin. It must keep working on a bare install,
so the rules below are about what you may not add.

## Ground rules
- **Keep it generic.** Nothing under `plugins/pm-skill/` may depend on a specific third-party plugin
  or a particular environment. Name external tools only as optional examples in `README.md` and
  `docs/`.
- **Keep `SKILL.md` lean**, under 500 lines, and put detail in `references/`, one level deep.
- **Five agents stay read-only** on `Read, Grep, Glob`: `code-integrity-reviewer`,
  `architecture-reviewer`, `security-auditor`, `debugger`, and `codebase-analyst`. `pm-verifier`
  also has `Bash`, because it must run the gates, and the Codex wrappers have `Bash` to call the
  bundled runner.

## Before opening a PR
- Run `bash scripts/validate.sh`, and `claude plugin validate ./plugins/pm-skill` if you have the
  CLI. Node.js 20 or newer is required to run the tests and the validator.
- Run `node --test plugins/pm-skill/scripts/tests/`. Validate runs the hook and library subset of
  it, so run the whole suite yourself.
- Update `CHANGELOG.md`.

## How it is built
The plugin was itself developed with a PM-orchestrated spec, plan, build, review flow. See
`docs/specs/` and `docs/plans/` for the design history.
