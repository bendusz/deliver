# Decomposition

Break the approved plan into sprints and self-contained story files.

## Sprints
Group the plan's stories into sprints. Each sprint should deliver something independently valuable.
Foundations first; later sprints build on earlier ones.

## Story files
For each story, create `docs/stories/S<sprint>-<n>-<slug>.md` holding everything a builder needs
without reading the rest of the repo:
- **Goal**, one paragraph.
- **Covers:** the spec requirement IDs (`FR-` and `AC-`) this story satisfies, the traceability link
  back to `docs/spec.md`.
- **Context (self-contained):** the architecture, files, interfaces, and conventions relevant to this
  story, summarised here so the worker's context stays small and focused. Name the canonical source
  files or symbols the worker must read. When completeness matters, include the exact search or
  inventory method that establishes the full target set.
- **Acceptance criteria**, as testable checkboxes.
- **Out of scope.**
- **Touches:** the files and modules this story will change, used for `[P]` safety. Touches is
  required and must be bounded; a story whose scope you cannot name yet is not build-ready. Also put
  the authoritative scope in a one-line JSON comment within the first 12 lines:
  `<!-- pm-meta: {"builder":"codex-builder","touches":["src/parser","tests/parser"]} -->`. The object
  has exactly `builder` and `touches`. Paths are unique repo-relative files or directory roots
  without globs, placeholders, `.`, or traversal. The visible Builder and Touches stay as the
  human-readable view and must agree with `pm-meta`. The Codex runner enforces `pm-meta.touches`.
- **Builder:** `expert-builder`, `codex-builder`, or `auto`. Prefer `expert-builder` for broad
  features, cross-cutting changes, architecture work, and stories that need wide repo context. Prefer
  `codex-builder` for one precise outcome with bounded Touches, concrete evidence, and an exact
  verification command. Use `auto` only when the boundary cannot be known until the story starts; the
  implementation loop resolves it before dispatch and logs the choice.
- **Risk and review lenses:** the story's `Risk` (low, med, high) and the review lenses it needs.
  `code-integrity-reviewer` always; add `architecture-reviewer` for structural change and
  `security-auditor` for security-sensitive work. Declaring these, along with `Security-sensitive`
  and `Architecture-sensitive`, lets `/pm-skill:analyze` check declared against actual instead of
  guessing. For an `Architecture-sensitive` story, when a design-exploration skill is installed such
  as `poteto:architect`, you may run it before marking the story build-ready. Run it with a
  checkpoint (`/poteto:architect with checkpoint`), stop at the synthesized sketch, never run its
  implementation phases, and put the type and module sketch into the story's Context so the builder
  implements against a settled shape.
- **Verification:** the exact commands that prove the story is done.

Use `${CLAUDE_PLUGIN_ROOT}/templates/story.md.template` as the shape.

## Ordering
- Record each story's `depends-on` and order so dependencies come first.
- Tag stories with no dependency on un-merged work `[P]`, meaning parallel-safe, and record each
  story's Touches. The PM uses `[P]` plus non-overlapping Touches to build several stories at once in
  isolated worktrees; see `parallel-execution.md`. When unsure, leave a story un-`[P]` and it simply
  runs sequentially.

## Story readiness
A story may be handed to the builder only once it passes this check:
- testable acceptance criteria are present, not vague;
- requirement traceability: `Covers:` names the spec IDs (`FR-` and `AC-`) it satisfies, where a spec
  exists;
- the self-contained context a cold worker needs is present, with no "go read the repo";
- the Context names the current authoritative sources and, for completeness-sensitive work, an exact
  inventory method;
- a concrete verification command is given;
- a valid Builder is named, valid `pm-meta` agrees with the visible fields, and `codex-builder`
  stories have bounded `pm-meta.touches` covering implementation and test paths and do not rely on
  open-ended design decisions.

If a story fails the check, fix the story first. **Never** dispatch the builder on an unready story.
`${CLAUDE_PLUGIN_ROOT}/templates/checklist-story-readiness.md.template` is the full checklist.

## Hand to the user
Show the sprint and story map so the user can see the shape. This is visible but not a hard gate,
since sign-off already covered the plan. Log it, then load `implementation-loop.md`.
