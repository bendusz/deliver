# Logging and state

Keep just enough state on disk that a lost session can resume with zero memory, and so that several
people can run PM sessions on the same repo without overwriting each other. Solo is a team of one:
the layout is identical.

## The layout: shared core, per-actor files, `tmp/` as scratch

```
pm/
  pm-state.json            # SHARED project state (see schema below)
  log.md                   # SHARED logbook, append-only, author-prefixed
  actors/
    <actor-id>.json        # YOUR working position
    <actor-id>.HANDOFF.md  # YOUR handoff briefing
.gitattributes             # carries: pm/log.md merge=union
tmp/                       # gitignored, disposable, never load-bearing for resume
```

- `pm/` (git-tracked, committed) holds the durable state. Losing the checkout must not lose it, so it
  lives in git and travels with every clone and push. When you create the state files, confirm
  `git check-ignore pm/pm-state.json pm/log.md pm/actors/<actor-id>.json` fails.
- `tmp/` (gitignored, disposable) holds everything ephemeral: scratch, prompts, raw subagent output,
  diffs, CI dumps, `tmp/environment-check.md`, `tmp/worktrees/`. Nothing in `tmp/` may be
  load-bearing for resume.
- **Never** edit another actor's files. You write your own `pm/actors/<you>.json` and
  `<you>.HANDOFF.md` only, and the bundled `actor-guard.mjs` hook blocks accidents. Everyone writes
  the shared files, but only at the coordination moments below.

**Commit** `pm/` with the work it describes. Include state updates in the ship and log commit for
each story, and in the sign-off, claim, and sprint-boundary commits, so the pushed repo always
carries the current resume point.

**Never** write secrets or credentials into any state file, because `pm/` is tracked. Reference
secret *locations* ("`.env` on the box"), never values. The bundled `pm-secrets-guard.mjs` hook is a
mechanical backstop for high-confidence token shapes; the rule is yours to hold.

## Actor identity (derived, never configured)

Your actor id comes from git `user.email`, or from `user.name` when no email is set. Derive it with
the `actor-id` command in `hooks/lib.mjs`
(hooks import it; commands run `node "${CLAUDE_PLUGIN_ROOT}/hooks/lib.mjs" actor-id .`); never
construct it by hand. Changing git identity mid-project creates a second actor file, which
`/pm-skill:doctor` flags. Without any identity the command exits non-zero, so set
`git config user.email` before claiming a story. The session hook shows `unknown-actor` for that
case.

If an actor file from an older layout shows up as an orphan, see `migrations.md`.

## `pm/pm-state.json` (shared, changes only at coordination moments)

Fields: `project`, `spec`, `constitution`, `scale`, `phase`, `signed_off` (bool), `approver`,
`approved_date`, `integration_branch`, `current_sprint`/`total_sprints`, `last_analysis_status`,
`assignments`, `updated`. Create it from
`${CLAUDE_PLUGIN_ROOT}/templates/pm-state.json.template`.

- `assignments` maps story id to actor id for active claims only. History lives in the log and the
  story files.
- `signed_off` is load-bearing and global. While it is `false`, the `require-signoff.mjs` hook blocks
  every actor's `Write`, `Edit`, and `MultiEdit` calls, except those targeting `docs/`, `pm/`,
  `tmp/`, `.git/`, `.claude/rules/`, `.specdd/`, any `.sdd` file, `CLAUDE.md`, `AGENTS.md`,
  `.gitignore`, or `.gitattributes`. It fails
  open on any uncertainty, and it never sees writes made through `Bash`, so the behavioural rule
  still carries the gate. The legacy `tmp/pm-state.json` location is read when `pm/` has none. Set
  `signed_off` to `true`, with `approver` and `approved_date`, only at the sign-off gate;
  `/pm-skill:correct-course` may set it back to `false` for a material change.

## `pm/actors/<you>.json` (yours alone)

Fields: `actor`, `current_story`, `current_story_status`, `current_story_verification_status`,
`current_story_rounds`, `current_story_retries`, `branch`, `resolved_builder`, `parallel_batch`,
`next`, `handoff_written`, `updated`. Create it from
`${CLAUDE_PLUGIN_ROOT}/templates/actor-state.json.template`.

`current_story_status` uses `building | built | in-review | merged | blocked`.

- `current_story_rounds` (fix and re-review rounds) and `current_story_retries` (builder retries)
  persist the loop bounds across sessions. Reset both to `0` at story start and increment them as
  they are spent; the 3-round and 2-retry **caps** count what previous sessions already used.
- `resolved_builder` persists the sequential story's `expert-builder` or `codex-builder` routing
  decision until ship, so resume never re-resolves `auto` from memory.
- `parallel_batch` (parallel path) holds your batch entries `{story, branch, worktree, builder,
  commit, status, rounds, retries}`, per-actor, since worktrees and batches are yours.
- `handoff_written` against `updated` is the handoff staleness check, described below.

## `pm/log.md` (shared, append-only)

One file. Each line records one project event. Entry shape:

```
- <YYYY-MM-DD HH:MM> <actor-id>: <2 to 3 sentence summary for a colleague with zero context>
```

- **Append** only, with no mutable blocks. There is deliberately no "Current State" section, because
  anything mutable in a shared file conflicts under concurrent editing. Current position lives in the
  state JSONs, and resume renders it from there.
- Concurrent appends merge cleanly because discovery sets `pm/log.md merge=union` in
  `.gitattributes`. Union merge can interleave near-simultaneous entries out of timestamp order,
  which is harmless for an append-only log. Never "fix" old entries.

## `pm/actors/<you>.HANDOFF.md` (optional end-of-session briefing)

`/pm-skill:handoff` writes it from `${CLAUDE_PLUGIN_ROOT}/templates/HANDOFF.md.template`:
agent-to-agent, token-efficient, pointers over prose. **Overwrite** it each handoff, since it
captures one moment in time and history is the log plus git. The command records the write time in
your actor file's `handoff_written`, which `resume-procedure.md` uses to detect a stale handoff.

## Claim and sync discipline (team of any size)

`implementation-loop.md` owns the per-story claim commit, the pull-or-rebase points, and the release
in the post-merge PM update commit. What holds beyond one story:

- An assignment without the matching actor position reads as a stale claim. Until the claim commit is
  pushed it is visible only locally, so say so.
- Sprint advance: any actor may advance `current_sprint` once all the sprint's stories are merged.
  It is a shared-state write and gets a log entry.
- Claims are visible, not locked, because git cannot make them atomic. A same-minute double-claim
  races. `/pm-skill:doctor` and `/pm-skill:analyze` report the race after one fetch, and a person
  resolves it. Stale claims (an assignment with no matching branch or activity) are flagged the same way.

## Source of truth (committed)

The `docs/` artifacts are authoritative for decisions: `docs/spec.md`, `docs/plan.md`,
`docs/stories/*`, `docs/constitution.md`, optional `docs/checklists/*` and `docs/verification/*`.
The `pm/` files track *where everyone is*, not *what was decided*.

## On resume

`resume-procedure.md` owns the read order, the continuation point, and the migration trigger.
