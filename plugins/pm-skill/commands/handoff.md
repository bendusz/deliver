---
description: End a session cleanly — write pm/actors/<id>.HANDOFF.md, a token-efficient briefing so the next agent resumes at full speed.
---

Use the `project-manager` skill to write an end-of-session handoff.

Write `pm/actors/<you>.HANDOFF.md` (actor id per `references/logging-and-state.md`) from `${CLAUDE_PLUGIN_ROOT}/templates/HANDOFF.md.template`, **overwriting**
any previous handoff — it describes one moment in time; history lives in `pm/log.md` and git.

Focus: $ARGUMENTS  (optional — anything the user wants the next session to prioritise)

Rules for the content:
- **Written for an agent, not a human.** Terse key-value lines and fragments; no pleasantries, no
  narrative, no restating what the committed artifacts already say — **point** at files instead
  (`READ_FIRST`), and use `SKIP` to steer the next agent away from expensive dead ends. The whole
  file should be a few hundred tokens, not pages.
- Include only what a fresh agent **cannot cheaply rediscover**: exact position (phase / sprint /
  story and its in-flight state), branch + uncommitted paths, gate commands with their last results,
  open review findings / verifier status, decisions made this run that aren't yet in `docs/`,
  gotchas learned the hard way, current blockers, and the **ordered** next steps with concrete
  files/commands.
- Every claim must reflect real repo state — check `git status`/branch, don't recite from memory.
- **Audit the log first.** Read this session's `pm/log.md` entries and check each maps to a real
  commit, file, or command (`git log`, `git status`, the paths named). Correct or annotate any
  entry that does not — the log must tell the truth before the handoff points at it.
- **No secrets** — `pm/` is tracked. Reference secret *locations* (e.g. "`.env` on the box"),
  never values.

Then finish the handoff:
- Sync `pm/actors/<you>.json`: set `next` to `read pm/actors/<you>.HANDOFF.md, then <first NEXT
  step>`, set `handoff_written` to now, and refresh `updated` (same value — your `updated` newer
  than `handoff_written` is how resume detects a stale handoff).
- Append a one-line entry to `pm/log.md` (handoff written, where work stopped).
- **Commit the `pm/` files (your actor file, your handoff, and the `pm/log.md` entry you just
  appended)** — a handoff that isn't in the repo doesn't survive the session, and a log entry left
  uncommitted vanishes from the shared history.

`/pm-skill:resume` reads this file (after `pm/pm-state.json`) to skip re-discovery. If your position has
moved on since the handoff was written (your actor file's `updated` is newer than its
`handoff_written`), the resume trusts state + log over the handoff.
