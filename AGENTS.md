# pm-skill

A Claude Code plugin marketplace: `plugins/pm-skill` (the Project Manager skill, agents, hooks,
Codex runner) and `plugins/poteto` (Lauren Tan's pstack skills, MIT).

## Commands
- Test: `node --test plugins/pm-skill/scripts/tests/`
- Lint: `bash scripts/validate.sh` (needs bash, jq, node 20+, git; shellcheck in CI)
- Build: `N/A`
- Run: `N/A` (install the marketplace into Claude Code to try it)

## Working here
- Runtime code is Node ESM only (`hooks/*.mjs`, `scripts/codex/**`). No bash or jq at runtime;
  `scripts/validate.sh` is the maintainer-only exception.
- Never push to a remote without an explicit request.

## Layout
- `plugins/pm-skill/skills/project-manager/` — `SKILL.md` plus one reference per phase.
- `plugins/pm-skill/agents/`, `commands/`, `templates/`, `schemas/` — the orchestrated fleet and its artifacts.
- `plugins/pm-skill/hooks/` — fail-open guardrails; `scripts/codex/` — the Codex runner; `scripts/tests/` — node:test suites.
- `docs/specs/`, `docs/plans/` — this repo's own design history (`YYYY-MM-DD-vX.Y-topic.md`).

## Conventions
- Agent frontmatter pins `model` and `effort`; Opus roles use `claude-opus-5`, never the moving alias.
- Every change to a reference or template must keep `bash scripts/validate.sh` green.

## Gotchas
- `plugin.json` version must equal the top CHANGELOG heading (validate check 11).
- The actor-id salt `:pm-skill` in `hooks/lib.mjs` must never change; it keys existing `pm/actors/` files.
- `.gitattributes` pins LF for `*.mjs` and `*.sh`; Windows checkouts rely on it.
