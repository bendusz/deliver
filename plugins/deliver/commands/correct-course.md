---
description: Handle a mid-flight scope or direction change. Stop, re-plan explicitly at the right level, re-approve if material, then resume cleanly.
---

Use the `project-manager` skill to run a correct-course step. Scope is frozen once a story starts:
new requirements, a direction change, or a discovered-wrong assumption go through this path. Never
drip-feed changes into a running story.

Change: $ARGUMENTS  (what changed and what the user now wants; ask if empty)

Do this, in order:

1. **Stop and checkpoint.** Pause the in-flight story. Commit its work so far to the story branch,
   story-path scoped and never `git add -A`, and add a dated note to the story's Execution block
   saying a correct-course was triggered and why.
2. **Classify the level of the change.** Apply it at the highest level it touches, then let it flow
   down.
   - Spec-level, meaning product intent changed: update `docs/spec.md` via `/deliver:specify` and
     `/deliver:clarify`, then re-derive the affected parts of `docs/plan.md` and its stories.
   - Plan-level, meaning scope, architecture, stories, or priorities: update `docs/plan.md`, its
     Scope, Stories table, and Traceability, and every affected story file.
   - Story-level, meaning a criteria tweak within the agreed scope: update just the story file.
3. **Decide whether approval is void.** A material change, meaning scope added or removed,
   architecture changed, or requirements altered, voids the old approval. Set `status: revoked` in
   `docs/approval.json` and commit it on the integration branch, then present the updated plan and
   get a fresh explicit approval before any further implementation: a new Sign-off line, `status:
   approved`, and a new `plan_digest`, in one commit. A cosmetic story-level tweak needs no
   re-approval; refresh `plan_digest` if the plan changed and move on. When unsure, treat it as
   material. In a team, revoking halts **every** actor's implementation once they pull, so push the
   revocation only under the user's standing push permission, and if you cannot push, tell the
   user teammates will not see the halt until it reaches the remote.
4. **Reset the affected story.** If the in-flight story's scope changed, restart it from step 0 of the
   implementation loop against the revised story file, resetting `rounds`, `retries`, and
   `builder` in its Execution block. Unaffected stories keep their blocks.
5. **Commit.** Commit the `docs/` changes together, with a message that says what changed, at
   which level, and whether re-approval happened. With a wiki, dispatch `librarian ingest` over the
   revised artifacts per `references/knowledge.md`.

After a spec or plan change, run `/deliver:analyze` to check coverage and traceability.
