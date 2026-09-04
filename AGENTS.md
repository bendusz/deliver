# deliver

A Claude Code plugin marketplace: `plugins/deliver` (the Project Manager skill, agents, hooks,
Codex runner) and `plugins/poteto` (Lauren Tan's pstack skills, MIT).

## Commands
- Test: `bash scripts/validate.sh` runs the whole suite. `node --test
  plugins/deliver/scripts/tests/` is for focused test work.
- Lint: `bash scripts/validate.sh` (needs bash, jq, node 20+, git; shellcheck in CI)
- Build: `N/A`
- Run: `N/A` (install the marketplace into Claude Code to try it)

## Layout
- `plugins/deliver/skills/project-manager/`: `SKILL.md` plus one reference per phase.
- `plugins/deliver/agents/`, `commands/`, `templates/`, `schemas/`: the orchestrated fleet and its artifacts.
- `plugins/deliver/hooks/`: fail-open guardrails. `plugins/deliver/scripts/codex/`: the Codex
  runner. `plugins/deliver/scripts/tests/`: node:test suites.
- `docs/specs/`, `docs/plans/`: this repo's own design history, named `YYYY-MM-DD-vX.Y-topic.md`.

## Conventions
- Runtime code is Node ESM only (`hooks/*.mjs`, `scripts/codex/**`). No bash or jq at runtime;
  `scripts/validate.sh` is the maintainer-only exception.
- Agent frontmatter pins `model` and `effort`; Opus roles use `claude-opus-5`, never the moving alias.
- Every change to a reference or template must keep `bash scripts/validate.sh` green.

## Gotchas
- `plugin.json` version must equal the top CHANGELOG heading (validate check 11).
- The actor-id salt in `hooks/lib.mjs` keeps the plugin's pre-0.21 name on purpose and must never
  change; it keys every existing `pm/actors/` file. The line carries a comment saying so.
- `.gitattributes` pins LF for `*.mjs` and `*.sh`; Windows checkouts rely on it.
