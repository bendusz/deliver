# Acceptance: the release candidate

Load when you cut a release candidate (RC): the Active goal's stories are merged and retro'd.
Story tests and verifiers prove stories. The RC proves to the user that the product is what they
asked for, and the user's walk-through is the proof. Nothing ships without it.

## 1. Cut
- Preconditions: `docs/gate.txt` `PASS` at the integration head, the last journey gate passed
  (`retro.md` `## 0`), no open `block` or `major`.
- Freeze `rc_sha` = the integration head. Create `docs/acceptance.json` from
  `<plugin>/templates/acceptance.json.template` with `rc_sha` set, commit it and log it.
- While an RC is open, merge only stories its walk-through asks for. Each one cuts a new RC.

## 2. Check
- One verifier dispatch (`roles.md`, the same model and effort as for stories) on a detached
  worktree of `rc_sha`, key `rc-<k>-verifier-0`. DONE WHEN: each `## Acceptance` journey from fresh
  state, the parity check against its bar, and every `User-visible: yes` criterion. Evidence goes
  under `docs/evidence/rc-<k>/`.
- List every difference the parity check or a journey finds by name, one line each: where, what
  the user sees before, what they see after.

## 3. Walk-through, the user's
Send the user, in at most 15 lines: where to try it (URL, build or command, and any login), each
journey with its recipe, the parity result, the verifier's evidence path, and the differences.
- The user walks it themselves. Each difference is either accepted by name, and listed in
  `docs/acceptance-differences.md`, or becomes a fix story and a new RC.
- Only on the user's explicit "accepted", write:
  `{"status":"accepted","rc_sha":"<sha>","walked_at":"<YYYY-MM-DD HH:MM>","journeys":["J1",…],"accepted_differences":["<name>",…]}`
  Commit it with the differences list, and log it.
- "Looks fine, ship it" without a walk-through is not acceptance. Say once what they have not
  seen and what it risks; the record stays `pending` and the release waits. Never write
  `accepted` for the user, and never count a verifier PASS as their walk-through.

Agents give these reasons for skipping the walk-through. None of them holds:
| excuse | reality |
|---|---|
| "The verifier passed every journey." | It ran the steps it was given. The user knows what they asked for. |
| "It is like-for-like, so nothing visible changed." | Only the parity check can say that, measured against its bar. |
| "The user is busy; I will list the differences after release." | A difference found after release becomes a rollback. |

## 4. After
- A commit after `rc_sha` that touches anything beyond the PM records (`state.md`) voids the
  record: cut a new RC.
- `Release: production` in the plan: load `release.md`. Otherwise ship the way the user asks
  (`host.md`); never push unasked.
- Last, once it has shipped (after `release.md` when that applies), cut `docs/plan.md` down to
  the platform's documentation, in its own commit: keep Overview, Scope, Requirements, Design,
  Acceptance and the Risks that still hold, each true of what shipped. Delete Delivery, Stories,
  Traceability, Commands (`AGENTS.md` holds them), Waivers, Clarifications and Sign-off; the
  completion report and git keep them.
