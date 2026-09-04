# Migrations

Load this only when a state read or a story finds an older layout. Migrate first, commit the
migration on its own, then continue the phase you were in.

## Projects managed before 0.21 (the plugin was renamed)

Nothing to migrate. The plugin was renamed in 0.21; the state it writes did not change. `pm/`,
`pm/pm-state.json`, `pm/actors/`, `pm/log.md`, the `AGENTS.md` pointer, and
`.claude/rules/pm-state.md` keep their names and contents, and every actor id stays valid because
the id salt deliberately kept the pre-0.21 name. `/deliver:resume` reads such a project exactly as
the old command did. Only the marketplace, the plugin directory, and the command namespace moved,
and the README's upgrade note covers that for the person installing it.

## Pre-0.10.1 actor ids

Ids before 0.10.1 used only the email local part, so `pm/actors/<local-part>.json` now shows up as
an orphan. On the first resume after upgrading, `git mv` that file and its `.HANDOFF.md` to the new
full-email id, update the `actor` field inside the JSON, and commit. The content format is
unchanged. Never create a second actor file alongside the orphan.

## Actor state created before 0.13 (no `resolved_builder`)

If an in-flight actor file lacks `resolved_builder`, recover an already logged route choice first.
If none exists and the story names an explicit builder, persist that value. If the story still says
`auto`, resolve it once with the current routing rules and append the reason. Commit the actor state
and the log together before another builder dispatch. Apply the same rule to any active
`parallel_batch` entry that lacks `builder`. Idle actor files may simply add
`resolved_builder: null` when they are next updated.

## Stories created before 0.13 (no `pm-meta`)

Add the story's `pm-meta` comment with the builder and touch paths, and commit that story migration
before you dispatch a builder.

## Stories created before 0.17 (visible `Builder`, `Touches`, and sensitivity fields)

No migration is needed. `pm-meta` is authoritative; the runner still checks that a visible `Builder`
or `Touches` field agrees with it and blocks on a mismatch. When you next edit such a story, you may
drop the visible fields and fold `Security-sensitive` and `Architecture-sensitive` into
`Review lenses`.

## Flat 0.8 layout (personal fields in `pm-state.json`, no `pm/actors/`)

On any state read:
1. Derive your actor id; create `pm/actors/<you>.json` from the personal fields
   (`current_story*`, `branch`, `resolved_builder`, `parallel_batch`, `next`, `handoff_written`) and
   remove them from the shared file; add `assignments` (seed from `current_story` if one is in
   flight).
2. Move `pm/HANDOFF.md` to `pm/actors/<you>.HANDOFF.md` if present.
3. Strip the log's Current State block, whose live content now lives in the state files. Keep every
   existing log entry verbatim; only new entries carry the actor prefix.
4. Append `pm/log.md merge=union` to `.gitattributes`.
5. Verify the check-ignore file checks pass, log the migration, and commit.

## Pre-0.8 layout (state still under `tmp/`)

Move `tmp/pm-state.json`, `tmp/log.md`, and `tmp/HANDOFF.md` if present into `pm/`, leaving one-line
pointer stubs in `tmp/` ("Moved to pm/<name>"). Update repo references to the old paths, apply the
flat-0.8 migration above in the same pass, and commit once.
