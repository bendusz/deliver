# State health (doctor)

`/deliver:doctor` runs these against `pm/` when it exists, reporting `OK` or `DRIFT` per check.

- `pm/pm-state.json` parses as JSON.
- `git check-ignore pm/pm-state.json pm/log.md pm/actors/<you>.json` fails, `tmp/` **is** ignored,
  `pm/` has no uncommitted changes older than the last work commit, and `.gitattributes` carries
  `pm/log.md merge=union`.
- Team health: the claim-conflict and stale-claim checks in `artifact-consistency.md`; every
  `pm/actors/*.json` parses and matches a recent git author (flag orphans from a changed git
  identity); every in-flight sequential story has a valid `resolved_builder` and every active
  parallel entry a valid `builder`; your own actor id is derivable, meaning git `user.email` or
  `user.name` is set.
- `docs/plan.md`'s Sign-off line agrees with `signed_off` in `pm/pm-state.json`. The v0.9 log is
  append-only and has no Current State block to cross-check.
- `handoff_written` against `updated` in `pm/actors/<you>.json`: flag a stale
  `pm/actors/<you>.HANDOFF.md` (updated is newer) so resume does not trust an outdated briefing.
