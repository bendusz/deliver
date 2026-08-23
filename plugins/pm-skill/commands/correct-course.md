---
description: Handle a mid-flight scope or direction change — stop, re-plan explicitly at the right altitude, re-sign-off if material, then resume cleanly.
---

Use the `project-manager` skill to run a **correct-course** step. Scope is frozen once a story
starts; when new requirements, a direction change, or a discovered-wrong assumption appears
mid-flight, this is the one sanctioned path — never drip-feed changes into a running story.

Change: $ARGUMENTS  (what changed / what the user now wants — ask if empty)

Do this, in order:

1. **Stop and checkpoint.** Pause the in-flight story. Commit its work-so-far to the story branch
   (story-path-scoped; never `git add -A`) so nothing is lost, and note in `pm/log.md` that a
   correct-course was triggered and why.
2. **Classify the altitude of the change** — apply it at the highest level it touches, then let it
   flow down:
   - **Spec-level** (product intent changed): update `docs/spec.md` (via `/pm-skill:specify` /
     `/pm-skill:clarify`), then re-derive the affected parts of `docs/plan.md` and its stories.
   - **Plan-level** (scope, architecture, stories, priorities): update `docs/plan.md` — Scope,
     Stories table, and Traceability — and every affected story file.
   - **Story-level** (criteria tweak within the agreed scope): update just the story file.
3. **Decide whether sign-off is void.** A **material** change — scope added/removed, architecture
   changed, requirements altered — voids the old approval: set `signed_off: false` in
   `pm/pm-state.json` (the sign-off hook re-engages and blocks implementation writes — that is
   intended), present the updated plan, and get a fresh explicit approval before any further
   implementation. A cosmetic story-level tweak needs no re-sign-off — record it in `pm/log.md`
   and move on. When unsure, treat it as material. In a team, voiding sign-off halts **every**
   actor's implementation (the hook re-engages for all) — announce it in `pm/log.md` and commit
   immediately; push only under the user's standing push permission (**never push without an
   explicit request** — hard rule), and if you cannot push, tell the user teammates won't see
   the halt until it reaches the remote.
4. **Reset the affected story.** If the in-flight story's scope changed, restart it from step 0 of
   the implementation loop against the revised story file, resetting `current_story_rounds`,
   `current_story_retries`, and `resolved_builder` so the materially revised story is routed again.
   Unaffected stories keep their state.
5. **Log and commit.** Record the correct-course outcome (what changed, at which altitude,
   re-sign-off or not) in `pm/log.md`, update `pm/pm-state.json`, and commit the `docs/` + `pm/`
   changes together.

Run `/pm-skill:analyze` after a spec- or plan-level change — coverage and traceability are exactly
what a mid-flight edit tends to break.
