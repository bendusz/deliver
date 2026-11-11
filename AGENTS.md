# bstack

A Claude Code plugin marketplace: `plugins/bstack` (the T3-first project manager skill) and
`plugins/poteto` (Lauren Tan's pstack skills, MIT). The plugin is prose and templates plus two
scripts, `log.sh` and `scan-secrets.sh`.

## Commands
- Test: `bash .github/scripts/check.sh` (conventions, shellcheck when installed, script tests)
- Lint: `N/A`
- Build: `N/A`
- Run: install the marketplace into Claude Code under T3 Code.

## Layout
- `plugins/bstack/skills/project-manager/`: `SKILL.md` plus seven `references/` (planning, loop,
  roles, host, state, retro, skeleton).
- `plugins/bstack/skills/<name>/SKILL.md`: the entry-point skills pm, resume, doctor, retro, codex,
  skeleton and board, invoked as `/bstack:<name>`. `board` carries its own member soul.
- `plugins/bstack/templates/`: the artifacts the PM creates in a project.
- `plugins/bstack/scripts/log.sh`: appends a timestamped line to a project's `docs/log.md`.
- `plugins/bstack/scripts/scan-secrets.sh`: blocks token formats in added lines; the project's
  pre-push hook and the PM's merge-time check.
- `plugins/poteto/`: the ported pstack skills, with their LICENSE and attribution.
- `.github/scripts/check.sh`: the convention checks below; it runs `test-scripts.sh`, the
  regression tests for the two plugin scripts. CI runs it on Linux and macOS.
- `docs/specs/`, `docs/plans/`: this repo's design (`YYYY-MM-DD-vX.Y-topic.md`).
  `docs/research/`: research reports. `docs/prior-art.md`: what the design draws on.

## Conventions
`check.sh` enforces these; run it before every commit:
- `plugin.json` version equals the top CHANGELOG heading.
- Every bstack `SKILL.md` stays under 16,000 characters, leaving headroom under Claude Code's
  20,000-character re-attachment cut after compaction.
- Every `references/*.md` and every template a skill or reference names exists.
- Entry points are skills under `skills/<name>/SKILL.md`, each with `name` equal to its
  directory and a `description`. The plugin has no legacy `commands` directory.
- `${CLAUDE_PLUGIN_ROOT}` appears only in a `SKILL.md` body, the one place Claude Code
  substitutes it. References and templates write `<plugin>`, which every skill defines.
- Every model id in the plugin and the README is in `check.sh`'s pinned list: full ids such as
  `claude-opus-5-5`, never a moving alias.
- `log.sh` and `scan-secrets.sh` are the only code in the plugin, both executable with LF line
  endings. Maintainer scripts live under `.github/scripts/`.
- poteto keeps its MIT LICENSE and attribution, and `PORT.md` states its skill count.

A reviewer still checks these by hand:
- A model id added to the pinned list exists in `orchestrator_capabilities`.
- New CHANGELOG entries go on top; everything below stays as written.
- A change to `scan-secrets.sh` comes with a case in `test-scripts.sh`.

## Gotchas
- `plugin.json` version must equal the top CHANGELOG heading.
- `${CLAUDE_PLUGIN_ROOT}` is not a shell variable and is not substituted in files Claude reads
  with a tool, so a reference that used it would hand the PM a broken path.
- `test-scripts.sh` builds its fake tokens at run time. A token-shaped literal anywhere in this
  repository would trip the scan it tests.
- `.gitattributes` pins `*.sh` to LF for `log.sh` and `scan-secrets.sh`; Windows checkouts rely on it.
