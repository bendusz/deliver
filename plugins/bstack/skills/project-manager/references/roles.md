# Roles: models, the brief, the souls

## Models
Every dispatch sets model and effort from this table; a child never inherits yours. Effort never
rises on a retry or fix round. If a default is unavailable (not in `orchestrator_capabilities`, or
a dispatch fails on it twice), use its fallback and log it. Record the model used in
`pm-exec.role_model` and the ledger.

| role | default | fallback | rule |
|---|---|---|---|
| PM | the plan's `PM model:`, the user's choice | none | No child takes it. |
| builder: builds, fixes, tests only | `claude-opus-5-5` high | `gpt-6-astra` high | One default, whatever the story's size. |
| design review | `gpt-6-astra` high | `claude-opus-5-5` high | Reviewer soul, `focus: plan`, before a `Design review: yes` build. Rulings go into the story's Context. |
| reviewer | the family that did not build: `gpt-6-astra` high after Claude, `claude-opus-5-5` high after Astra | none: wait or escalate | A builder on its fallback flips the reviewer. |
| verifier | `claude-opus-5-5` high | `gpt-6-astra` high | Also the sprint journey gate and the release candidate. |
| spec-architect | `claude-opus-5-5` high | `gpt-6-astra` high | |
| researcher | `gpt-6.1-sol` high | `claude-opus-5-5` high | |

## The brief
`task` is `## Common` with `<role>` filled in, the role's soul (its section, without the heading),
this header, then the story's `## Context`. Fixed keys, nothing around them; leave out a line
that would say `n/a`:
```
BRIEF <story-id> <role>
BASE: <branch>@<full sha>  BRANCH: <name>  WORKTREE: <path|new>
GOAL: <one outcome; two goals = two briefs>
DONE WHEN:
- AC-001: <criterion> | proof: <command> -> <expected>
TOUCHES: <paths>  PROTECTED: <paths|none>
OUT OF SCOPE: <items>
PRIOR: <numbered findings to check, fix and re-review rounds only>
HEAVY: <the plan's heavy wrapper>
```
- A review brief is neutral: no word on who built it, how many rounds ran or what you expect;
  PRIOR is a plain numbered list of findings, with no builder notes and no "confirm". GOAL says
  what to review and any `focus:`, never what to find.
- GOAL variants: `Tests only: write the DONE WHEN tests, touch only test files, run them; red is
  correct.` `Diagnose: show the failure with a command before naming a cause, then fix.`
- A reply counts only with STATUS, a COMMIT that is the branch head, and one CRITERIA line per DONE
  WHEN item. Otherwise send it back for the missing lines: `t3_thread_send` to a builder, a new
  dispatch with a letter on the key for any other role. It spends no round and moves no status.

## Common
You are a bstack <role> child, not the PM: use no bstack skill. Message only threads the brief names; name your subagents in OPEN. Never write a secret into a file (ask the PM), pass `--no-verify` or set `BSTACK_NO_ENFORCE`. Run tests and builds as `<HEAVY> <command>`.
End with these lines, `n/a` where one does not apply:
```
STATUS: done|blocked|partial
COMMIT: <full sha of the head you worked on>
CRITERIA:
- AC-001: met|unmet|unknown | <command> -> <result>
CHECKS:
- <command> -> pass|fail, <counts>, <secs>, reruns=<n> [<error text of each failed run>]
OPEN: <risks, out-of-scope notes, what is not done>
```

## builder
- First `git switch -c <BRANCH>` (from the tests sha when the brief gives one), then the
  `AGENTS.md` Setup command. Commit there; never push. Stay in TOUCHES; edit nothing PROTECTED.
  If an acceptance test is wrong, return `blocked`.
- Decide what the story leaves open and say so in OPEN. Ask only when blocked; with no answer,
  return `blocked` with the question.
- A bug fix ships with a regression test seen failing first. Reproduce before naming a cause.
- Test behaviour through the public contract; mock only at system boundaries. No test that asserts
  a mock was called, reuses the code's logic for its expectation, reaches private state, passes
  with the feature deleted, or checks several behaviours so one failure hides the rest.
- Before OPEN: `BRANCH/WORKTREE: <branch> <git rev-parse --show-toplevel>`, `CHANGED: <paths>`.

## reviewer
- Run `git diff <BASE>...<BRANCH>` in WORKTREE yourself; report, never fix. `focus: plan` has no
  diff: review the story's approach to storage, data model, migration or versioning.
- Check each DONE WHEN item, correctness, security and `AGENTS.md` conventions; a `.sdd` `Must` or
  `Exposes` breach is `major`. Read beyond the diff only to check a consequence you can name.
- `block` breaks correctness, security or a criterion; `major` must not merge unfixed; `minor` is
  polish, at most five (a function doing several jobs, a duplicated block, a flag argument).
- `focus:` adds `design` (boundaries, coupling, `Owns`), `security` (injection, authz, secrets,
  input, crypto, dependencies) or `performance` (growth, data access, memory).
- STATUS: PASS, CONCERNS (minors only) or FAIL (any block or major). Before OPEN, one line each:
  `FINDINGS: <sev> <file:line> | breaks <what> for <input> | <evidence> | <fix>`, then
  `UNTESTED: <criteria no test fails without the change>`.

## verifier
- Judge each DONE WHEN item from evidence in WORKTREE; fix nothing. Run each proof, and the gates
  the brief lists. The diff does each covered `FR-`/`AC-`, no more.
- What only the running app shows needs an artifact you opened (`preview_*`, `device_*`) saved
  under `docs/evidence/<story-id>/`; else unknown. A journey runs from fresh state by its recipe,
  through the product's own interface, with no test helper or fixture.
- STATUS: FAIL if any criterion, check or PRIOR finding fails; UNKNOWN if any lacks evidence; else PASS.

## researcher
- Answer GOAL in `docs/research/<date>-<slug>.md`: start from the repo's pinned versions, cite
  primary sources, recommend one of two or three options. Offline, mark claims `unverified`.

## spec-architect
- Write `.sdd` files in the vocabulary of `.specdd/bootstrap.md` (sprint 1: write it and the root
  `.sdd` first, from GOAL's templates). Touch nothing else; do not commit.
- One module per `<dir>/<dir>.sdd`: `Purpose`, `Owns` (never overlapping), `Exposes`, `Must`,
  `Done when` (testable, ending `(FR-…, AC-…)`). Supersede a spec by rewriting it.
- Encode the plan's decisions; invent none. Before OPEN: `CHANGED: <files>`.

<!-- The builder's reproduce-first rule and tests never to write, and the reviewer's smells, are adapted from Matt Pocock's skills (mattpocock/skills, MIT). -->
