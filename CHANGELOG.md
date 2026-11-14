# Changelog

All notable changes to this project are documented here. Entries before 0.30.0 are in git
(tag `v0.29.4`).

## 1.3.0 - 2026-11-14

Removes the one script that branched by OS, and makes "files say only what is true now" a rule
of the stack. Each rule here was kept only because the PM got its scenario wrong without it; the
scenarios and results are in `docs/evals.md`.

**Removed**
- **`heavy.sh`**, with the plan's `heavy:` field, the brief's `HEAVY:` line, the copy the
  scaffold made under `.git/bstack/` and the doctor's check for a stale copy. It branched by OS,
  and most projects run one builder at a time. A rule takes its place: a check that fails and
  then passes on a rerun is still a Fix item, with the failed run's text, and if it timed out
  while other builders ran, the PM also cuts to one builder at a time. The plugin's five scripts
  now run the same on every OS.

**Current files**
- Files say only what is true now, and git keeps what was. When a change makes text false, the
  PM rewrites or deletes it in place: a dropped requirement goes with its rows and any story
  never dispatched, with no dated note or `withdrawn` line left behind. The retro corrects a
  wrong `AGENTS.md` line where it stands instead of adding one beside it.
- A new project's `AGENTS.md` opens its Conventions with the same rule, so every child reads it.
  The PM proposes it as a diff to an existing `AGENTS.md`.
- `/bstack:doctor` warns on struck-through text or "superseded", "withdrawn", "formerly" or "no
  longer" in the plan, the spec or `AGENTS.md`.
- The files the PM writes to run a project are called PM records, where 1.2.0 said "state
  files". State is what git and a story's `pm-exec` line say. Nothing behaves differently.

**The plan's design**
- `## Design` replaces the plan's free-text `## Architecture`: decisions with the option each
  rejected, contracts, state and invariants, and flows that end in the main failure and its
  recovery. It is sized to the risk, and links a schema, a `.sdd` file or the spec instead of
  copying it.
- Once the project has shipped, after acceptance and any release, the PM cuts `docs/plan.md`
  down to the platform's documentation: Overview, Scope, Requirements, Design, Acceptance and
  the Risks that still hold. The delivery sections go; the completion report and git keep them.
  A later project reopens the same file.

**Sprint boundary**
- A sprint in which one story merged skips the cross-story review: that story's own review saw
  the same diff.

**Merge guard**
- It refuses a story merge that carries `--git-dir`, `--work-tree`, `GIT_DIR` or
  `GIT_WORK_TREE`. Run from outside the project, such a merge used to pass unchecked. `cd` and
  `-C` remain the ways to name the repository.
- A second `-C` resolves against the first, as git does; it used to resolve against the working
  directory.
- The README's Requirements name what the guard needs to read its input: `jq`, `python3` or
  `node`.

**Upgrading**
- From 1.2.0: delete the `heavy:` line from the plan's `## Delivery`; nothing reads it. The copy
  of `heavy.sh` under `.git/bstack/` can go too.
- An existing plan: rename `## Architecture` to `## Design`, and give it the four parts when
  the design next changes.
- Run `/bstack:doctor` to see the new warning. The PM cleans a file only when a task touches it.

## 1.2.0 - 2026-11-13

Adds the guardrails, phases and message formats that a long production run under bstack's
predecessor showed were missing. Each change is a template field, a script or a hook before it is
prose. Each was kept only if a pressure scenario showed the PM getting it wrong without it, and
right with it. The results are in `docs/evals/2026-11-13-v1.2.md`. `project-manager/SKILL.md` is
smaller than in 1.1.1, and so is every child's dispatch.

**Floors and waivers**
- **`## Floors`** replaces the hard rules at the top of `SKILL.md`. No `AGENTS.md` line, plan,
  project rule or deadline lifts them: no merge on a red integration gate (except a story tagged
  `fixes-gate`), no merge with an open `block` or `major`, gates run by the PM on the merged tree
  and recorded with the sha, an opposite-family reviewer, no secrets in files and no push without
  asking, and the open go/no-go items and what a date or scope change skips, shown before the PM
  agrees to it.
- **`## Waivers`** in the plan is the only way to waive anything else the references require (the
  verifier, tests first, a second reviewer, the full suite). The retro shows every row each sprint.
- **Rule changes** the PM proposes wait as `pending rule:` log lines until the retro; one the user
  asks for applies at once.

**Scripts and the hook**
- **Merge guard** (`hooks/hooks.json`, `scripts/merge-guard.sh`), a PreToolUse hook on Bash. It
  refuses `git merge … pm/<story>` in a bstack project unless the story's `pm-exec` records
  `gates: PASS <sha>` and `verifier: PASS <sha>` (or `WAIVED` with a Waivers row) that cover the
  branch head, and `review: PASS <sha>` followed only by state commits or clean merges of the
  base; the target branch holds nothing the story has not merged; `docs/gate.txt` is not `FAIL`;
  and the call merges one story only, never a bundle. Only the user may set `BSTACK_NO_ENFORCE=1`. It reads its input with jq, python3 or
  node, and splits the command as the shell quotes it. It also refuses a story merge that follows
  a branch switch in the same call, and, in a bstack project, a story named through `eval`,
  `sh -c`, `git pull` or an alias, and a story merge in a repository it cannot name
  (`-C "$repo"`). It exits on the raw input before decoding, so a machine without jq, python3 or
  node still runs every other command. It catches mistakes, not an agent set on getting past it.
  For `gh pr merge`, the PM puts the same merge to the guard first (`host.md`), and
  `/bstack:doctor` checks that the guard refuses a sample merge.
- **`heavy.sh`**: an N-slot semaphore for tests and builds across every worktree (`flock`, or
  pid symlinks where `flock` is missing, as on macOS), reporting the load before and after. The
  PM drops to two builders while the load stays over the core count.
- **`ledger.sh`**: one row per reviewed story's outcome in `docs/ledger.md`: merged, blocked,
  replaced or abandoned, with its lineage (the root of its `Replaces:` chain), all fix rounds, the
  review-driven ones, first-pass (merged with no review-driven round), and wall time and model per
  role from each child's run in `t3_thread_read`. It records no tokens: T3 does not report them,
  and having the PM track them would take its attention off the work.
- **`hygiene.sh`**, run by `/bstack:doctor`: an `AGENTS.md` over 32 KiB, an integration branch
  over 200 commits or 14 days ahead of main, tags missing from main, branches and worktrees of
  merged stories, untracked or ignored scripts outside a tracked `ops/pm/`, and a stale copy of
  `heavy.sh`.
- `check.sh` now enforces the token budgets: `SKILL.md` at most its 1.1.1 size, `acceptance.md`
  and `release.md` at most 4 KB, and each role's dispatch under its 1.1.1 soul.
- A scan-secrets test that could never fail ("the hit output omits the value") now can: under
  `pipefail` the scan's own exit code decided it.

**Phases**
- **Acceptance** (`references/acceptance.md`, loaded at a release candidate). The plan's REQUIRED
  `## Acceptance` names up to 5 journeys with fresh-state recipes, and for a replacement or
  migration defines "no visible change" and its parity check before any story. Each sprint closes
  only after the journeys pass from fresh state with no test helper (`retro.md` `## 0`). A release
  candidate freezes a sha; the user walks it and accepts each difference by name, recorded in
  `docs/acceptance.json` as the plan is in `docs/approval.json`. Accepted differences are listed
  in `docs/acceptance-differences.md`, a state file, so recording one keeps the release candidate.
- **Release** (`references/release.md`, loaded only with `Release: production`). Go/no-go is
  binding (`docs/go-no-go.md`): a waived item moves the date. The release ships with the new
  behaviour switched off. Rehearsal runs on the production service units, and the rollback is
  rehearsed. A clock-timed step runs on a system timer or by a named person, never on the PM's
  wake-up. Tags must be on main and the integration branch.
- **Sprint demo**: the sprint report leads with what the user can try, where, and the acceptance
  status. The PM then writes `docs/handoff.md` and the user continues in a fresh thread.

**Messages**
- **One brief** for every role: `## Common` (once, not four lines in every soul), the role's
  soul, then a fixed-key header (`BRIEF <story> <role>`, `BASE`, `GOAL`, `DONE WHEN`,
  `TOUCHES`/`PROTECTED`, `OUT OF SCOPE`, `PRIOR`, `HEAVY`). Round, model and effort stay in the
  dispatch target, key and `pm-exec`, out of the child's text. A review brief is neutral: no
  builder, no expected verdict, and PRIOR a plain numbered list.
- **One reply format** for every role, replacing the builder's JSON and the separate reviewer and
  verifier formats: `STATUS`, `COMMIT`, `CRITERIA`, `CHECKS` (with reruns and the failed run's
  error text), role lines, `OPEN`. A reply without STATUS, the head COMMIT or a CRITERIA line per
  item goes back and spends no round.
- Fixed formats for the Fix list, the escalation (at most 6 lines, with options, their cost, what
  each skips and a default) and the handoff. Story criteria carry `| proof: <command> ->
  <expected>`; stories gain `User-visible:`, `Design review:` and `tags`. The plan gains
  `Active goal:`, `PM model:`, `Release:` and `heavy:`.

**Models**
- **One table** in `roles.md` replaces the scattered defaults. The builder is `claude-opus-5-5`
  high for every build, fix and tests-only brief (fallback `gpt-6-astra` high). The design review,
  new before a storage, data-model, migration or versioning build, is `gpt-6-astra` high. The
  reviewer is the other family at high, the verifier and spec-architect `claude-opus-5-5` high,
  the researcher `gpt-6.1-sol` high. Every dispatch sets model and effort, and effort never rises
  on a retry. A builder on its fallback flips the reviewer, so the families stay opposite.
  `/bstack:codex` follows the table.
- `pm-meta.builder` (`auto`, `claude`, `codex`) is gone; old stories that carry it still work.

**Moved**
- The "why one reviewer" calibration note moved from `loop.md` to `docs/review-calibration.md`.

**Upgrading**
- From 1.1: `pm-exec` gains `gates`, which the PM writes at each ship, so the merge guard refuses
  a story until it is gated and recorded. An existing plan takes the new fields (`Active goal:`,
  `PM model:`, `Release:`, `heavy:`, `## Acceptance`, `## Waivers`) through "Change after
  sign-off"; until `heavy:` is set, briefs leave out `HEAVY:` and commands run unwrapped. Run
  `/bstack:doctor` to see the hygiene warnings.
- From `deliver`: the rename in 1.0.0 means a `deliver` install never updates to bstack by itself.
  Remove it with `/plugin marketplace remove deliver`, then install as the README says (see 1.0.0).

## 1.1.1 - 2026-11-11

Fixes what the board found when it first met on its default seats, in this repository on
2026-11-11: sponsor `claude-opus-5-5` high, engineering `gpt-6-astra` xhigh, customer
`claude-fable-5-2` medium, chaired by `claude-opus-5-5` medium. It scored 1.1.0 7/10, with all
three seats behind the first two fixes below. After the fixes, a `quick` meeting on the default
seats in a small PM-managed project ran the managed path end to end: the gates, the minutes in
`docs/board/`, an 89-character log line that `log.sh` accepted, and the `docs(board)` commit.

**Fixed**
- **The log line fits `log.sh`.** The chair's `Log:` line had no length limit, and `log.sh`
  rejects anything over 100 characters, so a meeting in a managed project could fail at its last
  step. The chair now keeps the line to 100 characters, and if one is still too long the
  convening session shortens the recommendation, never the scores.
- **A soul is pasted whole.** "From its first line through **Returns**" read as stopping at the
  Returns item's first line, and the chair in that meeting dropped the member soul's round-2
  `Changed` or `Held` line. The board's member soul now runs to the end of `souls.md`, and the
  PM's souls to the last line of their Returns item.
- **One meeting, one id.** The meeting stamp gains seconds, `YYYYMMDD-HHMMSS`, and a stamp whose
  minutes already exist is replaced, so two meetings cannot share dispatch keys or a minutes file.

**From a review of the board** (Codex `gpt-6.1-sol`; the skill shipped in 1.1.0 unreviewed)
- **Managed meetings run in the main checkout.** `log.sh` writes to the main checkout's log, so
  minutes committed from a linked worktree would leave the log line behind. A managed meeting
  convened from a linked worktree now stops and names the main checkout.
- **Gates that write are reported.** The chair compares `git status` before and after the gates.
  It reverts nothing, and lists any file they changed in the brief and the minutes.
- **No score leaks into round 2.** A member names its number only on its `Score:` line, and the
  chair strips any other score from the statements it relays.

## 1.1.0 - 2026-11-11

Adds the board, and fixes what an assessment of 1.0.2 found between the prose and Claude Code,
git and GitHub.

**The board**
- **`/bstack:board`.** Three stakeholders meet about the project, each a T3 child on its own
  model: a sponsor (`claude-opus-5-5`, high), an engineering lead (Codex `gpt-6-astra`, xhigh) and
  a customer (`claude-fable-5-2`, medium). With no arguments they score how well placed the
  project is to reach its next milestone, 0 to 10, and recommend what to do.
  `/bstack:board ask <question>` puts a question to them instead.
- **The meeting.** Round 1 is blind. In round 2 each member reads the other two statements, with
  scores and model names removed, and holds or changes its own. The board's score is the median,
  shown with all three; a gap of 3 or more is reported as a split, and dissent stays in the
  minutes.
- **A chair of its own.** A fourth child (`claude-opus-5-5`, medium) runs the gates once for
  everyone, writes the brief, holds both rounds, tallies and writes the minutes, with no vote.
  The session that convenes the meeting passes a stamp, the baseline and the seats, and receives
  the verdict in about twenty lines: a PM mid-sprint keeps its context, and neither the brief nor
  the tally comes from the agent whose work is being judged. The chair reads its soul from
  `skills/board/souls.md` itself, so the souls never enter the convening session either. Tried
  once end to end on small models: two rounds, one seat changed its score, and the convening
  session was woken once, with the verdict.
- **Advisory, and the user's to convene.** The PM never calls it. A recommendation inside the plan
  is the PM's to adopt and log; one that changes the plan goes through the change path.
- **Options.** `quick` holds round 1 only at lower effort. `<seat>=<model>[:<effort>]` reseats a
  member or the chair. A missing model stops the meeting before it starts; nothing is substituted
  unasked.
- **Record.** Minutes go to `docs/board/` with a log line and a commit in a managed project, and to
  `tmp/board/` anywhere else.
- **Why this shape.** Opus 5.5 and Astra were each asked for a design. Both, and the author,
  arrived at distinct seats, a blind first round, a chair without a vote and the median. The
  separate chair was the owner's change to that design. The souls live beside the skill, not in
  `roles.md`, which the PM reads on every dispatch.

**Fixed**
- **Plugin paths in references.** Claude Code substitutes `${CLAUDE_PLUGIN_ROOT}` only in a
  `SKILL.md` body and never sets it in the shell, so the 14 uses in `references/*.md` reached the
  PM as literal text and `bash "${CLAUDE_PLUGIN_ROOT}/scripts/log.sh"` failed as written. The
  references now write `<plugin>`, and every skill defines it from its own resolved path.
- **A false positive could block a story for good.** The merge-time scan had no allowlist and no
  bypass. `.scan-secrets-allow` now takes `<pattern name> <path glob>` lines. A range scan reads
  it from the base ref and a push from the destination's default branch, never from the work
  tree or the branch being checked, so no branch can allow its own hit; the PM adds a line only
  on the user's yes.
- **A hit on the integration branch blocked unrelated stories.** A merge commit used to count
  everything it brought in. It now counts only what differs from every parent.
- **PR mode did not close.** It now requires merge commits and checks for them, carries the PM's
  state commits to the remote inside each PR, accepts a verifier sha when only `docs/` state
  changed after it, replaces `git pull --ff-only` with a fetch and a merge that works when the PM
  committed in the meantime, detects a squash or rebase merge and stops, and says how the last
  state commits of a sprint reach the remote.
- **A crash could spend a fix round on nothing.** A fix round's send now carries the key
  `<id>-fix-<round>`. T3 answers a reused send key with the first send, so resume re-sends
  safely and never gates a result older than the round.
- **A review could be stale.** The reviewer's result starts with `COMMIT: <sha>`; a review counts
  only when that is the branch head.
- **Fresh worktrees could not run the gates.** The plan and `AGENTS.md` gain a `setup` command.
  The builder runs it first, the PM runs it before gating when it has to, and `/bstack:doctor`
  reports `UNKNOWN` when gates need dependencies and no `setup` is recorded.
- **Dead pointers.** poteto's `PORT.md` and README named the removed `scripts/validate.sh`.
  `loop.md` cited "Spec §9" without saying the spec lives in the bstack repository.

**Changed**
- **The scan covers more.** New formats: Stripe live keys, GitLab, npm, PyPI and SendGrid tokens.
  Commit messages are scanned. The README now says what the scan does not catch.
- **Hook managers.** With `core.hooksPath` set, the PM used to ask the user what to do. It now
  installs the copy and proposes the one-line call for husky, lefthook or another manager;
  `/bstack:doctor` reports `OK` once that call is there.
- **`role` on every dispatch.** `host.md` maps each soul to a `delegate_task` role.
- **Automated checks are back, small.** `.github/scripts/check.sh` enforces the `AGENTS.md`
  conventions, runs shellcheck and runs `test-scripts.sh`, 43 cases for the two plugin scripts.
  A workflow runs it on Linux and macOS. This reverses 1.0's "no `validate.sh`, no CI" at the
  owner's request: the stale `validate.sh` pointers above are the drift it would have caught. The
  plugin's own code is still only `log.sh` and `scan-secrets.sh`.
- **T3 contract.** The README records the T3 Code version last checked, and CONTRIBUTING lists
  what to check again when T3 changes.
- **Ownership.** The README states that what bstack writes into a project belongs to the project.

**Existing projects**
- Run `/bstack:doctor`: it reports the installed pre-push hook as `OUTDATED` and offers the new copy.
- Add a `setup:` line to `docs/plan.md` `## Commands` and a `Setup:` line to `AGENTS.md`.
- **Update.** `/plugin marketplace update bstack`, then `claude plugin update bstack@bstack` in a
  terminal, then `/reload-plugins` or restart.

## 1.0.2 - 2026-11-10

Restores two things the 0.30.0 trim lost when the agent files were folded into `roles.md`.

- **Credit.** `roles.md` again credits Matt Pocock's skills (`mattpocock/skills`, MIT) for the ideas it
  carries over: the builder's reproduce-first rule and its list of tests never to write, and the
  reviewer's split of spec and standards findings and its smells. `planning.md` and `retro.md` kept
  their credit lines throughout.
- **Reviewer smells.** The reviewer returns up to five one-line `minor` smells with `file:line`: shapes
  that will cost the next change, such as a function doing several jobs, a duplicated block, a flag
  argument, or a test mirroring the code. The old code-integrity reviewer had this; the trim dropped it.
- **Update.** `/plugin marketplace update bstack`, then `claude plugin update bstack@bstack` in a
  terminal, then `/reload-plugins` or restart.

## 1.0.1 - 2026-11-10

Packaging only: the six entry points become skills. No behaviour changes.

- **Why.** Claude Code's plugin reference now marks a plugin's `commands/` directory as legacy
  ("use `skills/` instead"), and hosts that list only `skills/` did not show the entry points.
- **Skills.** `commands/<name>.md` moved to `skills/<name>/SKILL.md` for `pm`, `resume`,
  `doctor`, `retro`, `codex` and `skeleton`. Each has a `name`, its old `description` and, where
  it takes arguments, an `argument-hint`. The invocation is unchanged: `/bstack:<name>`. Claude
  can also load them on its own, which `/bstack:codex ask` needs when the PM asks Codex for a
  second opinion.
- **Paths.** Each entry-point skill resolves `references/…` from
  `${CLAUDE_PLUGIN_ROOT}/skills/project-manager/references/`, carries the project-manager skill's
  child guard, and says it runs that skill's procedure. The template paths in `state.md` and
  `retro.md` now start with `${CLAUDE_PLUGIN_ROOT}/templates/`.
- **Wording.** "Commands" become skills in `SKILL.md`, the five role guards, the README,
  CONTRIBUTING and AGENTS.md, which gains a convention: entry points are skills, no `commands/`.
  The marketplace's poteto entry now says 24 principles, as poteto's own manifest does.
- **Triggers.** `project-manager` is the skill Claude picks for a delivery request; `pm`'s
  description now says it is only the explicit `/bstack:pm` entry point, so the two don't compete.
- **Update.** Run `/plugin marketplace update bstack` to refresh the catalogue, then
  `claude plugin update bstack@bstack` in a terminal to update the installed plugin, then
  `/reload-plugins` or restart the session.

## 1.0.0 - 2026-11-08

deliver is renamed bstack. The behaviour is the 0.30.0 behaviour; only the name changes.

- **Plugin and marketplace.** Both are named `bstack`; the plugin lives in `plugins/bstack`.
- **Commands.** `/deliver:*` becomes `/bstack:*`: `/bstack:pm`, `/bstack:resume`,
  `/bstack:doctor`, `/bstack:retro`, `/bstack:codex` and `/bstack:skeleton`.
- **Repository.** It moved to `bendusz/bstack`; the old `bendusz/deliver` URL redirects.
- **Pre-push hook marker.** `scan-secrets.sh` now carries `# bstack secret-scan pre-push`.
- **Reinstall.** Remove the old marketplace, which also uninstalls the `deliver` plugin (and
  `poteto`, if you had it):

  ```
  /plugin marketplace remove deliver
  ```

  Then run these two steps separately, as the README says:

  ```
  /plugin marketplace add https://github.com/bendusz/bstack
  ```

  ```
  /plugin install bstack@bstack
  ```

  Reinstall `poteto` with `/plugin install poteto@bstack` if you use it.
- **Existing projects keep working.** Their files carry no plugin name, except an installed
  pre-push hook with the old `# deliver secret-scan pre-push` marker. `/bstack:doctor` recognises
  it as an outdated copy and offers to refresh it.

## 0.30.0 - 2026-11-07

deliver is trimmed back to the PM discipline and becomes T3-first: it now requires T3 Code. Most
of what is gone existed to restrict agents. This release trusts the agents, relies on T3 for
dispatch, worktrees, messaging and PR watching, and treats git as the safety net: every change is
a diff the user can read and revert.

**Removed**
- **Agents.** All 17 `agents/*.md`. The roles live in `references/roles.md` as souls the PM pastes
  into each T3 `delegate_task`, since a T3 child sees only its task text.
- **Hooks.** The whole `hooks/` directory: the sign-off, verified-merge and secrets guards and the
  session-start hook. Sign-off is now a conversation step recorded in `docs/approval.json`, and
  the git secret scan below replaces the write-time secrets guard.
- **Scripts and code.** The Codex runner, `holdout.mjs`, `test-integrity.mjs`, `retro-stats.mjs`,
  `assurance.mjs`, `agent-evals.mjs`, the builder benchmark scorer, both schemas and every
  node:test suite. Codex now runs as a T3 child.
- **Review machinery.** Tiers, calibrated panels, the trust report, test-integrity checks,
  holdout refs and the `benchmarks/` corpora.
- **References and commands.** Twenty-four references are merged into seven (`planning`, `loop`,
  `roles`, `host`, `state`, `retro`, `skeleton`) or dropped. Thirteen commands go: specify,
  clarify, constitution, analyze, checklist, correct-course, handoff, codex-help, codex-review,
  benchmark-builders, agent-evals, calibrate and improve.
- **Templates.** HANDOFF, log, constitution, the four checklists, claude-settings-hardening,
  verification-report and the three wiki templates.
- **Repo.** `scripts/validate.sh` and the other maintainer scripts, the CI workflow,
  `docs/plans/` and `docs/specs/` up to 0.29.4, `docs/codex-cli-reference.md`,
  `docs/model-tiering.md` and `examples/todo-cli`. Older design history stays in git.
- **Handoffs, the heartbeat, the actor id and the Node.js requirement.** `/deliver:resume` and T3
  thread persistence cover what they did.

**What replaces it**
- **Five roles.** builder, reviewer and verifier, plus optional researcher and spec-architect,
  each with ground rules, a return shape and a recommended default model the PM may override.
- **Six commands.** `pm`, `resume`, `doctor`, `retro`, `skeleton`, and `codex`, which merges
  codex-review (`/deliver:codex review`) and codex-help (`/deliver:codex ask`).
- **A tracked decision log.** `docs/log.md`, appended only through `scripts/log.sh` (one
  `YYYY-MM-DD HH:MM  <message>` line, with a message of at most 100 characters) and committed
  with the PM's next commit. It replaces the gitignored `tmp/log.md`.
- **A secret scan in git.** Passwords and keys must not leave the machine. `scripts/scan-secrets.sh`
  blocks a high-confidence token format (AWS access key, private key
  header, GitHub, Slack, `sk-` API key, Google API key, JWT) in added lines or paths; the broader
  `sk-`, Slack, Google and JWT formats must start a word, so identifiers such as `task-…` pass.
  It names the commit, file, line and pattern, never the value, redacting a token in a path.
  The PM installs it as the project's pre-push hook at scaffold, where it scans every pushed
  commit the destination remote lacks, and runs it on every commit of a story branch before the
  merge. Each commit is diffed as text, binary or not; any error blocks too.
  `/deliver:doctor` reports the hook as current, missing, outdated or bypassed by
  `core.hooksPath`. It runs in git, so it covers every agent and provider. No agent passes
  `--no-verify`; only the user may. Credential-assignment patterns are not ported: they caused
  most false positives. Secrets coming in still go through `request_secret`. `log.sh` and
  `scan-secrets.sh` are the plugin's only code.
- **SpecDD is optional** and off by default (`Skeleton: none` in the plan).
- **Conventions by hand.** With `validate.sh` gone, `AGENTS.md` lists the checks a reviewer makes.

**The calibration result kept.** The 2026-10-25 calibration measured one panel for both targets:
a single Codex generalist lens met the 10% and 5% miss targets with a miss-rate upper bound of
4.44% and no false positives, and the Claude specialist lenses added no measured coverage. That is
why the default is one opposite-family generalist reviewer, with an optional `focus:` line for
design, security or performance. The measured lens was Codex's own review prompt through the old
runner; the reviewer soul run as a T3 child is uncalibrated.

**Projects managed with 0.29 or earlier** are not migrated. Old `pm-exec` fields are ignored, and
handoff files and holdout refs are inert. To clean them up:
- `git for-each-ref --format='%(refname)' refs/deliver/holdout | xargs -n1 git update-ref -d`
- `git rm -r docs/handoff`
- If you want the old log's history, move the content of `tmp/log.md` into `docs/log.md`.
