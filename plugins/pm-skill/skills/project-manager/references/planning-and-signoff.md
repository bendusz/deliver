# Planning and sign-off

Turn the agreed direction into a written plan, get explicit human sign-off, then scaffold.

## 0. Analyze existing code (brownfield, optional)
If you are working in an existing codebase, dispatch `codebase-analyst` first. Fold its context pack
into the plan's Architecture and Commands sections, and keep it to embed into story files later. Skip
this for a greenfield project.

Greenfield or brownfield: if the plan hinges on an external unknown, a library choice or an
unfamiliar SDK, dispatch `researcher`, and `codex-researcher` alongside it for a consequential or
contested call when the codex CLI is installed. Then cite the `docs/research/` reports in the plan's
decisions.

Design exploration, optional: if a design-exploration skill is installed, for example
`poteto:architect`, which sketches types, signatures, and module boundaries across several competing
candidates before any code, run it for the plan's Architecture section on greenfield work and for any
decision with more than one viable shape. Design only: invoke it with a checkpoint
(`/poteto:architect with checkpoint`) and stop at the synthesized sketch. Its implementation phases
never run before sign-off, per hard rule 3, and the PM never runs them at all, because code is the
story builder's job. Fold the sketch and its rationale into Architecture and list the rejected
alternatives under Risks.

## 1. Write `docs/plan.md`
If `docs/spec.md` exists, the plan derives from it: turn its requirements into delivery work and
trace each story back to the spec's IDs. If there is no spec yet, run `/pm-skill:specify` first for
non-trivial work, or fold the intent straight into the plan for something small.

Initialise the state if it does not exist yet: `pm/pm-state.json`, the shared file, from
`${CLAUDE_PLUGIN_ROOT}/templates/pm-state.json.template` with `signed_off: false`, and your own
`pm/actors/<actor-id>.json` from `${CLAUDE_PLUGIN_ROOT}/templates/actor-state.json.template`, with
the actor id derived per `logging-and-state.md`. `pm/` is git-tracked, so create both directories and
verify the state files are not matched by `.gitignore`: `git check-ignore pm/pm-state.json pm/log.md
pm/actors/<actor-id>.json` must fail. Check the files, not the directory, since a `pm/*` rule ignores
the files while a directory check passes; fix the rule if anything matches. Append
`pm/log.md merge=union` to `.gitattributes`, creating it if it is missing and without clobbering
other rules, so concurrent log appends merge cleanly. **Commit** `pm/` and `.gitattributes` from the
first state write onward, per `logging-and-state.md`, and never write secrets into `pm/`. Then create
`docs/plan.md` with these sections:
- **Overview.** What and why, in 2 to 3 sentences.
- **Source spec.** Link `docs/spec.md`, or note "none, intent captured inline".
- **Delivery mode.** The scale (`tiny` to `regulated`, see `scale-profiles.md`), the checkpoint
  policy, the autonomy level, and `Instruction rules: none | pm-state`.
- **Goals** and **Target users**.
- **Scope.** In and Out, being explicit about what you are *not* doing.
- **Stories.** A table:
  `| id | title | priority | covers | acceptance criteria | depends-on | [P] |`. Acceptance criteria
  must be testable, and `covers` lists the spec IDs (`FR-` and `AC-`) each story satisfies.
- **Architecture.** Stack, key decisions, patterns.
- **Traceability.** Every spec requirement maps to at least one story; flag any that do not.
- **Non-functional requirements.** Performance, security, and the like.
- **Commands.** The project's real `test`, `lint`, `build`, and `run` commands. If one does not
  exist, write `N/A`, which you will honour in the gates later. Discover these now.
- **Risks** and any open questions.
- **Clarifications.** Must be empty before sign-off, here and in `docs/spec.md`.
- **Sign-off.** A line to be filled: `Approved by <name> on YYYY-MM-DD`.

Present it and iterate with the user until they are happy. For a larger project, run
`/pm-skill:analyze` before decomposition, optionally on the drafted plan before you record sign-off,
for a read-only consistency and coverage check; the Stories table carries the `covers` mapping.
Resolve any CRITICAL or HIGH findings first.

## 2. Sign-off gate
Sign-off requires all three: no blocking `[NEEDS CLARIFICATION]` in `docs/spec.md` or the plan,
`docs/plan.md` present, and an unambiguous human "approved". Record the approver and date in the
plan's Sign-off line and in `pm/log.md`, and set `signed_off: true`, with `approver` and
`approved_date`, in `pm/pm-state.json`. **Do not** decompose or write any code before this. The
bundled sign-off hook enforces it by blocking implementation writes while `signed_off` is `false`,
but it is fail-open and can be disabled, so holding the line is still your responsibility.

## 3. Scaffold (only after sign-off), observing Repository safety
- If the project is not a git repo, offer to `git init`, and **ask** first.
- Generate the project instructions file `AGENTS.md` from
  `${CLAUDE_PLUGIN_ROOT}/templates/AGENTS.md.template`, facts only: commands, layout, non-default
  conventions, gotchas, per `instruction-layers.md`. Then generate `CLAUDE.md` from
  `${CLAUDE_PLUGIN_ROOT}/templates/CLAUDE.md.template`, a two-line `@AGENTS.md` bridge. **Never**
  overwrite an existing file. If `CLAUDE.md` exists without `AGENTS.md`, propose the migration in
  `instruction-layers.md`, show the diff, and ask. If both files exist and `CLAUDE.md` is
  not an `@AGENTS.md` bridge, leave both and log a WARN; `/pm-skill:doctor` reports it. When the
  plan's Delivery mode says `Instruction rules: pm-state`, also write `.claude/rules/pm-state.md`
  from `rules-pm-state.md.template` and `pm/AGENTS.md` from `pm-AGENTS.md.template`.
- Ensure `.gitignore` includes `tmp/`, appending rather than clobbering an existing `.gitignore`.
  `tmp/` is ephemeral scratch and never enters git. The tracked `pm/` state files must **not** be
  ignored, and `.gitattributes` must carry `pm/log.md merge=union`.
- **Commit** only the files you created or changed. No `git add -A` over the user's other work.
- If git has no `user.name` or `user.email`, ask before committing.
- The branch the scaffold commit lands on, `main` by default, is the integration branch: the base you
  cut every story branch from and merge each story back into.

Log the scaffold step. Then load `decomposition.md`.

## Checkpoint policy (recorded in Delivery mode, applied during the loop)
- Default sprint-level: run all the sprint's stories, then pause for the user's review at the sprint
  boundary. A project may set story-level, pausing before each merge, or fully autonomous.
- Whatever the mode, **escalate** immediately before a high-risk merge or one that changes several
  dependent components.
- Offer `/pm-skill:handoff` at natural stops: a sprint checkpoint, a long pause, or a session whose
  context is running long. A committed `pm/actors/<id>.HANDOFF.md` is what lets the next session skip
  re-discovery, and the bundled SessionStart hook re-grounds new and compacted sessions from `pm/`.
- Checkpoint before compaction. When compaction is imminent, write and commit the actor handoff
  first. After resume, check its base commit, branch, changed paths, last gate results, and next
  action against repository state before dispatching another writer.
