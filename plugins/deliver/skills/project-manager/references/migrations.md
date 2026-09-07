# Migrations

Load this only when a state read or a story finds an older layout. Migrate first, commit the
migration on its own, then continue the phase you were in.

## Projects managed before 0.24 (tracked `pm/` state)

Trigger: `pm/pm-state.json` or `tmp/pm-state.json` exists and `docs/approval.json` does not.
Every older layout, the pre-0.8 `tmp/` files, the flat 0.8 file, the 0.9 actor files, and
pre-0.10.1 actor ids, migrates in this one pass; read whichever files exist. Run it on the
integration branch in the main checkout, never on a story branch, because the marker and the
`pm/` removal must not enter a story's cumulative diff. The old loop updated actor files on the
story branch mid-story, so for every unmerged `pm/<id>-*` branch read its copy of the state too
(`git show <branch>:pm/actors/<id>.json`, or the flat file) and take whichever `updated` is
newer, so an exhausted counter is never reset. Show the user what you found, then in one commit:

1. **Marker.** Write `docs/approval.json` from the template: `approved` with the old `approver`
   and `approved_date` when `signed_off` was `true`, else `pending`. Leave `plan_digest` for
   step 5, after the plan edit.
2. **Execution blocks.** For every story an `assignments` entry, an actor file's `current_story`,
   a `parallel_batch` entry, or the flat file's `current_story` names, append an `## Execution`
   section per `state.md`: `owner` from the actor file's `actor`, or your id for a flat layout;
   `builder` from `resolved_builder` or the batch entry, resolving `auto` now and saying so;
   `branch`; `status`, mapping one to one and treating an empty status as `claimed`; `rounds` and
   `retries` from the counters. `owner` is your current actor id when the old `actor` was yours,
   which an id from before 0.10.1 (the bare email local part) or from before 0.21 never matches
   by string; compare it with the slug prefix of `actor-id`'s output. A teammate's old id stays
   as written, and they rewrite their own `owner` on their first resume.
3. **Shipped stories.** A story the old state never mentions is done when its `pm/<id>-*` branch
   is merged into the integration branch (`git branch --merged`, local or remote), or when its
   Verification evidence records a PASS and the old log or history records its merge. Give each
   such story a `merged` block with the merge commit in a note, so resume never restarts it.
   A story with neither gets no block and is unclaimed.
4. **Handoffs.** Read each `pm/actors/*.HANDOFF.md`, or `pm/HANDOFF.md`, once. Fold anything still
   true into that story's Execution notes. Do not carry the file over; its position is stale by
   definition.
5. **Remove.** `git rm -r pm/`, and the `tmp/` pointer stubs when present; delete the
   `pm/log.md merge=union` line from `.gitattributes`; `git rm` `.claude/rules/pm-state.md` and
   `pm/AGENTS.md` when present; delete the `Instruction rules` line from the plan's Delivery mode
   and add `Integration branch` when it is missing. Now set `plan_digest` from
   `git hash-object docs/plan.md`, so the approved digest is the edited plan. The log stays in
   history: `git log -p -- pm/log.md`.
6. **Commit** as `chore: migrate PM state to 0.24` and report the resulting position.
7. **Carry it into open work.** Merge the integration branch into every unmerged story branch and
   worktree before any builder dispatch, so each checkout holds the marker the runner requires and
   the three-dot scope diff stays clean. A delete/modify conflict on a `pm/` file resolves by
   taking the deletion (`git rm`), because the Execution block already carries its fields.

The actor id derivation is unchanged, so an old id and the new one agree.

## Stories created before 0.13 (no `pm-meta`)

Add the story's `pm-meta` comment with the builder and touch paths, and commit that story migration
before you dispatch a builder.

## Stories created before 0.17 (visible `Builder`, `Touches`, and sensitivity fields)

No migration is needed. `pm-meta` is authoritative; the runner still checks that a visible `Builder`
or `Touches` field agrees with it and blocks on a mismatch. When you next edit such a story, you may
drop the visible fields and fold `Security-sensitive` and `Architecture-sensitive` into
`Review lenses`.
