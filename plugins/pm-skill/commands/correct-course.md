---
description: Handle a mid-flight scope or direction change. Stop, re-plan explicitly at the right level, re-sign-off if material, then resume cleanly.
---

Use the `project-manager` skill to run a correct-course step. Scope is frozen once a story starts, so
when new requirements, a direction change, or a discovered-wrong assumption appears mid-flight, this
is the one sanctioned path. Never drip-feed changes into a running story.

Change: $ARGUMENTS  (what changed and what the user now wants; ask if empty)

Do this, in order:

1. **Stop and checkpoint.** Pause the in-flight story. Commit its work so far to the story branch,
   story-path scoped and never `git add -A`, so nothing is lost, and note in `pm/log.md` that a
   correct-course was triggered and why.
2. **Classify the level of the change.** Apply it at the highest level it touches, then let it flow
   down.
   - Spec-level, meaning product intent changed: update `docs/spec.md` via `/pm-skill:specify` and
     `/pm-skill:clarify`, then re-derive the affected parts of `docs/plan.md` and its stories.
   - Plan-level, meaning scope, architecture, stories, or priorities: update `docs/plan.md`, its
     Scope, Stories table, and Traceability, and every affected story file.
   - Story-level, meaning a criteria tweak within the agreed scope: update just the story file.
3. **Decide whether sign-off is void.** A material change, meaning scope added or removed,
   architecture changed, or requirements altered, voids the old approval. Set `signed_off: false` in
   `pm/pm-state.json`, which re-engages the sign-off hook and blocks implementation writes, as
   intended. Present the updated plan and get a fresh explicit approval before any further
   implementation. A cosmetic story-level tweak needs no re-sign-off; record it in `pm/log.md` and
   move on. When unsure, treat it as material. In a team, voiding sign-off halts **every** actor's
   implementation, because the hook re-engages for all, so announce it in `pm/log.md` and commit
   immediately. Push only under the user's standing push permission, since the
   never-push-without-explicit-request hard rule always wins, and if you cannot push, tell the user
   teammates will not see the halt until it reaches the remote.
4. **Reset the affected story.** If the in-flight story's scope changed, restart it from step 0 of the
   implementation loop against the revised story file, resetting `current_story_rounds`,
   `current_story_retries`, and `resolved_builder` so the materially revised story is routed again.
   Unaffected stories keep their state.
5. **Log and commit.** Record the correct-course outcome, what changed, at which level, and whether
   re-sign-off happened, in `pm/log.md`, update `pm/pm-state.json`, and commit the `docs/` and `pm/`
   changes together. With a wiki, dispatch `librarian ingest` over the revised artifacts per
   `references/knowledge.md`.

After a spec or plan change, run `/pm-skill:analyze` to check coverage and traceability.
