# Logging & State

Keep just enough state on disk that a lost session can resume with zero memory — and so that
several people can run PM sessions on the same repo without overwriting each other. Solo is simply
a team of one: the layout is identical.

## The layout: shared core + per-actor files; `tmp/` is scratch

```
pm/
  pm-state.json            # SHARED project state (see schema below)
  log.md                   # SHARED logbook — append-only, author-prefixed
  actors/
    <actor-id>.json        # YOUR working position
    <actor-id>.HANDOFF.md  # YOUR handoff briefing
.gitattributes             # carries: pm/log.md merge=union
tmp/                       # gitignored, disposable — never load-bearing for resume
```

- **`pm/` (git-tracked, committed):** the durable state. Losing the checkout must not lose it, so
  it lives in git and travels with every clone and push. Verify the state files are not matched by
  `.gitignore` when creating them: `git check-ignore pm/pm-state.json pm/log.md
  pm/actors/<actor-id>.json` must fail (check *files*, not the directory — a `pm/*` rule ignores
  the files while a directory check passes).
- **`tmp/` (gitignored, disposable):** everything ephemeral — scratch, prompts, raw subagent
  output, diffs, CI dumps, `tmp/environment-check.md`, `tmp/worktrees/`. Nothing in `tmp/` may be
  load-bearing for resume.
- **Never edit another actor's files.** You write your own `pm/actors/<you>.json` and
  `<you>.HANDOFF.md` only (the bundled `actor-guard.sh` hook blocks accidents). Everyone writes
  the shared files — but only at coordination moments (below).

**Commit `pm/` with the work it describes.** Include state updates in the ship/log commit for each
story (and the sign-off, claim, and sprint-boundary commits), so the pushed repo always carries the
current resume point.

**No secrets — load-bearing rule.** `pm/` is tracked: never write secrets/credentials into any
state file — reference secret *locations* ("`.env` on the box"), never values. The bundled
`pm-secrets-guard.sh` hook is a mechanical backstop for high-confidence token shapes; the rule is
yours to hold.

## Actor identity (derived, never configured)

Your actor id is the slug of your **full** git `user.email` plus a 12-hex digest of the raw
lowercased email (fallback source: `user.name`; last resort `unknown-actor`). Slug = lowercase,
runs of non-alphanumerics → `-`, trimmed; digest = two POSIX `cksum` values in hex, truncated to 12 —
`v.bende@gmail.com` → `v-bende-gmail-com-0719f22c3305`. The full email separates domains
(`alex@company-a.com` vs `alex@company-b.com`) and the digest separates slug homographs
(`alex.foo@` vs `alex-foo@`). Derive it with `hooks/lib.mjs` (hooks import it; commands run
`node "${CLAUDE_PLUGIN_ROOT}/hooks/lib.mjs" actor-id .`) — never
hand-compute it. Changing git identity mid-project creates a second actor file —
`/pm-skill:doctor` flags orphans.

**Migration from pre-0.10.1 ids** (which used only the email local part): your old
`pm/actors/<local-part>.json` / `.HANDOFF.md` will appear as an orphan. On first resume after
upgrading, `git mv` each old file to the new id and continue — the content format is unchanged.

## `pm/pm-state.json` (shared — changes only at coordination moments)

Fields: `project`, `spec`, `constitution`, `scale`, `phase`, `signed_off` (bool), `approver`,
`approved_date`, `integration_branch`, `current_sprint`/`total_sprints`, `last_analysis_status`,
`assignments`, `updated`. Create from `${CLAUDE_PLUGIN_ROOT}/templates/pm-state.json.template`.

- **`assignments`** maps story id → actor id for **active claims only** — set when a story is
  claimed, removed in the ship commit. History lives in the log and the story files.
- **`signed_off` is load-bearing and global:** the sign-off hook blocks implementation writes for
  *every* actor while it is `false`. Set it `true` (with `approver` + `approved_date`) only at the
  sign-off gate; `/pm-skill:correct-course` may set it back to `false` for material changes.

## `pm/actors/<you>.json` (yours alone)

Fields: `actor`, `current_story`, `current_story_status`, `current_story_verification_status`,
`current_story_rounds`, `current_story_retries`, `branch`, `resolved_builder`, `parallel_batch`, `next`,
`handoff_written`, `updated`. Create from `${CLAUDE_PLUGIN_ROOT}/templates/actor-state.json.template`.

- **Bound counters:** `current_story_rounds` (fix/re-review rounds) and `current_story_retries`
  (builder retries) persist the loop bounds across sessions — reset to `0` at story start,
  increment as spent; the ≤3-round / ≤2-retry caps count what previous sessions already used.
- **`resolved_builder`** persists the sequential story's `expert-builder` or `codex-builder`
  routing decision until ship, so resume never re-resolves `auto` from memory.
- **`parallel_batch`** (parallel path): your batch entries `{story, branch, worktree, builder,
  commit, status, rounds, retries}` — per-actor, since worktrees and batches are yours.
- `handoff_written` vs `updated` is the handoff staleness check (see below).

## `pm/log.md` (shared, append-only)

One file, one chronological project narrative. Entry shape:

```
- <YYYY-MM-DD HH:MM> <actor-id> — <2–3 sentence summary for a colleague with zero context>
```

- **Append-only. No mutable blocks.** There is deliberately no "Current State" section — anything
  mutable in a shared file conflicts under concurrent editing. Current position lives in the state
  JSONs; resume renders it from there.
- Concurrent appends merge cleanly because bootstrap sets `pm/log.md merge=union` in
  `.gitattributes`. Union merge can interleave near-simultaneous entries out of timestamp order —
  harmless for an append-only log; never "fix" old entries.

## `pm/actors/<you>.HANDOFF.md` (optional — end-of-session briefing)

Written by `/pm-skill:handoff` from `${CLAUDE_PLUGIN_ROOT}/templates/HANDOFF.md.template`:
agent-to-agent, token-efficient, pointers over prose. **Overwrite** it each handoff (one moment in
time; history is the log + git). The command records the write time in your actor file's
`handoff_written`; on resume, if your `updated` is newer than `handoff_written`, the handoff is
stale — trust state + log instead.

## Claim & sync discipline (team of any size)

- **Pull/rebase before claiming** a story and **before shipping** one.
- **Claim** = one commit on the up-to-date **integration branch** that sets
  `assignments[story] = you` in the shared state **and** records your position in
  `pm/actors/<you>.json` (story, status, planned branch name, resolved builder, counters reset) and
  appends the route decision to `pm/log.md` — a claim committed
  only to a story branch is invisible to teammates' pull-and-check flow, and an assignment
  without the matching actor position reads as a stale claim — then create the story branch.
  Push the claim only under the user's standing push permission (the
  never-push-without-explicit-request rule always wins); until pushed, it is visible only
  locally — say so.
- If the integration tip moved after your gates ran, **re-gate on the merged result** before
  merging (the same semantic-conflict rule as the parallel path).
- **Release** the claim in the ship commit (remove the assignment, append the log entry).
- **Sprint advance:** any actor may advance `current_sprint` once all the sprint's stories are
  merged — it is a shared-state write and gets a log entry.
- Claims are **visible, not locked**: git cannot make them atomic. A same-minute double-claim
  races; `/pm-skill:doctor` and `/pm-skill:analyze` surface it within one fetch, resolution is
  human. Stale claims (assignment with no matching branch/activity) are flagged the same way.

## Source of truth (committed)

The `docs/` artifacts are authoritative for decisions: `docs/spec.md`, `docs/plan.md`,
`docs/stories/*`, `docs/constitution.md`, optional `docs/checklists/*` and `docs/verification/*`.
The `pm/` files track *where everyone is*, not *what was decided*.

## On resume

Read the shared `pm/pm-state.json`, then **your** `pm/actors/<you>.json` and (if current) your
HANDOFF (the `/pm-skill:resume` command does exactly this; the bundled `session-context.sh` hook
also injects a short pointer — yours plus teammate one-liners — into every new or freshly-compacted
session). Then continue from your recorded `next`.

### Migrating actor state created before 0.13

If an in-flight actor file lacks `resolved_builder`, recover an already logged route choice first.
If none exists and the story names an explicit builder, persist that value. If the story still says
`auto`, resolve it once with the current routing rules and append the reason. Commit the actor state
and log together before another builder dispatch. Apply the same rule to any active
`parallel_batch` entry that lacks `builder`. Idle actor files may simply add
`resolved_builder: null` when they are next updated.

### Migrating a flat 0.8 project (personal fields in `pm-state.json`, no `pm/actors/`)

On any state read:
1. Derive your actor id; create `pm/actors/<you>.json` from the personal fields
   (`current_story*`, `branch`, `resolved_builder`, `parallel_batch`, `next`, `handoff_written`) and remove them from
   the shared file; add `assignments` (seed from `current_story` if one is in flight).
2. Move `pm/HANDOFF.md` → `pm/actors/<you>.HANDOFF.md` if present.
3. Strip the log's Current State block (its live content now lives in the state files); keep all
   existing log entries verbatim — only new entries carry the actor prefix.
4. Append `pm/log.md merge=union` to `.gitattributes`.
5. Verify the check-ignore file checks pass, log the migration, and commit.

### Migrating a pre-0.8 project (state still under `tmp/`)

Move `tmp/pm-state.json` / `tmp/log.md` (and `tmp/HANDOFF.md` if present) into `pm/` with one-line
pointer stubs left in `tmp/` ("Moved to pm/<name>"), update repo references to the old paths, then
apply the flat-0.8 migration above in the same pass, and commit once.
