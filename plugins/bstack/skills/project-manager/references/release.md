# Release: production

Load only when the plan's `Release:` is `production`, once `docs/acceptance.json` is `accepted`
at the release candidate's sha (`acceptance.md`).

## Go/no-go is binding
- Write `docs/go-no-go.md` from `<plugin>/templates/go-no-go.md.template` when the release sprint
  starts, not on the night. Every item is done with evidence, or open.
- At the go time, an open or waived item moves the date. Waiving one is the user's call, made
  from the Floor 6 list: the item, what skipping it risks, and the date that closing it needs.
- "Ship tonight instead" is a date change: show that list, and offer the dark release below as
  the way to ship early. Never agree first and list the risks after.
- NO-GO is a normal outcome. Log it with the new date.

## Dark first
- The release ships with the new behaviour switched off (a flag, a config value, a route).
  Switching it on is a later, separate step with its own go/no-go line and its own rollback.
- What cannot be switched off (a schema change, a data migration) goes expand, migrate,
  contract (`planning.md` `## 6`): the expand ships first, and each irreversible step gets its own
  go/no-go line.

## Rehearse on the real shape
- Rehearse on the production service units: the same unit files or manifests, process manager,
  users, ports and variable names, not a dev server. Attach the diff of the rehearsal's unit
  definitions against production's as evidence; any difference is an open item.
- Run any data step against a copy of production data, and time it.
- Rehearse the rollback after the release rehearsal, time it, and check that the old version
  serves again. A rollback that was never run is an open item.

## Clock-timed steps
- A step due at a clock time runs on a system timer (a systemd timer, launchd, `at`, cron, the
  deploy system's scheduler) the user approves, or by a person the user names. Never on your own
  wake-up (`ScheduleWakeup`, `schedule_task`, a sleep): it can fire late or not at all.
- Write the timer's definition, show it to the user, and record it under the go/no-go's Timed
  steps with the check to run after. Check and log the result the next time you run.

## Tags and push
- Tag the release on a commit on main. Then run `bash "<plugin>/scripts/hygiene.sh"`: a tag
  missing from main or the integration branch is a defect to fix before anyone is told.
- Every push, tag push and deploy waits for the user's ask (Floor 5).
