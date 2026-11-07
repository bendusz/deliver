# Planning: from request to build-ready stories

Enter with a request. Leave with a signed-off `docs/plan.md`, the scaffold committed, and
build-ready story files for the next sprint. Size it to the work: a one-story fix needs a short
plan, no spec and no sprints. Nothing is built before sign-off.

## 1. Ground
- Not a git repository: offer `git init`, and ask first. Git is the record, so planning needs it.
- Create `docs/approval.json` as `pending` per `state.md` `## Approval`; commit it with the first draft.
- Brownfield work: run one native Explore pass for the architecture, the conventions, the real
  test, lint and build commands, and where new code should go. Fold the answers into the plan's
  Architecture and Commands, and keep them for the stories' Context.
- Dispatch a researcher (`roles.md` `## researcher`, via `host.md` `## Dispatch`) only when an
  external unknown decides the plan: a library choice, an unfamiliar SDK. Add the Codex second
  opinion its **Default** names for a consequential or contested call. Cite the
  `docs/research/` report in the plan's decision.

## 2. Converge
- Talk with the user and build on their answers. Ask one question at a time; do not interrogate.
- When a decision has real options, give 2 or 3 with trade-offs and your recommendation, and why.
- Cover purpose and value, must-haves against nice-to-haves, the constraints of tech, time and
  audience, and how you will know it worked.
- Write every unknown inline as `[NEEDS CLARIFICATION: <question>]`, never a guess. Ambiguity
  carried into a build is the most common cause of a wrong one.
- Resolve the markers one question at a time, at most 5 in a session, spent on what most changes
  the build: the question, 2 or 3 options, a recommendation, one line on why it matters. After
  each answer, record the decision where it belongs and in Clarifications, and delete the marker.
- When Architecture has more than one viable shape and poteto is installed, ask the user to run
  `/poteto:architect with checkpoint` (it is user-invoked). Fold the sketch and its rationale into
  Architecture, and list the rejected alternatives under Risks.

## 3. Write the plan
- Create `docs/plan.md` from `${CLAUDE_PLUGIN_ROOT}/templates/plan.md.template`, replacing its comments.
- Requirements carry stable IDs, `FR-n` and `AC-n`, and are never renumbered: the stories, the
  reviewer and the verifier trace to them.
- Acceptance criteria use EARS where behavioural (`WHEN <condition or event>, THE SYSTEM SHALL
  <observable behaviour>`), else a plain measurable statement. Sharper criteria test better.
- Commands are the project's real `test`, `lint`, `build` and `run`, discovered now, with `N/A`
  where one does not exist. They are the gates you run yourself.
- `Integration branch:` is the branch the scaffold commit lands on, `main` by default.
- `Skeleton:` stays `none` unless the user opts into SpecDD; then `specdd` (`skeleton.md`).
- The Stories table's `covers` column names the IDs each story satisfies. Traceability maps every
  `FR-` and `AC-` to at least one story and flags any that has none.
- Plan the app-driving check. When the product is something a person or a client drives (a UI, a
  CLI session, an HTTP service) and a criterion can only be shown by running it, add a sprint-1
  story that creates that check, ordered straight after the first slice that makes the app start.
  It is a `verify-<app>` skill under `.claude/skills/` (with poteto installed, ask the user to run
  `/poteto:create-verification-skill` for it) or the project's own end-to-end command. Without
  it, the verifier returns UNKNOWN for every such criterion.
- Write a separate `docs/spec.md` from `${CLAUDE_PLUGIN_ROOT}/templates/spec.md.template` only
  when the work will outlive this plan. The spec is product intent (user stories, requirements,
  criteria), with no stack and no how; the plan derives from it and traces to its IDs. Update an
  existing spec in place, never blind-overwrite it.
- Present the plan and iterate with the user until they are happy.

## 4. Sign-off
- Sign-off needs all three: no `[NEEDS CLARIFICATION]` left in the plan or spec (a non-blocking
  unknown may be carried as an explicit assumption or risk, agreed with the user), the plan
  committed, and an unambiguous "approved" from the user in the conversation.
- Then fill the plan's Sign-off line with the date and commit the plan: that commit is the
  `plan_commit`. Write and commit the approved record exactly as `state.md` `## Approval` says.
- Log the sign-off with its scope, and every decision you made without asking, with the why:
  `bash "${CLAUDE_PLUGIN_ROOT}/scripts/log.sh" "<message>"` (`state.md` `## Log`).
- No scaffold, no stories and no code before the record says `approved`.

### Change after sign-off
Scope is frozen once a story starts. A new requirement, a direction change or an assumption
found wrong goes through this path, never drip-fed into a running story:
1. **Stop.** Dispatch nothing new. Let running children finish, or `t3_thread_send` a builder to
   stop and commit what it has on its branch. Log the trigger and why.
2. **Classify,** and apply the change at the highest level it touches, then let it flow down:
   - Spec-level, product intent changed: update `docs/spec.md`, then re-derive the plan and stories.
   - Plan-level, scope, architecture, stories or priorities: update the plan's Scope, Stories
     table and Traceability, and every affected story file.
   - Story-level, a criteria tweak inside the agreed scope: update just the story file.
3. **Re-approve if material.** Scope added or removed, architecture changed or requirements
   altered is material; when unsure, treat it as material. Follow `state.md` `## Approval`: show
   `git diff <plan_commit> -- docs/plan.md`, ask again, and write a new record only on a new
   approval. A story-level tweak needs no re-approval; log it.
4. **Replace, never restart.** Edit a story never dispatched in place. A dispatched story keeps
   its `clientRequestId`s (`host.md` `## Dispatch`), so a rerun would return its old children.
   Instead set its `pm-exec` `status` to `blocked`, add a `Replaced by: <new id>` line, and keep
   its history, branch and worktree. Write the revised story under the next free `S<sprint>-<n>`
   with `Replaces: <old id>` under its header, move its plan row and Traceability there, and
   claim and run it from scratch; no earlier `verifier` result counts for it. Log both ids and why.
   Unaffected stories keep their Execution blocks.
5. **Commit** the `docs/` changes together, saying what changed, at which level, and whether
   re-approval happened.

## 5. Scaffold, after sign-off
Only add what is absent. Never overwrite a user-authored file without showing a diff and asking.
- `AGENTS.md` from `${CLAUDE_PLUGIN_ROOT}/templates/AGENTS.md.template`: facts only (commands,
  layout, non-default conventions, gotchas), aiming at 30 to 40 lines. Replace every template
  comment rather than copying it, since Codex reads a comment as an instruction. Every child
  loads this file, so test each line: would removing it cause mistakes? Never copy procedure or
  hard rules into it, nor a line saying the project runs on deliver.
- `CLAUDE.md` from `${CLAUDE_PLUGIN_ROOT}/templates/CLAUDE.md.template`, the `@AGENTS.md` bridge.
  If `CLAUDE.md` exists without `AGENTS.md`, propose moving its content into a new `AGENTS.md`
  and making `CLAUDE.md` the bridge; show the diff and ask. If both exist and `CLAUDE.md` is not
  a bridge, leave both and tell the user.
- With `Skeleton: specdd`, add the SpecDD line held in the `AGENTS.md.template` comment,
  uncommented, to the project `AGENTS.md` Conventions.
- `.gitignore` includes `tmp/`, appended, never clobbered. `tmp/` is scratch and never enters git.
- The pre-push secret scan, untracked, for every worktree: `pre-push` in the `hooks` directory of
  `git rev-parse --git-common-dir`. If `git config core.hooksPath` prints a path, git ignores
  that directory: report it, ask the user how to wire the scan in, change nothing. Absent: copy
  `${CLAUDE_PLUGIN_ROOT}/scripts/scan-secrets.sh` there and `chmod 755` it (a copy: the plugin
  path changes on update). Present without its `# deliver secret-scan pre-push` line: show it, ask.
- Commit on the integration branch only the files you created or changed, never `git add -A`.
  If git has no `user.name` or `user.email`, ask before committing.

## 6. Decompose
With `Skeleton: specdd`, run `skeleton.md` for the sprint first. Decompose one sprint at a time,
before its first claim.
- **Sprints.** Each delivers something valuable on its own; later sprints build on earlier ones.
- **Slices.** Each story is a thin vertical slice: one behaviour through every layer it needs
  (interface, logic, storage, test), shown working by its own verification command. Fold a
  horizontal story ("add the schema", "write the API client") into the first story that needs
  it. A sprint's first story is the thinnest path end to end; the rest widen it.
- **Breaking changes.** A signature, schema or interface with many callers is three stories that
  each leave the gates green: **expand** adds the new shape beside the old, **migrate** moves the
  callers (in `[P]` batches where `touches` allow), **contract** deletes the old shape.
- **Story files.** `docs/stories/S<sprint>-<n>-<slug>.md` from
  `${CLAUDE_PLUGIN_ROOT}/templates/story.md.template`. The child sees only the story, so it must
  stand alone: the goal, the boundaries, the exact files and symbols to inspect, and the search
  that finds a complete target set when one matters. Do not restate `AGENTS.md`.
- **pm-meta.** `builder` is `claude`, `codex` or `auto`. `codex` suits one precise outcome with
  bounded `touches`, concrete evidence and an exact verification command, resting on no open
  design decision. `claude` suits broad, cross-cutting or architecture work, or work that needs
  wide repo context. `auto` means you pick at claim per `roles.md` `## builder` **Default**
  (bounded → Codex, broad → Claude) and record it in `pm-exec.role_model`.
- **touches.** The files and directory roots the story will change, implementation and tests:
  unique repo-relative paths with no globs, placeholders, `.` or `..`. Required and bounded; a
  story whose scope you cannot name yet is not build-ready.
- **Review focus.** `none` by default. `design` for structural change or a new abstraction,
  `security` for auth, secrets, crypto, untrusted input or dependency changes, `performance` for
  a hot path or large data. It becomes the reviewer's `focus:` line (`roles.md` `## reviewer`).
- **Criteria and verification.** Every criterion is testable and cites the `AC-` it covers; the
  header's `Covers` lists them. The verification command proves the story done.
- **Ordering.** Record `Depends on` and order dependencies first. `Parallel-safe: yes` only for a
  story with no dependency on unmerged work; the plan's table tags it `[P]`. When unsure, `no`.
- **Execution.** Never written at decomposition. The claim adds it (`state.md` `## Execution block`).
- **Ready.** Never dispatch a builder on a story that misses any of the above; fix it first.

## 7. Self-check, inline
Before handing over, check and fix:
- Every `FR-` and `AC-` is covered by a story, Traceability agrees, and every `Covers` ID exists.
- `Depends on` has no cycles, and no story depends on a later sprint.
- No two `Parallel-safe` stories in a sprint overlap in `touches`: neither path equals, or sits
  under, the other's.

Show the user the sprint-to-story map, commit the stories with `docs/log.md` staged (not a
second sign-off), then load `loop.md`.

<!-- Slice shape and expand, migrate, contract are adapted from Matt Pocock's skills (mattpocock/skills, MIT). -->
