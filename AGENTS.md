# deliver

A Claude Code plugin marketplace: `plugins/deliver` (the T3-first project manager skill) and
`plugins/poteto` (Lauren Tan's pstack skills, MIT). The plugin is prose and templates plus one
script, `log.sh`.

## Commands
- Test: `N/A`
- Lint: `N/A`
- Build: `N/A`
- Run: install the marketplace into Claude Code under T3 Code.

## Layout
- `plugins/deliver/skills/project-manager/`: `SKILL.md` plus seven `references/` (planning, loop,
  roles, host, state, retro, skeleton).
- `plugins/deliver/commands/`: pm, resume, doctor, retro, codex, skeleton.
- `plugins/deliver/templates/`: the artifacts the PM creates in a project.
- `plugins/deliver/scripts/log.sh`: appends a timestamped line to a project's `docs/log.md`.
- `plugins/poteto/`: the ported pstack skills, with their LICENSE and attribution.
- `docs/specs/`, `docs/plans/`: this repo's design (`YYYY-MM-DD-vX.Y-topic.md`).
  `docs/research/`: research reports. `docs/prior-art.md`: what the design draws on.

## Conventions
There is no automated validation. A reviewer checks these by hand on every change:
- `plugin.json` version equals the top CHANGELOG heading.
- `SKILL.md` stays under 16,000 characters, leaving headroom under Claude Code's
  20,000-character re-attachment cut after compaction.
- Every `references/*.md` that `SKILL.md` names, and every template a reference or command
  names, exists.
- The model ids in `roles.md` exist in `orchestrator_capabilities`, and the Opus roles use
  `claude-opus-5-5`, never a moving alias.
- poteto keeps its MIT LICENSE and attribution.
- `log.sh` stays the only code in the plugin, and stays executable with LF line endings.
- New CHANGELOG entries go on top; everything below stays as written.

## Gotchas
- `plugin.json` version must equal the top CHANGELOG heading.
- `.gitattributes` pins `*.sh` to LF for `log.sh`; Windows checkouts rely on it.
