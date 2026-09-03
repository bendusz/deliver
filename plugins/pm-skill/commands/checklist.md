---
description: Generate (and optionally evaluate) a quality checklist under docs/checklists/ from the bundled templates.
---

Use the `project-manager` skill to generate a quality checklist.

Target: $ARGUMENTS  (one of: `spec` · `plan` · `story <id>` · `verification <id>`)

Do this:
- Pick the matching template from `${CLAUDE_PLUGIN_ROOT}/templates/` and write under `docs/checklists/`:
  - `spec` → `checklist-spec-quality.md.template` → `docs/checklists/spec-quality.md`
  - `plan` → `checklist-plan-quality.md.template` → `docs/checklists/plan-quality.md`
  - `story <id>` → `checklist-story-readiness.md.template` → `docs/checklists/story-readiness-<id>.md`
  - `verification <id>` → `checklist-verification-quality.md.template` → `docs/checklists/verification-<id>.md`
- If the target file already exists, update it in place. Never blind-overwrite; show a diff.
- You **may** evaluate each item against the real artifact (`docs/spec.md`, `docs/plan.md`,
  `docs/stories/<id>*.md`, the diff/gate evidence) and tick `[x]` **only with evidence**. Never mark an
  item complete without checking the artifact; leave unverifiable items unchecked and note why.
- Append a one-line entry to `pm/log.md`.

If no target is given, list the four checklist types and ask which to generate. Checklists are an
optional quality aid and do not replace `/pm-skill:analyze` or the review and verification gates.
