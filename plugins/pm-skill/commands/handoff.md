---
description: End a session cleanly by writing pm/actors/<id>.HANDOFF.md, a token-efficient briefing so the next agent resumes at full speed.
---

Use the `project-manager` skill to write an end-of-session handoff.

Write `pm/actors/<you>.HANDOFF.md`, with the actor id per `references/logging-and-state.md`, from
`${CLAUDE_PLUGIN_ROOT}/templates/HANDOFF.md.template`, **overwriting** any previous handoff. It
describes one moment in time; history lives in `pm/log.md` and git.

Focus: $ARGUMENTS  (optional, anything the user wants the next session to prioritise)

Rules for the content:
- Write it for an agent, not a human. Terse key-value lines and fragments; no pleasantries, no
  narrative, and no restating what the committed artifacts already say. **Point** at files instead,
  with `READ_FIRST`, and use `SKIP` to steer the next agent away from expensive dead ends. The whole
  file should be a few hundred tokens, not pages.
- Include only what a fresh agent cannot cheaply rediscover: the exact position (phase, sprint, story
  and its in-flight state), the branch and uncommitted paths, gate commands with their last results,
  open review findings and verifier status, decisions made this run that are not yet in `docs/`,
  gotchas learned the hard way, current blockers, and the ordered next steps with concrete files and
  commands.
- Every claim must reflect real repo state. Check `git status` and the branch; do not recite from
  memory.
- **Audit** the log first. Read this session's `pm/log.md` entries and check each maps to a real
  commit, file, or command, using `git log`, `git status`, and the paths named. For any entry that
  does not, append a new corrective entry that cites the inaccurate one; never edit old entries. The
  log must tell the truth before the handoff points at it.
- **Never** write secrets, because `pm/` is tracked. Reference secret locations, "`.env` on the box"
  for example, never values.

Then finish the handoff:
- Sync `pm/actors/<you>.json`: set `next` to `read pm/actors/<you>.HANDOFF.md, then <first NEXT
  step>`, set `handoff_written` to now, and refresh `updated` to the same value. Your `updated` being
  newer than `handoff_written` is how resume detects a stale handoff.
- Append a one-line entry to `pm/log.md`: handoff written, and where work stopped.
- **Commit** the `pm/` files, meaning your actor file, your handoff, and the `pm/log.md` entry you
  just appended. A handoff that is not in the repo does not survive the session, and a log entry left
  uncommitted vanishes from the shared history.

`/pm-skill:resume` reads this file, after `pm/pm-state.json`, to skip re-discovery. If your position
has moved on since the handoff was written, meaning your actor file's `updated` is newer than its
`handoff_written`, the resume trusts state and log over the handoff.
