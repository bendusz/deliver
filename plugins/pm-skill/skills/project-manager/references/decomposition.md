# Decomposition

Break the approved plan into sprints and self-contained story files.

## Sprints
Group the plan's stories into sprints. Each sprint should deliver something independently valuable.
Foundations first; later sprints build on earlier ones.

## Story files
For each story, create `docs/stories/S<sprint>-<n>-<slug>.md` from
`${CLAUDE_PLUGIN_ROOT}/templates/story.md.template`. Each story states the goal, the boundaries, the
exact source files or symbols to inspect, and any inventory method needed to find the complete target
set. A builder should not need repo-wide discovery. `story.md.template` defines the sections and the
header. Three fields carry rules:
- **`pm-meta`:** the one-line JSON comment within the first 12 lines is the story's machine
  contract: `<!-- pm-meta: {"builder":"codex-builder","touches":["src/parser","tests/parser"]} -->`.
  The object has exactly `builder` and `touches`. `touches` names the files and directory roots this
  story will change, used for `[P]` safety and enforced by the Codex runner: unique repo-relative
  paths without globs, placeholders, `.`, or traversal. It is required, must be bounded, and must
  cover the implementation and test paths; a story whose scope you cannot name yet is not
  build-ready.
- **`builder`:** `expert-builder`, `codex-builder`, or `auto`. Prefer `expert-builder` for broad
  features, cross-cutting changes, architecture work, and stories that need wide repo context.
  Prefer `codex-builder` for one precise outcome with bounded `touches`, concrete evidence, and an
  exact verification command; such a story must not rest on an open design decision. Use `auto` only
  when the boundary cannot be known until the story starts; the implementation loop resolves it
  before dispatch and logs the choice.
- **Risk and review lenses:** the story's `Risk` (low, med, high) and the lenses it needs.
  `code-integrity-reviewer` always; add `architecture-reviewer` for structural change and
  `security-auditor` for security-sensitive work. The lens list is the story's sensitivity
  declaration, which lets `/pm-skill:analyze` check declared against actual. For a story that
  names `architecture-reviewer`, `design-exploration.md` owns the optional design pass that may
  precede build-ready.

## Ordering
- Record each story's `Depends on` and order so dependencies come first.
- Set `Parallel-safe: yes` on a story with no dependency on un-merged work, and record its
  `pm-meta.touches`. The plan table tags the same stories `[P]`. The PM uses `Parallel-safe` plus
  non-overlapping `pm-meta.touches` to build several stories at once in isolated worktrees; see
  `parallel-execution.md`. When unsure, set `Parallel-safe: no` and the story simply runs
  sequentially.

## Story readiness
Before dispatch, check the story against the requirements above. Fix any failure first. **Never**
dispatch the builder on an unready story.
`${CLAUDE_PLUGIN_ROOT}/templates/checklist-story-readiness.md.template` is the full checklist.

## Hand to the user
Show the sprint-to-story map, log it, then load `implementation-loop.md`. This is not a second
sign-off gate.
