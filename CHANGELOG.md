# Changelog

All notable changes to this project are documented here.

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
a diff the user can read and revert. The design is `docs/specs/2026-11-07-v1.0-bstack-redesign.md`.

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

## 0.29.4 - 2026-10-27

Inside T3 Code, Codex runs through T3 itself. Without T3 nothing changes.

- **Codex goes through T3.** When the T3 probe succeeds, every Codex call (build, fix, review,
  advice, and research) goes to T3's Codex delegation instead of the Sonnet wrapper agents.
  `host-t3.md` gives the steps: get the prompt, snapshot the checkout, call T3 with the runner's
  model and an explicit effort, compare, then run the usual scope check, integrity check, and gates
  after a build. If T3 refuses or fails, or there is no repository, the PM falls back to the
  wrapper and records it.
- **`run.mjs --snapshot` and `--snapshot-compare`.** The runner's own before/after checks for a
  child T3 runs, with no codex launch. They cover the whole checkout from its root: file bytes on
  disk, ignored files, protected PM artifacts, and git metadata (hooks, refs, config, index flags,
  worktrees, `info/exclude`). A read-only run fails on any change, and a build fails on what a real
  build would. The hand-run git snapshot commands are gone: they missed `.git/` and ignored files.
- **`run.mjs --emit-prompt`.** It makes the same checks as a real run, prints the exact prompt
  plus the mode's model, effort, working directory, and whether the run is read-only, and never
  launches codex. Build and fix prompts carry the result schema inline, and read-only prompts
  carry a report format and a no-write instruction.
- **Honest calibration.** A Codex review through T3 is recorded as `codex-reviewer-t3`. It meets
  the opposite-family rule but is not the calibrated lens, so its tier runs the maximum panel and
  `retro-stats.mjs --trust` withholds that tier's bound. A new test proves it.

## 0.29.3 - 2026-10-27

Documentation consistency: the references now match what the hooks and scripts do. No code changes.

- `environment.md` and `host-t3.md`: the remote-PR check confirms the claim fields and compares
  against the remote the PR targets, not `origin`; `codex-reviewer`'s role defers to
  `review-gates.md`.
- `review-gates.md`: the real stamp inputs, `retro-stats.mjs --trust` as the stamp check, and the
  maximum panel for a legacy claim with no `tier`.
- `implementation-loop.md`: a legacy pre-0.29 claim passes the hook with no verdict check.
- `state.md`: `integrity` is absent at `T0`.
- `decomposition.md`: `integrity_allow` added in flight goes on the integration branch.
- `host-t3.md`: a `wip(<id>): blocked` commit may hold out-of-scope paths.
- 0.30 is postponed, not dropped; its open design points stay in the 0.29 plan's backlog.

## 0.29.2 - 2026-10-26

Trimmed back. 0.29.1's git-level merge gate is removed: it grew to about 3,000 lines of hook code to
cover rare merge routes, which is more machinery than a workflow skill should carry.

- **The git-level merge gate is gone.** `git-hook-install.mjs`, `git-merge-gate.mjs`, and their tests
  are deleted. The ship gate is again Claude's Bash `PreToolUse` hook (`require-verified.mjs`), as of
  0.29.0 plus its shell-parsing fixes: it blocks Claude from merging an unverified story. A merge
  made outside Claude (a terminal, an IDE, a remote PR) is not checked by a hook; the PM checks a
  remote PR by hand before merging, as `environment.md` describes.
- **Upgrading from 0.29.1.** Session start deletes the hook shims and copies 0.29.1 installed (only
  files carrying deliver's marker) and unsets `deliver.mergeGate`, and says so once.
- **Kept from 0.29.1:** the `host-neutral` test (deliver runs unchanged without T3 Code) and the
  `/deliver:analyze` fixes to `review-gates.md` and `fix-loop.md`.
- **v0.30 is dropped.** No unattended runner, sandbox profile, or telemetry pipeline is planned.

## 0.29.1 - 2026-10-26

The ship gate moves into git itself, so a merge of an unverified story is refused whatever command
makes it, and deliver is checked to run unchanged without T3 Code.

- **A git-level ship gate behind the Bash hook.** Session start installs a git hook in deliver
  projects: `git-hook-install.mjs` writes a `reference-transaction` shim marked
  `# deliver-merge-gate v2` (git 2.28 or newer; below that, `pre-merge-commit` and `pre-commit`,
  which miss fast-forwards), never over a hook it did not write. For an existing hook it prints
  lines to chain in, or an sh wrapper for a non-sh or symlinked hook, and every generated shim is
  checked with `sh -n` before it is installed. Git runs `git-merge-gate.mjs` on every update of an
  integration branch, which judges the stories the update brings in with the Bash hook's own
  verdict and requires any merge on top of a story to be git's automatic merge apart from the
  story file. Merges, fast-forwards, pulls, rebases, resets, `update-ref`, amended merges,
  `git push .`, and hand-finished conflicted merges are all judged. Cherry-picks and squash merges
  of a story are found by patch id and refused: merge the story branch itself with `--no-ff`.
  Rewriting shipped story history must keep the code exactly; use `git pull --no-rebase` or
  `--rebase=merges`, since a plain `--rebase` that flattens a story merge is refused. A fetched
  integration head is trusted only for the pull now running, from the designated remote. A
  refusal exits 86 inside the shim and 1 to git; any other failure of the gate warns and lets the
  update through, so a broken node never blocks a repository. The merged-tree comparison needs git
  2.38; on 2.28 to 2.37 it alone is skipped and reported.
- **Uninstalling.** `node <plugin>/hooks/git-hook-install.mjs --uninstall <project>` removes the
  shims and sets `git config deliver.mergeGate off`, which session start honours until an explicit
  install. `/deliver:doctor` checks and repairs the install, and reports a chained hook that is not
  executable, has CRLF line endings, or holds stale lines.
- **The Bash hook reads more of the shell.** Clustered short options (`-qm "msg"`) consume their
  values, per subcommand, and every value-taking option was checked against `git <cmd> -h`. Only a
  `status`, `log`, `diff`, `show`, or `rev-parse`, or a plain checkout or switch, may precede a
  story merge in the same command; run any other merge as its own command.
- **Several projects in one repository.** A story several projects claim must be verified in
  each. `Escaped-From:` accepts `<project-path>/<story-id>`, and holdout checks live on
  `refs/deliver/holdout/<project-key>/<story-id>`. The plan's integration branch is parsed whole
  and validated with `git check-ref-format`; an invalid or missing branch is reported.
- **T3 Code stays optional.** When the host probe fails, deliver runs unchanged under plain Claude
  Code. The new `host-neutral` test fails if a T3-only step leaves `host-t3.md` or loses its
  condition, or if the hooks depend on T3.
- **Documentation consistency.** `/deliver:analyze` ran over the changed references (0.29
  acceptance item 6). Its four P2 findings are fixed: a measured panel runs only when its bound
  meets the plan's target, fix rounds re-review with the risk lenses too, a Codex review that fell
  back to another model counts as the calibrated lens missing, and the claim step pulls with
  `--no-rebase` or `--rebase=merges`. The P3 findings are listed in the plan's backlog.
- **Known limits.** Out of scope remain deleting the hook, overriding `core.hooksPath`,
  `DELIVER_NO_ENFORCE=1`, a fast-forward on git older than 2.28, and pushing straight to the
  remote. The gate catches a PM's honest mistakes; it is not a boundary against an agent that
  evades it on purpose.

## 0.29.0 - 2026-10-25

Autonomous trust: review strength is measured per risk tier instead of assumed, the builder can no
longer move its own oracle, and deliver runs a project on its own inside T3 Code.

- **Assurance is measured per tier.** Each story gets a `Tier` from what it changes: `T0` (docs,
  comments, copy, configuration with no behaviour change), `T1` (ordinary behaviour change), or
  `T2` (auth, crypto, secrets, money, migrations or deletion, public API or schema, untrusted
  input, dependencies).
  The default targets are 10%, 5%, and 2%, each a 95% one-sided Clopper–Pearson upper bound on the
  rate at which a seeded defect escapes the whole panel. A project changes them with the plan's
  Delivery mode line `- Assurance targets: T0=0.10, T1=0.05, T2=0.02`. Calibration selects each tier's cheapest panel on a `select` split and certifies
  its bound on a separate `certify` split, so picking among many panels does not break the 95%
  claim. No review is reduced without a measured bound, save one named exception below. A tier the
  corpus cannot measure runs the maximum panel: every lens, the opposite-family reviewer on the
  first review and every fix round, and two trials of `code-integrity-reviewer` at `T2`. The tier
  sets review depth only; `Risk` still decides which merges escalate.
- **An assurance corpus and `/deliver:calibrate`.** `benchmarks/assurance` holds batch 1 plus
  the three batch-0 examples: 102 seeded cases (36 select, 66 certify) across eight defect classes
  and 26 clean cases (11 select, 15 certify), written by Claude and Codex authors and pinned by its
  own `MANIFEST.sha256`. Each
  seeded case has a witness test that fails with the defect applied and passes with the clean
  patch, and `validate.sh` runs every witness both ways. `/deliver:calibrate`, for maintainers,
  runs the lenses over the corpus, records each trial with `scripts/assurance.mjs`, and writes
  `panels.json`. A panel goes stale when a lens's model, effort, or prompt changes, or the corpus
  changes. At this corpus size `T2` stays unmeasured; it needs about 150 certify cases.
- **The trust report replaces reading the diff.** Every checkpoint report, at every scale, opens
  with `retro-stats.mjs --trust`; under the fully autonomous policy it runs at each sprint boundary
  into `tmp/log.md` and goes into the completion report. It prints stories shipped per tier, the
  panel each tier ran, the stories reviewed below panel, the calibrated bound or "unmeasured,
  maximum panel", first-pass stories (no fix rounds, no retries), fix rounds, integrity blocks,
  holdout failures, and observed escapes. A tier with any story below panel has its bound
  withheld. A fix for a defect an earlier story shipped carries an `Escaped-From: <story-id>` trailer. A tier is OVER TARGET when at least one escape
  was observed since the calibration in force and the escape bound over those stories exceeds the
  target; the PM reads the report at sprint start and runs that tier at the maximum panel until
  `/deliver:calibrate` re-runs.
- **Protected acceptance tests and holdout checks.** At `T1` and `T2`, `test-engineer` writes the
  red acceptance tests before the build, and the Execution block lists them under `protected`. Any
  change to a protected path fails the scope check, and the Codex runner refuses it. At `T2`, `test-engineer` also writes extra
  acceptance checks, which the PM stores with `scripts/holdout.mjs` on the private ref
  `refs/deliver/holdout/<story-id>`. The ref is never checked out or pushed, and no builder brief
  names it. The PM runs the checks beside the verifier, and a failure is a `FAIL`.
- **New `scripts/test-integrity.mjs`.** At `T1` and `T2`, the PM runs it after every writer run.
  It fails on a deleted or renamed test file, added skip or focus markers, a net drop in
  assertions in a modified test, weakened coverage thresholds, lint rules, `tsconfig` strict
  flags, or toolchain versions, added disable or ignore pragmas (`pragma-added`), and any change
  to a protected path. A story that needs one of these declares it in
  `pm-meta` as `integrity_allow`.
- **A mechanical ship gate.** The new `require-verified.mjs` hook blocks a `git merge` of a `pm/*`
  branch into the integration branch unless the Execution block records `verifier: PASS <sha>`
  and, at `T1` and `T2`, `integrity: pass <sha>`, for the branch tip or an ancestor followed only
  by story-file and handoff commits, or by merges of the integration branch that git would make
  automatically. It reads `tier`, `deliver`, and `protected` from the
  integration branch's copy, never the story branch's. It fails open on unreadable hook input,
  with the kill switch set, or outside a deliver project; the hook header lists the remaining
  known limits. It catches a PM's honest mistakes, such as
  a forgotten verification or a stale verdict. It is not a boundary against an agent that evades
  it on purpose. The merge's own directory, after `cd` or `git -C`, identifies the project; from a
  directory that is in no deliver project (for example a monorepo root), a story-like merge blocks
  with "run the merge from the project directory, or with git -C <project>", unless the checked-out target is a non-base branch that no project integrates on. The hook does not see
  a remote PR merge. Before `gh pr merge` or a UI merge, the PM applies the same rule by hand: the
  recorded verdicts must name the PR head, or an ancestor of it followed only by story-file and
  handoff commits or automatic merges of the integration branch. `environment.md` gives the
  checks: `git merge-base --is-ancestor`, `git log --stat` for the non-merge commits, and
  `git merge-tree --write-tree` for each merge commit, passing when every conflicted path and every
  path that differs from the merge's tree is the story file, exactly as the hook allows. That path stays a residual risk.
  `DELIVER_NO_ENFORCE=1` turns it off.
- **Review is opposite-family.** The panel includes a lens from a family other than the
  builder's: an `expert-builder` story gets `codex-reviewer`, and a `codex-builder` story gets the
  Claude `code-integrity-reviewer`. A fix round written by the other family brings in the
  opposite lens for that round. Fix rounds are re-reviewed by the tier's panel. The one exception:
  when a Codex lens the panel needs is unavailable, `T0` and `T1` continue, the Execution block's
  `panel` records the lenses that ran on every review round, and the trust report counts the
  story as below panel. `T2` escalates.
- **Running inside T3 Code.** The PM probes `orchestrator_capabilities` at start and, when it
  answers, follows the new `host-t3.md`. Named `deliver:*` agents still go through `Agent`, so
  reviewers keep their read-only tools, Codex build, fix, and review stay on the bundled runner,
  and T3's `delegate_task` is used only for Codex advisory and research opinions. Deliver counts
  and prunes only its own worktrees. A blocked story no longer stops the sprint while independent
  stories remain: its tree is committed to its branch as `wip(<story-id>): blocked` and the PM
  moves on from the integration branch. A heartbeat runs `/deliver:resume --heartbeat` every 30
  minutes, remote PR mode watches the PR and re-gates locally on a CI wake, and `/deliver:doctor`
  checks the T3 setup.
- **Superpowers precedence is stated.** While deliver is active, its phases replace Superpowers'
  brainstorming, writing-plans, and subagent-driven-development. TDD, debugging, and
  verification-before-completion still apply.
- **A size guard for `SKILL.md`.** `validate.sh` fails when any `SKILL.md` exceeds 16,000
  characters, which leaves room under Claude Code's 20,000-character re-attachment limit after
  compaction.
- **Changed rules.** Relaxed: executable witnesses admit corpus fixtures instead of a person
  reading them, Codex advisory and research may run through T3's `delegate_task`, and worktree
  cleanup covers only deliver's own worktrees. Tightened: acceptance tests are mandatory at `T1`
  and up, the ship gate is mechanical, and review is opposite-family by construction, with one
  recorded exception.
- **Upgrading.** A story claimed before 0.29 passes the ship gate on the old rules when its
  `deliver` is below 0.29, or when it has neither `deliver` nor `tier` and no other story on the
  integration branch records 0.29 or later. A story with no `Tier` gets one in a commit before its
  claim. The Execution block gains `panel` and the counters `integrity_fails` and `holdout_fails`,
  default 0, and `updated` is now UTC. Without `panels.json`, every tier runs the maximum panel.
- **Calibration result.** T0 and T1 are measured: a `codex-reviewer` panel has a certified escape
  bound of 4.4% (0 escapes in 66 fresh certify cases, 95% one-sided) and 0% false positives. T2 is
  unmeasured and runs the maximum panel until the corpus reaches 149 certify cases. The bound holds
  for defects a careful reviewer can catch from the story and the diff; observed escapes correct it
  on real projects.
- **Known issues.** At the root of a repository holding deliver projects, a merge chained after
  another git command can be blocked with "run the merge as its own command", even when it merges
  no story, when the checked-out target is a base branch, an integration branch, or unknown. After a
  command that can write refs it always blocks. After a fetch, or after any other git command except
  a plain checkout or switch once a `pm/*` branch exists, it blocks unless the merge names a base
  branch. Run such a merge as its own command.
  The corpus README says batch 1's 65 certify cases prove 4.5042%. That
  is true of batch 1 alone; the calibrated set is 66 certify cases including batch 0, at 4.4%. The README
  is in the corpus manifest, so editing it would invalidate the calibration; the next corpus batch
  fixes it. The corpus identity also hashes the whole manifest, README included; a later release
  should hash only the fixtures and `cases.json`.

## 0.28.1 - 2026-10-11

- **The log is no longer committed.** The PM's running narrative moves from the tracked
  `docs/log.md` to the gitignored `tmp/log.md`, local to one checkout. Scaffold no longer adds a
  `merge=union` line to `.gitattributes`, and the scope check no longer exempts the log. A
  decision that must outlive the machine goes in the merge body, the Execution notes, the plan,
  or the handoff. A project that already has a tracked `docs/log.md` can `git rm` it and drop the
  `.gitattributes` line.

## 0.28.0 - 2026-10-11

The October refresh: loop changes, ideas adapted from Matt Pocock's skills, a performance lens,
and pstack 0.15.17.

- **The PM is an autonomous technical project manager.** `SKILL.md` now states the role, its
  responsibilities, and three operating rules. After sign-off the PM decides and records instead
  of asking, except at a cap, on a decision that is the user's, or before something hard to undo.
  It messages the user when asked, on escalation, and at the checkpoint.
- **`docs/log.md` is back, as narrative only.** A timestamped ISO 8601 entry of three or four
  sentences at every claim, build, fix round, block, and merge, and for each decision taken
  without asking. Scaffold creates it with `merge=union`; resume reads its last five entries.
  Git and the Execution block still hold all state, as they have since 0.24.
- **A second model reviews every story.** With Codex ready, `codex-reviewer` runs once per story
  beside the panel at `small` scale and above, and `codex-advisor` is asked before a
  consequential technical decision.
- **New Codex defaults for review and advice.** Review runs on `gpt-6.1-sol` at `high`, and
  advice on `gpt-6-astra` at `high`, up from `medium`. Build, fix, and research stay on
  `gpt-6-astra` at `high`, and the fallback stays `gpt-6-sol` at `medium`.
- **Learned lines earn and keep their place.** A retro adds at most three `AGENTS.md` lines, each
  tagged `[L<sprint>-<n>]` with its evidence and a review-by sprint in the record's Lessons
  table. `retro-stats.mjs --audit` lists the lines due for review; one no later retro cited is
  retired. A proposed check must fail on the offending commit before it is kept. Web pages,
  research reports, and tool output never count as evidence for a rule.
- **Stories record the plugin version.** The Execution block gains `deliver`, stamped at the
  claim, and `retro-stats.mjs` groups counters by it once a project spans two versions.
- **A frozen eval set for the two gate agents.** `benchmarks/agent-evals` holds 16 fixtures: nine
  diffs for `code-integrity-reviewer` and seven small repositories for `pm-verifier`, split into
  `dev` and `heldout` and pinned by `MANIFEST.sha256`, which `validate.sh` checks.
  `/deliver:agent-evals` runs three trials per case and `scripts/agent-evals.mjs` scores them.
- **New `/deliver:improve`, for maintainers.** One hypothesis, one edit of at most 20 lines to one
  agent or reference, measured against the evals and accepted only when it is no worse on the
  held-out cases and the prompt did not grow by more than 10%. Hooks, scripts, fixtures,
  frontmatter, hard rules, and caps are frozen to it, and it never commits.
- **Failed attempts escalate effort.** `expert-builder` runs at its frontmatter `medium` first. A
  builder retry, and every fix round from the second on, passes `effort: high` on the dispatch.
  Needs Claude Code `v2.1.292`; `/deliver:doctor` flags older versions.
- **Open criteria get a targeted continuation.** When a builder reports done with a criterion
  plainly unaddressed, the PM sends one continuation naming the open criteria, twice at most,
  then blocks the story. A continuation is neither a retry nor a fix round.
- **A bug fix lands with its regression test.** The fix brief for a failing gate or a correctness
  or security finding names the behaviour to pin. The builder writes the test, sees it fail, then
  fixes, and the PM checks the test is in the round's diff.
- **The debugger reproduces first.** It names no cause before a command has shown the failure. It
  stays read-only: it returns `NEED: <command>` and the PM runs it, which spends no round or
  retry.
- **Reviews separate "not what was asked" from "not sound".** `code-integrity-reviewer` reports
  spec findings and standards findings as two lists, then up to five `minor` smells.
- **Stories are thin vertical slices.** `decomposition.md` asks for one behaviour through every
  layer, folds layer-only stories into the first story that needs them, and splits a wide
  refactor into expand, migrate, contract. The readiness checklist checks it.
- **Retros turn mechanical mistakes into checks.** A recurrence a tool could have caught becomes
  a proposed lint rule, test, or gate; only judgement calls become `AGENTS.md` lines.
- **Retros start from numbers.** New `scripts/retro-stats.mjs` prints fix rounds and retries per
  story and per builder from the story files. `/deliver:retro` runs it and the record carries
  the table.
- **`test-engineer` names the tests never to write**: asserting on mocks, mirroring the
  implementation, reaching internals, passing with the feature deleted.
- **The app-driving check is planned.** For a UI, CLI, or service whose criteria need the running
  app, the plan carries a sprint-1 story that creates the `verify-<app>` skill, so the verifier
  stops returning `UNKNOWN` for them. `/deliver:analyze` flags its absence.
- **New `performance-reviewer` lens.** A seventeenth agent, read-only, Opus 5.5 at `medium`,
  selected for hot paths, data-access changes, unbounded loops, caching, concurrency, and stated
  budgets. Every finding names the input size at which it hurts.
- **Agent frontmatter keys are allowlisted.** `validate.sh` fails on an unknown key, so a typo
  such as `efort:` no longer drops a setting silently.
- **Prompt audit fixes.** References that told the PM to invoke `poteto:architect` and
  `poteto:blast-radius` now ask the user to run them, since both are user-invoked.
  `codex-reviewer` no longer caps its digest at 15 lines, which could drop findings. A dead
  pointer, a stale skill name, and two history leftovers are removed.
- **poteto 0.15.17**, 40 skills: adds `ketchup`, `benchmark-checklist`, and three principles.
  Upstream's skills are now user-invoked; `unslop` stays automatic. See `plugins/poteto/PORT.md`.

The slice shape, check-before-rule, reproduce-first, the findings split, and the test
anti-patterns are adapted from Matt Pocock's skills (`mattpocock/skills`, MIT), rewritten for
this workflow; no files were copied.

## 0.27.0 - 2026-09-25

Agent files reshaped for Opus 5.5 and GPT-6.

- **Every agent body opens with a finish line and a blocked rule.** Each of the sixteen agents
  now states what done means in one sentence, names the inputs it needs and returns
  `BLOCKED: <what is missing>` when one is absent, and returns only when done or blocked, never
  with a progress report. Prose that only repeated the tool allowlist ("do not modify files" on a
  read-only agent) is gone. The research behind the shape is
  `docs/research/2026-09-25-claude-subagent-definition-practices.md`.
- **Reviewers report every finding with a reproduction, verdict first.** The three review lenses
  put the verdict at the top, ask for how to show each finding fails (an input, call, or test),
  and state the cost of under-grading beside the cost of over-grading, since a
  conservative-only instruction depresses recall on Opus 5. `code-integrity-reviewer` places
  every acceptance criterion as met, unmet, or not verifiable. `security-auditor` asks for the
  input and code path that reaches a flaw instead of an exploit path.
- **Codex build preamble rewritten as a four-part brief.** Goal, allowed actions, never-list with
  reasons, done condition, named blocked triggers, "do not ask questions", and an
  instruction-priority line, per OpenAI's Codex guidance in
  `docs/research/2026-09-25-codex-task-briefing-practices.md`. The scope warning now matches
  the runner: ignored artifacts are reported, not rejected. The conditional `CLAUDE.md` read
  stays for projects that kept a standalone file. `danger-full-access` stays, deliberately.
- **Codex effort list and fallback.** `--effort` accepts `low|medium|high|xhigh|max`; `none` and
  `minimal` are rejected, as `gpt-6-astra` rejects `none` and Codex lists neither. The one-time
  fallback moves from `gpt-5.6-sol` to `gpt-6-sol`, released 2026-09-22 at about half the price.
- **Breadth roles moved to Opus 5.5 at `low`.** `codebase-analyst`, `researcher`,
  `technical-writer`, and `librarian` now pin `claude-opus-5-5` at `effort: low` instead of the
  moving `sonnet` alias at `medium`. `low` is the level Anthropic recommends for subagents and
  simple tasks on Opus 5.5, and its published sweep puts `low` close to `medium` on coding. The
  four Codex wrappers stay on `sonnet` / `medium`, since they only marshal a Codex run. The eight
  gate-bearing roles are unchanged. `validate.sh` check 14 pins the new values; the doc is `docs/model-tiering.md`.

## 0.26.0 - 2026-09-24

Opus 5.5 for the gate-bearing fleet.

- **Opus 5.5 pins.** All eight Opus agents request `claude-opus-5-5` instead of `claude-opus-5`.
  Claude Code `v2.1.280`, the release that added the model, is the documented minimum;
  `/deliver:doctor` flags older versions.
- **Effort re-swept.** `expert-builder` moves from `high` to `medium`, the Opus 5.5 default, which
  Anthropic measured at or above Opus 5 at `high` on agentic coding in fewer steps and tokens.
  `security-auditor` and `debugger` stay at `high`; the five `medium` roles are unchanged. No Opus
  role uses `xhigh` or `max`. The sweep is in `docs/research/2026-09-24-opus-5-5-effort-sweep.md`.

## 0.25.1 - 2026-09-08

Codex review fixes for 0.24.1 and 0.25.

- **Phase precedence.** An unapproved marker, or an approved one whose plan changed, is
  `planning` whatever else exists. A completed sprint with no `docs/retros/sprint-<n>.md` is a
  new `retrospective` phase at `standard` scale and above, and resume claims nothing until it
  has run. An unreadable story counts as unmerged and is named, so one merged story beside it can
  no longer read as a finished sprint.
- **`state` takes its explicit root.** `CLAUDE_PROJECT_DIR` no longer overrides the argument.
- **A plan that is not a regular file** is refused by the runner and ignored by the hook, so a
  FIFO at `docs/plan.md` cannot hang `git hash-object`. The session hook's rendering is wrapped
  so a malformed field cannot take a session down.
- **The retrospective's large-sprint path** gives `architecture-reviewer` a narrowed diff, which
  its contract requires, not a file list.

## 0.25.0 - 2026-09-08

The workflow, tightened, from a two-model audit.

- **One state inspector.** `node hooks/lib.mjs state` prints the derived position as JSON:
  approval and whether the plan changed, the phase and the reference to load, branch, the
  checked-out story's Execution block, claims, unmerged stories, worktrees, uncommitted count, and
  handoff freshness. The session hook renders it, and doctor and resume read it instead of
  re-deriving git facts.
- **The session hook names the phase.** `phase: implementation · load
  references/implementation-loop.md`, from the derivation in `state.md`. This is the cheap form of
  a phase-dependent persona: the phase reference is the persona, and nothing is added to every
  dispatch. Each phase reference opens with an Enter and Leave line.
- **The plan digest is enforced.** The sign-off hook and the Codex runner compare
  `plan_digest` with `git hash-object docs/plan.md`; a plan edited after approval blocks
  implementation writes until `/deliver:correct-course` runs or the digest is refreshed.
- **Analyze runs again after decomposition.** Its story detections never fired before, since the
  plan-time run had no stories.
- **Sprint retrospective.** `/deliver:retro` and `references/retrospective.md`: a bounded
  cross-story review of the sprint's diff, three evidence-backed questions, `AGENTS.md` learnings
  proposed as a diff, and a record under `docs/retros/` from `retro.md.template`. The sprint
  checkpoint runs it before the pause.
- **`AGENTS.md` is no longer a dispatch input.** Subagents receive it through the `CLAUDE.md`
  hierarchy and Codex loads it natively, so seven agent prompts and the Codex prompt stop asking
  for it. `instruction-layers.md` states the rule.

## 0.24.1 - 2026-09-08

Audit fixes after 0.23 and 0.24.

- **Hook rewrites are detected.** The runner's git metadata fingerprint hashes each hook's
  content, so a same-size rewrite of a git hook no longer passes the after-run audit. It also reads
  hooks and `info/exclude` from the common git dir, so a run in a linked worktree cannot change the
  shared ones unseen.
- **Two commands ran as written no longer fail.** The doctor's Codex preflight names
  `--mode build`; a `branch` review preflight no longer demands `--base`.
- **References agree with the code.** `git init` is offered before the marker is committed, not
  after sign-off; the phase derivation handles a `tiny` project with no spec; parallel batches say
  which builder can skip the full test run; nested `AGENTS.md` files are documented as unreachable
  for `codex-builder`, with Codex's real `AGENTS.override.md` precedence and aggregate budget; a
  handoff's own commit does not stale it, everywhere that rule is stated.
- **Stale text removed** from the model-tiering doc, four agent prompts, the hardening and analysis
  references, the doctor command, the handoff template, and the poteto notes. The validate scan for
  retired state now covers every plugin, the docs, and the example.

## 0.24.0 - 2026-09-07

Git is the state.

- **The `pm/` directory is gone.** The shared `pm-state.json`, the per-actor JSONs, the
  union-merged `pm/log.md`, and the per-actor handoffs are replaced by three tracked things: an
  approval marker, `docs/approval.json` (`status`, `approver`, `approved_date`, `plan_digest`);
  an `## Execution` block at the end of each claimed story (`owner`, `builder`, `branch`,
  `status`, `rounds`, `retries`, plus dated notes for events with no commit); and an optional
  `docs/handoff/<actor-id>.md` with a `BASE_COMMIT` line. Everything else comes from git: the
  claim is the story branch, each build and fix round is a commit, the `--no-ff` merge body is the
  story record, and `git log --first-parent` is the project log. `references/state.md` replaces
  `logging-and-state.md`.
- **Commit as you go.** The sequential loop commits after the build and after every fix round;
  counters are committed before the dispatch they bound. A parallel wave commits nothing until
  every builder has returned, because the Codex runner fingerprints every ref.
- **Hooks.** `require-signoff.mjs` reads the marker and honours a pre-0.24 `signed_off` field
  until the migration runs. `pm-secrets-guard.mjs` guards all of `docs/`. `actor-guard.mjs` is
  removed. `session-context.mjs` prints approval, branch, the story's Execution state, claims,
  worktrees, uncommitted paths, handoff freshness, and the wiki line, all derived from git.
- **Runner.** Build and fix require a tracked, approved `docs/approval.json`; a project with only
  legacy state is refused with a message naming the migration. `docs/approval.json` and
  `docs/handoff/` are protected paths.
- **Migration.** `/deliver:resume` on a pre-0.24 project writes the marker and the Execution
  blocks from the old state, folds old handoffs into story notes, removes `pm/`, the union-merge
  attribute, and the `pm-state` rules, and commits once. The old log stays in history.
- **Branch review scope.** `/deliver:codex-review branch base=<branch>` reviews every commit on the
  current branch against its base through `codex exec review --base`, which is how external review
  reaches a story whose work is already committed.
- **Plan and templates.** Delivery mode gains `Integration branch` and drops `Instruction rules`.
  `approval.json.template` is new; the story and handoff templates change; five state templates
  are deleted. The worked example follows the new layout.

## 0.23.0 - 2026-09-07

Codex runs unsandboxed.

- **No OS sandbox.** Every Codex mode runs with `sandbox_mode="danger-full-access"` on every
  platform. Build and fix previously ran `workspace-write` with network off on macOS and Linux, and
  review, advise, and research ran `read-only`. The after-run worktree audit, the protected-path and
  `pm-meta.touches` checks, the git metadata fingerprint, the secret-filtered shell environment, and
  the worktree-local temp directory are unchanged and are now the only guard.
- **Your Codex config applies.** The runner no longer passes `--ignore-user-config` or
  `--strict-config` and no longer pins `mcp_servers` or `web_search`, so MCP servers and web search
  work as configured in `$CODEX_HOME/config.toml` and the repository's `.codex/config.toml`.
  `features.hooks` and `agents.enabled` stay off. Research with `--search off` still disables web
  search.
- **Preflight.** `READONLY_FLAGS` is now `EXEC_FLAGS`, and `--sandbox`, `--ignore-user-config`, and
  `--strict-config` are no longer required CLI flags.

## 0.22.0 - 2026-09-04

The parked backlog, closed.

- **Kill switch.** `DELIVER_NO_ENFORCE=1` is the only name that disables the hooks;
  `PM_SKILL_NO_ENFORCE` stopped working.
- **Plan template.** The Stories table drops its acceptance criteria column (story files own
  criteria); Goals and Target users are omitted when `docs/spec.md` exists.
- **Runner envelopes.** Completed build, review, and advise envelopes carry only the fields a
  wrapper relays: status, version, model and effort (plus `model_fallback` when it ran), changed
  and ignored paths, the report or answer path, and the builder's result. Echoed inputs such as
  `worktree`, `story`, `mode`, `timeout_seconds`, `sandbox`, and `git_status_short` are gone from
  success envelopes; failure and preflight envelopes are unchanged.

## 0.21.0 - 2026-09-04

The plugin is now called deliver.

- **Rename.** Marketplace, plugin, directory, and command namespace: `pm-skill` is `deliver`,
  `/pm-skill:<command>` is `/deliver:<command>`, and the repository is `bendusz/deliver` (the old
  URL redirects). Hook messages say `deliver`. The kill switch is `DELIVER_NO_ENFORCE`;
  `PM_SKILL_NO_ENFORCE` keeps working until 0.22.
- **Nothing to migrate in projects.** `pm/` state, `pm-meta`, actor ids, and generated `AGENTS.md`
  files are unchanged; `/deliver:resume` reads them as before.
- **Upgrade.** `claude plugin marketplace remove pm-skill`, then
  `/plugin marketplace add https://github.com/bendusz/deliver` and
  `/plugin install deliver@deliver`.

## 0.20.0 - 2026-09-04

Contracts before code.

- **SpecDD skeleton phase.** With `Skeleton: specdd` in the plan's Delivery mode (default at
  `large` and `regulated`), a new `spec-architect` agent writes the sprint's `.sdd` contracts, the
  root spec, and `.specdd/bootstrap.md` after sign-off and before decomposition, once per sprint.
  `references/skeleton.md` owns the phase; `/pm-skill:skeleton` reruns it. The `specdd` CLI is used
  when `npx` can run it and a bundled bootstrap template otherwise.
- **Stories point at specs.** A `Specs:` header field, `pm-meta.touches` from `Owns`, criteria
  that cite `Done when` lines, and a readiness item. Builders read the specs first and may edit a
  spec inside their touches if they report it; reviewers treat a violated `Must` or an unreported
  spec change as `major`; the verifier fails a covered `Done when` the diff does not meet;
  `/pm-skill:analyze` gains four skeleton detectors.
- **Hooks and runner.** `.sdd` files and `.specdd/` count as planning artifacts for the sign-off
  hook; the Codex runner protects `.specdd/` and the root spec and lets Codex edit a `.sdd` inside
  the story's touches.
- **Example.** `examples/todo-cli` carries a root spec, one module spec, and a bootstrap.

## 0.19.0 - 2026-09-04

Less to load, one place per rule, and a new Codex default.

- **`gpt-6-astra` by default.** Every Codex mode defaults to `gpt-6-astra`. When the API refuses
  the model for the account in use, the runner retries once on `gpt-5.6-sol` at `medium` and reports
  `model_fallback` in the envelope. An explicit `--model` never falls back.
- **Clean-path implementation loop.** Fix rounds, triage, the debugger rule, and the round cap moved
  to `references/fix-loop.md`, loaded only when a gate fails or a finding is open. Lens selection
  stays in `review-gates.md`; the merge message grammar sits at the ship state.
- **Templates own fields.** `planning-and-signoff.md`, `decomposition.md`, and the handoff command
  point at their templates and keep only the rules a template cannot hold.
- **Codex contract in one place.** `docs/codex-cli-reference.md` documents the runner's flags, exit
  codes, and envelope fields, and points at the runtime code for exact argument lists;
  `codex-review` stops repeating the runner's preflight checks.
- **Builder result schema.** `out_of_scope_changes` and `risks` removed; `summary` capped at five
  items.
- **Cleanups.** One process-tree kill path in the runner; hook secret-scanner tests deduplicated
  against the library tests; the verification template's verifier section no longer repeats the
  gate and review rows; `technical-writer`'s description matches its bounded inputs.

## 0.18.0 - 2026-09-04

A project wiki with one writer.

- **Wiki under `docs/wiki/`.** An index, a schema, and decision, concept, and source pages. Raw
  artifacts, `pm/` state, and the log do not move. On at `standard` scale and above; created at
  scaffold from two new templates.
- **`librarian` agent.** Sonnet, medium. The only writer under `docs/wiki/`, with three modes:
  `ingest` (artifacts to pages), `query` (an answer with citations), `lint` (orphans, dead links,
  contradictions). Supersedes instead of deleting, never runs git, never writes the log.
- **Hand-off points** in `references/knowledge.md`: first ingest after scaffold, after each research
  report, after each shipped story, after correct-course; lint at sprint boundaries and before the
  completion report. Resume reads the index after state and handoff.
- **Hooks.** The session line shows the index entry count; the secrets guard covers `docs/wiki/`.
- **Analyze.** Five wiki detectors, run only when the wiki exists.
- **Example.** `examples/todo-cli/docs/wiki/` shows the shape.

## 0.17.0 - 2026-09-03

Smaller dispatches with the same behaviour. The story header and every agent body now carry only
what changes a worker's decision.

- **Story contract v2.** `pm-meta` is the only home for a story's builder and touch paths. The
  visible header is two lines (`Sprint · Priority · Covers · Depends on · Parallel-safe` and
  `Risk · Review lenses`); security and architecture sensitivity are the presence of
  `security-auditor` and `architecture-reviewer` in the lens list. Stories written before 0.17 keep
  working: the runner treats their visible `Builder` and `Touches` fields as optional and still
  blocks when one disagrees with `pm-meta`. See `references/migrations.md`.
- **Agent bodies within budget.** All fourteen agent bodies were rewritten under a word budget with
  every rule, input, and parsed token kept once. Reviewers return findings and a verdict; the
  verifier returns `STATUS`, per-criterion and per-gate evidence, and an action only on `FAIL` or
  `UNKNOWN`. `test-engineer` now states that it never changes git state.
- **Runtime trims.** The Codex build prompt states its constraints in one sentence; the runner
  enforces them. The session hook prints a `pm:` line, your `you:` line, the handoff state, and only
  teammates holding a story.
- **Hygiene.** No em dashes in runtime code; `scripts/validate.sh` checks it.

## 0.16.1 - 2026-09-03

Documentation and prompt fixes from a three-agent Codex review, plus one runner refactor. The
behaviour of the plugin is unchanged; what it tells agents about itself is now accurate and
smaller.

- **Hook prose matches the code.** `references/hardening.md`, `references/logging-and-state.md`,
  and the README Safety section now name what `require-signoff.mjs` does: `Write`, `Edit`, and
  `MultiEdit` only, blocking only on `signed_off: false`, exempting `docs/`, `pm/`, `tmp/`,
  `.git/`, `.claude/rules/` and four root files, failing open, and never seeing `Bash` writes.
- **`AGENTS.md` is facts-only for real.** The `Working here` block is gone from
  `templates/AGENTS.md.template`, this repo's `AGENTS.md`, and the worked example.
  `references/instruction-layers.md` no longer claims the hooks enforce rules such as no-push;
  the skill's hard rules carry those.
- **Leaner skill, commands, and references.** `SKILL.md` drops the optional-command inventory,
  the template catalog, the agent catalog, and the resume restatement. `/pm-skill:specify`,
  `/pm-skill:clarify`, and `/pm-skill:resume` point at their references instead of repeating
  them. `references/parallel-execution.md` is a delta on the sequential loop. `review-gates.md`
  keeps lens selection and triage, `verification.md` keeps running-app evidence and the durable
  report, and the implementation loop owns gate order, verifier handling, done, and escalation.
  New `references/documentation.md` owns the `technical-writer` dispatch. The three reviewer
  agents share a four-sentence review rule and no longer open with mandatory praise.
- **Shared Codex argv helper.** `scripts/codex/lib/argv.mjs` holds the locked flags that `build`,
  `review`, and `advise` all pass, so the three copies cannot drift. Every flag is preserved.
- **Worked example state is current.** `examples/todo-cli` state files carry `spec`,
  `constitution`, `last_analysis_status`, `current_story_verification_status`, and
  `parallel_batch`; the plan says why the spec was skipped, and `examples/README.md` notes the
  pre-0.10.1 actor id.
- **Shared `codex-review` stamp.** The PM computes one `YYYYMMDD-HHMMSS` stamp per run and passes
  it to every `codex-reviewer`, so reports and the index file
  (`<stamp>-codex-review-<scope>-index.md`) share one prefix. The command also secret-scans the
  outgoing code before launching.
- Smaller fixes: the `codex-builder` failure envelope is documented separately from a completed
  run, `codex-researcher` may create its own temporary brief, `/pm-skill:handoff` appends
  corrective log entries instead of editing old ones, `/pm-skill:doctor` names its two permitted
  writes, parallel worktree cleanup no longer contradicts itself, `codex-builder`'s description
  covers the `auto` route, the actor-id fallback to `user.name` is documented, `decomposition.md`
  uses the story template's header labels, and the README gives the verifier's full PASS, FAIL,
  UNKNOWN vocabulary.

## 0.16.0 - 2026-09-03

AGENTS.md instructions layer and a cross-platform Node runtime. One instructions file for every
agent, the hooks and the Codex runner no longer need bash or jq, and every Codex call behind a
Sonnet wrapper.

- **AGENTS.md is canonical.** The scaffold writes a facts-only `AGENTS.md` (commands, layout,
  conventions, gotchas; about 30 lines) and a two-line `CLAUDE.md` bridge starting with
  `@AGENTS.md`. Existing files are never overwritten; the PM proposes a migration. Optional
  `.claude/rules/pm-state.md` and `pm/AGENTS.md` carry `pm/` discipline at `standard` scale and
  above. `references/instruction-layers.md` records where facts, procedure, constraints, and
  persona live; `SOUL.md` is deliberately not adopted. Every agent that reads project context
  reads `AGENTS.md`; `/pm-skill:doctor` checks the layout, size, and duplicated rules.
- **Hooks in Node.** The four guardrails and their shared library are Node ESM in exec form
  (`"command": "node"`), with identical exit codes, messages, and actor ids (POSIX `cksum`
  reimplemented and pinned to captured vectors). `jq` is no longer needed. `node lib.mjs scan`
  and `node lib.mjs actor-id` replace the bash CLI.
- **One Codex runner.** `scripts/codex/run.mjs` provides `build`, `fix`, `review`, `advise`, and
  `research` modes with the bash runner's POSIX safety posture; Windows runs without a platform
  sandbox. It resolves `codex.exe` or the npm shim on Windows, kills process trees on timeout, and
  feeds prompts on stdin. On Windows, build and fix run with full host access and network, so
  writes elsewhere on the machine and network use are not detectable; the runner audits only the
  worktree afterwards (tracked, untracked, and ignored files inside it). Two new Sonnet wrappers,
  `codex-reviewer` and `codex-advisor`, join `codex-builder` and `codex-researcher`;
  `/pm-skill:codex-review` and `/pm-skill:codex-help` dispatch them and never run `codex` in the
  main session (validate enforces it).
- **Leaner runtime prose.** The references the agents load lost their duplicated copies: state
  migrations moved to `references/migrations.md`, doctor's `pm/` checks to
  `references/artifact-consistency.md`, and the model-tiering rationale out of the loaded set into
  `docs/model-tiering.md`. The verifier now receives only the `FR-` and `AC-` entries its story
  covers plus the plan's Commands section, instead of both documents whole. Agent descriptions drop
  their `<example>` blocks, and the reviewer bodies state their verdict rule once.
- **CI on three operating systems.** `node --test` runs on ubuntu, macos, and windows.
- **Requirement.** Node.js 20 or newer at runtime.
- **Hardening from review.** Line-oriented secret scan, canonical case and symlink handling,
  sanitised session context, synchronous hook output, a `hooks.json` wiring check in validate,
  `.gitignore` consent for Codex review reports, report-name collision handling, and a `git` probe
  in the runner.
- **Ignored files are audited, not enforced.** The runner fingerprints git-ignored files inside
  the worktree and reports changes in a new `ignored_files_changed` envelope field. Only tracked
  and non-ignored files are enforced against a story's Touches, so caches and build outputs no
  longer abort a story; `codex-builder` surfaces a modified pre-existing ignored file outside
  Touches as a review finding.
- **Node benchmark scorer.** `scripts/score-builder-benchmark.sh` is now
  `scripts/score-builder-benchmark.mjs` with identical output; `/pm-skill:benchmark-builders`
  calls it with `node`.
- **Log entry separator.** Shared-log entries now read `- <YYYY-MM-DD HH:MM> <actor-id>: <event>`;
  the template and references use a colon instead of a dash. Existing logs keep their old lines;
  nothing parses the separator.

## 0.15.0 - 2026-08-27

Focused Opus 5 defaults. Gate-bearing Claude roles now use a stable model family, re-ground in
current evidence, and stay inside a mechanically checked story boundary.

- **Stable Opus selection.** All seven Opus agents request `claude-opus-5` instead of the moving
  `opus` alias. `/pm-skill:doctor` records the Claude Code version, configured model and effort,
  and host-level subagent override. Claude Code `v2.1.219` is the documented minimum for Opus 5.
- **Builder effort reduced.** `expert-builder` defaults to `high`, down from `xhigh`. Its task
  contract names the allowed path scope, stop condition, and ambiguity rule. No shipped Opus agent
  uses `xhigh` or `max`.
- **Role-specific focus.** Every Opus agent re-reads its current inputs, stays within one explicit
  role and task, stops at its completion criteria, and reports missing evidence instead of guessing.
  The prompts avoid generic extra-verification and delegation requests.
- **Mechanical scope check.** Sequential and parallel delivery now derive changed paths from Git
  after every writer run, compare them with authoritative `pm-meta.touches`, and stop before review
  or ship on an unexplained path. Agent-reported file lists are not trusted as complete.
- **Recovery and validation.** The PM checkpoints actor state before compaction and verifies it
  after resume. The existing validation script locks exact Opus model and effort defaults without
  adding a benchmark product or standalone test harness. The research behind the change is in
  `docs/research/2026-08-26-opus-agent-performance.md`.

## 0.14.0 - 2026-08-26

poteto companion plugin. Lauren Tan's pstack skills ship in this marketplace as a second, optional
plugin, and pm-skill's references learn to use them when they are present.

- **New `poteto` plugin** (`plugins/poteto/`, MIT, copyright Lauren Tan). 14 workflow skills
  (`how`, `why`, `unslop`, `architect`, `arena`, `blast-radius`, `interrogate`,
  `technical-writing`, `create-verification-skill`, `maintain-verification-skill`, `reflect`,
  `teach`, `typescript-best-practices`, `bro`) and all 21 `principle-*` skills, ported from pstack
  0.14.3. Patches are limited to Claude Code model aliases, subagent parameters, config lookups,
  paths, tool names, and `/poteto:` namespacing; `PORT.md` lists every one and the upstream SHA.
  Skills only, no hooks. Install with `/plugin install poteto@pm-skill`.
- **Reference edits (optional, detect-and-adapt)**. Planning and decomposition may run a
  design-exploration skill for Architecture-sensitive work; review triage gains Act on / Consider /
  Noted / Dismissed buckets and filtering rules; a blast-radius lens may join the panel for small
  diffs into shared code; `pm-verifier` drives a project `verify-<app>` skill when one exists;
  ship uses a Why / Scope / Tradeoffs / Blast radius / Verification PR body; `/pm-skill:handoff`
  audits the log against repo state first; `technical-writer` applies a handed-in writing
  standard; the constitution template offers the 21 principles as a menu.
- **Validation**. `scripts/validate.sh` checks the second plugin's manifest, license, README,
  skill frontmatter, and that no Cursor-only string survived the port.
- **Docs**. README install step and Optional-enhancements entry, `docs/prior-art.md` pstack
  entry, v0.14 spec and plan.

## 0.13.0 - 2026-08-22

Codex precision builder. Opus remains the broad-context implementation worker; bounded stories and
localized fix rounds can now use a write-capable Codex worker without weakening the PM gates.

- **New `codex-builder` agent** (`sonnet` / `medium` liaison, inner Codex default
  `gpt-5.6-sol` / `high`) for precise implementation and evidence-rich fixes. It is deliberately
  thin and never solves or edits outside the bundled runner.
- **Hardened runner** fails closed on missing, malformed, unsigned, or symlinked PM state; enforces
  strict `pm-meta` JSON scope; and derives authoritative changes from before/after content snapshots.
  Fixed CLI overrides disable host temp roots, network, web search, inherited MCP servers, lifecycle
  hooks, subagents, login shells, user config, and execpolicy rules; tool shells receive a reduced,
  secret-filtered environment plus a disposable worktree-local `TMPDIR`. Strict config rejects unknown keys. It rejects
  protected/out-of-scope/unreported edits and fingerprints
  HEAD, all refs, staged contents, local config, and worktree registrations.
  Duplicate changed paths are checked after response generation because the API's strict structured
  output subset does not accept JSON Schema `uniqueItems`.
- **Bounded execution** adds a 10-minute default timeout, signal/process-tree cleanup, partial-diff
  preservation, failure-only diagnostics retention, and automatic scratch cleanup after success.
- **Explicit routing** adds `Builder: expert-builder | codex-builder | auto` to stories. Broad,
  cross-cutting, or architecture-heavy work stays with Opus; precise stories and localized
  review/gate fixes prefer Codex. Switching workers never resets the existing retry or fix bounds.
- **Resumable routing and worktrees** persist `resolved_builder` in sequential actor state and a
  `builder` per parallel-batch entry. Parallel `expert-builder` dispatches now receive and verify
  the absolute worktree root.
- **Quota-free behavioral tests** cover missing CLI, failed auth, missing/symlinked/unsigned state,
  nonzero exits, done/blocked results, hostile project config, protected/out-of-scope/unreported
  edits, dirty baselines, timeouts and descendant cleanup, path containment, fix evidence, and broad
  git metadata tampering. `/pm-skill:doctor` now probes Codex only when routing may need it.
- **Operational checks** add `--preflight` for no-inference readiness, an opt-in real Codex smoke
  test, and `/pm-skill:benchmark-builders` with a transparent scorer, result schema, and stable
  routing-case corpus. Benchmark work is isolated and never merged.
- **Docs and references** update the agent roster, model tiers, decomposition, sequential and
  parallel loops, safety guidance, and the local Codex CLI reference for codex-cli 0.149.0.

## 0.12.0 - 2026-08-02

Research agents. The fleet gains an external-research role and an optional second-model
counterpart; findings persist under `docs/research/` instead of dying with the session.

- **New `researcher` agent** (`sonnet`/`medium`). Web-capable (WebSearch/WebFetch); answers one
  tightly-scoped external question per dispatch (library choice, SDK facts, prior art) with
  sourced findings and an explicit recommendation; writes `docs/research/YYYY-MM-DD-<slug>.md`
  and returns a ≤20-line digest. Write access is prompt-constrained to `docs/research/` only.
- **New `codex-researcher` agent** (`sonnet`/`medium`). Drives `codex exec --sandbox read-only
  --ephemeral` (default `gpt-5.6-terra` @ `high`, `--search` when the CLI supports it) for an
  independent second-model research opinion; risk-selected alongside `researcher` for
  consequential or contested questions, mirroring codex-review vs the review panel; returns
  UNAVAILABLE cleanly when the codex CLI is missing; attributed report at
  `docs/research/YYYY-MM-DD-<slug>-codex.md`.
- **Dispatch guidance rerouted**. SKILL.md and the discovery/specification/planning references
  now send research to `researcher` instead of the built-in `general-purpose`/`Explore` agents.
- **Docs**. Model-tiering table extended (both new agents on `sonnet`/`medium`); README roster
  updated; codex `--search` non-support (codex-cli 0.145.0) recorded in `docs/codex-cli-reference.md`.

## 0.11.0 - 2026-07-25

Model consolidation for the Claude 5 family. Opus 5 closed the gap that justified Fable for
code-writing, so the shipped defaults get cheaper with quality concentrated where it counts.

- **`expert-builder` re-tiered** from `fable`/`medium` to `opus`/`xhigh`. One model for the whole
  judgement-heavy core, with effort (not model tier) as the quality lever; the builder is now the
  deepest-thinking agent in the fleet.
- **Light roles to `sonnet`**: `codebase-analyst` and `technical-writer` drop from `opus`. The two
  roles least sensitive to model tier. All gate-bearing roles (reviews, verification, tests) stay
  on `opus`; `security-auditor` and `debugger` keep `high` effort.
- **Aliases, not IDs**: pins stay on `opus`/`sonnet`, resolving to Opus 5 / Sonnet 5 today and
  auto-tracking future releases. Re-pin `fable` per agent frontmatter to restore the old builder.
- **Docs updated**. `references/model-tiering.md` rewritten around the v0.11 mapping; the
  SKILL.md tiering summary matches.

## 0.10.1 - 2026-07-16

Hook hardening. Fixes the six findings from a whole-codebase codex review (gpt-5.6-sol). New
shared `hooks/lib.sh`; behavioral hook tests (`scripts/test-hooks.sh`, 42 cases) now run in
`validate.sh`/CI.

- **Project-root discovery**: hooks resolve `$CLAUDE_PROJECT_DIR` → git top level → cwd, so
  sessions started in a subdirectory no longer silently disable sign-off enforcement or resume.
- **Canonical path containment**: `pm/../src/…` traversal and symlinked-directory aliases now
  classify by the real target instead of bypassing the allowlists.
- **Secret tripwire**: credential assignments are matched case-insensitively, quoted or unquoted
  (`API_KEY=…`, `Password: …`); placeholders (`$ENV_REF`, `<rotate-me>`, `{{ templates }}`) no
  longer false-positive.
- **Actor ids are globally unique**: slug of the full email + 12-hex digest
  (`v-bende-gmail-com-0719f22c3305`), so same local-part users on different domains, and slug
  homographs like `alex.foo@` vs `alex-foo@`, stop conflating state. Pre-0.10.1 ids appear as
  orphans; `git mv` them to the new id on first resume (documented in logging-and-state.md).
- **Outgoing-diff secret scan**: the external-review step scans the exact diff for secret
  *values* (`hooks/lib.sh scan`, or gitleaks/trufflehog when installed) instead of grepping
  uppercase labels. `APIClient` no longer blocks, lowercase real secrets no longer pass.

## 0.10.0 - 2026-07-16

- **New command `/pm-skill:codex-review`**. Runs the OpenAI Codex CLI (`codex exec review`) as an
  independent reviewer: scopes `recent` (last commit) / `worktree` (uncommitted) / `codebase`
  (read-only full audit), `model=`/`effort=`/`timeout=` overrides (default `gpt-5.6-terra` @
  `high`), parallel objective agents (presets `security`/`bugs`/`architecture`/`tests`/
  `performance`, `panel`, or free-form), timestamped reports in `untracked/` or a gitignored
  `codex/`, plus an index file for multi-objective runs.
- **New command `/pm-skill:codex-help`**. Ask Codex for advice / a second opinion on a
  consequential decision (default `gpt-5.6-sol` @ `medium`, overridable); read-only, answer
  relayed in chat with Claude's own take. Guardrail: reserved for real changes needing a second
  pair of eyes.
- Project-manager skill: notes `/pm-skill:codex-review` as an optional second-model reviewer
  alongside the risk-selected panel, and `/pm-skill:codex-help` for one-off second opinions.

## 0.9.3 - 2026-07-07

Relicense from MIT to GPL-3.0-or-later.

- **License changed to GPLv3**. `LICENSE` now carries the canonical GNU GPL v3 text; copies and
  modified versions that are distributed must remain under the GPL with source available.
- **Metadata updated**. `plugin.json` `license` field is `GPL-3.0-or-later`; the README License
  section explains the copyleft terms.
- Releases up to and including v0.9.2 remain available under their original MIT terms.

## 0.9.2 - 2026-07-07

Explicit model + effort pinning for every agent.

- **All nine agents ship pinned**. No agent uses `model: inherit` anymore; behaviour no longer
  depends on the session model. `expert-builder` is pinned to `fable` (top tier); the other eight
  are pinned to `opus`.
- **Reasoning effort set per agent**. New `effort:` frontmatter on every agent:
  `security-auditor` and `debugger` run at `high`; all other agents at `medium`.
- **Docs updated**. `references/model-tiering.md` rewritten around the new pinned mapping and the
  `effort:` override; the SKILL.md tiering summary matches.

## 0.9.1 - 2026-07-05

Agent-quality pass, driven by verified community/official best-practice research (Anthropic
subagent docs and engineering posts; wshobson/agents and VoltAgent conventions).

- **Trigger-condition descriptions**. Every agent's `description` now states *when* to use it
  (concrete activation conditions, `PROACTIVELY` where standalone use is safe), not just what it
  is, making delegation reliable inside and outside the PM loop.
- **Explicit completion criteria**. Every agent now defines what *done* means; `pm-verifier`
  gains the early-victory rule (MUST run the verification command and every runnable non-mutating
  gate itself before PASS), and builder/test-engineer must run what they wrote before reporting.
- **Reviewer calibration**. The three review lenses gain a shared approach/calibration block
  (diff-first evidence, named-risk-only exploration, honest severity, no invented findings).
- **Model tiering on by default for routine roles**. `debugger`, `test-engineer`,
  `technical-writer`, `codebase-analyst` ship pinned to `sonnet`; the five quality-critical agents
  keep `model: inherit`. `references/model-tiering.md` rewritten around the shipped defaults.

## 0.9.0 - 2026-07-05

Multi-actor PM state: several people can run concurrent PM sessions on one repo without
overwriting each other. Solo is a team of one, with the same layout and no mode switch.
(Design: `docs/specs/2026-07-05-v0.9-multi-actor-state.md`.)

- **Shared core + per-actor state**. `pm/pm-state.json` slims to project facts plus an
  `assignments` claims map; each person's position (story, branch, loop counters, next, handoff
  freshness) lives in `pm/actors/<id>.json`, identity derived from git `user.email`/`user.name`.
- **Shared append-only log**. Author-prefixed entries, `merge=union` gitattribute (bootstrap
  writes it) so concurrent appends merge cleanly; the mutable Current State block is removed.
- **Per-actor handoffs**. `/pm-skill:handoff` writes `pm/actors/<id>.HANDOFF.md`; staleness is
  checked against the actor file.
- **Claim & sync discipline**. Pull before claim/ship, claims committed on the integration
  branch (pushed only under the user's standing push permission), re-gate if
  the integration tip moved, claims released in the ship commit; `/pm-skill:doctor` and
  `/pm-skill:analyze` flag double-claims, stale claims, and cross-actor `Touches` overlap.
- **`actor-guard.sh`**. New fail-open hook blocking writes to another actor's state files; the
  session hook now shows your position plus teammates' one-liners.
- **Migration**. Flat 0.8 layouts split into shared + actor files on resume (log block stripped,
  gitattribute added); pre-0.8 `tmp/` layouts chain through in one pass.

## 0.8.0 - 2026-07-05

Durable, git-tracked session state: the PM state files move from gitignored `tmp/` to a tracked
`pm/` directory.

- **Tracked `pm/` state directory**. `pm/pm-state.json`, `pm/log.md`, and the optional
  `pm/HANDOFF.md` replace `tmp/pm-state.json` / `tmp/log.md`. The state trio is the
  project's only durable resume point, so it now lives in git and travels with every clone/push;
  state updates are committed alongside the work they describe (e.g. with each story's ship/log
  commit). Bootstrap verifies the state files are not gitignored (`git check-ignore
  pm/pm-state.json pm/log.md`, the files, not the directory, so `pm/*`-style rules are caught)
  and commits `pm/` from the first state write.
- **`/pm-skill:handoff`**. End a session by writing `pm/HANDOFF.md` (from the new
  `HANDOFF.md.template`): a token-efficient, agent-to-agent briefing with position, in-flight story
  state, gate results, open findings, decisions not yet in docs, gotchas, `READ_FIRST`/`SKIP`
  pointers, ordered next steps. `/pm-skill:resume` reads it (after `pm-state.json`) when current;
  staleness is a JSON check, the new `handoff_written` state field vs `updated`. A worked
  handoff example ships in `examples/todo-cli/pm/`.
- **Session re-grounding hook**. A new `SessionStart` hook (`hooks/session-context.sh`) injects a
  short pm/-state pointer (phase, story, next step, handoff freshness) into every new, resumed,
  cleared, or **freshly-compacted** session of a PM-managed project; silent everywhere else. The
  PM also offers `/pm-skill:handoff` at sprint checkpoints and when context runs long.
- **Secrets guard hook**. A new `PreToolUse` hook (`hooks/pm-secrets-guard.sh`) blocks writes into
  the tracked `pm/` directory whose content matches high-confidence secret shapes (AWS/GitHub/
  Slack/API tokens, PEM private keys, JWTs, quoted credential assignments). Fail-open, same
  `PM_SKILL_NO_ENFORCE=1` kill switch; a tripwire for accidents, not a scanner.
- **Loop bounds survive resume**. New `current_story_rounds` / `current_story_retries` state
  fields persist the ≤3 fix-round / ≤2 builder-retry caps across sessions (parallel-path batch
  entries carry the same counters), so a resumed session can no longer silently reset the bounds.
- **`/pm-skill:correct-course`**. The sanctioned path for mid-flight scope changes: checkpoint the
  in-flight story, apply the change at the right altitude (spec / plan / story), void sign-off if
  the change is material (`signed_off: false` re-engages the hook), reset the story's counters,
  log and commit.
- **`/pm-skill:doctor` checks PM-state health**. State JSON parses, `pm/` not gitignored, `tmp/`
  ignored, log/state/plan sign-off agreement, and handoff freshness.
- **CI hardening**. The validate workflow now also runs `shellcheck` over all hooks and scripts;
  `validate.sh` checks every bundled hook is executable.
- **`tmp/` stays scratch and gitignored**. Prompts, raw subagent/review output, diffs,
  `tmp/environment-check.md`, `tmp/worktrees/`, one-off scripts. Nothing in `tmp/` may be
  load-bearing for resume.
- **No-secrets rule (now load-bearing)**. `pm/` is tracked, so secrets/credentials must never be
  written into the state files; reference secret locations, never values.
- **Migration**. On `/pm-skill:resume` (or any state read), a pre-0.8 project with state still
  under `tmp/` is migrated: files move to `pm/`, one-line pointer stubs are left in `tmp/`, repo
  references are updated, and the result is committed. The sign-off hook reads
  `pm/pm-state.json` and falls back to `tmp/pm-state.json` for not-yet-migrated projects; its
  pre-sign-off allowlist now includes `pm/*`.

## 0.7.0 - 2026-06-06

Mechanical rigor and right-sizing on top of the spec-driven workflow.

- **EARS acceptance criteria**. `spec.md.template` now models behavioural criteria as
  `WHEN <event>, THE SYSTEM SHALL <behaviour>` (plain measurable statements for non-event criteria),
  making them directly testable for `test-engineer` and `pm-verifier`.
- **`/pm-skill:checklist`**. Generate (and optionally evaluate, with evidence) the spec / plan /
  story / verification quality checklists under `docs/checklists/`.
- **`/pm-skill:doctor`**. A read-mostly environment-readiness probe (toolchain, lockfiles, and
  whether the gates actually run) → `tmp/environment-check.md`, run before the implementation loop.
- **Scale profiles** (`references/scale-profiles.md`). `tiny`→`regulated` right-size the workflow;
  scaling down drops artifacts/ceremony but never the hard rules. `pm-state.json` gains `scale`;
  `plan.md` gains a Delivery mode section.
- **Story risk/lens metadata**. Stories declare `Risk` and `Review lenses` (+ `Security-sensitive` /
  `Architecture-sensitive`), so `/pm-skill:analyze` checks declared-vs-actual instead of guessing.
- **Optional hardening** (`references/hardening.md` + `claude-settings-hardening.json.template`). A
  Claude Code-native hook that scopes a read-only Bash allowlist to the `pm-verifier` subagent (via the
  `agent_type` hook input), leaving the PM unaffected; the verifier's read-only Bash is otherwise a
  behavioural rule, not a sandbox.
- **Validation**. `scripts/validate.sh` now also checks reference integrity (SKILL references,
  template references, command frontmatter), parses the JSON templates, and verifies the CHANGELOG top
  matches the plugin version.

## 0.6.0 - 2026-06-06

Spec-driven planning, traceability, and an independent final verification step, all Claude
Code-native and self-contained (no external dependency).

- **New commands:** `/pm-skill:specify` (durable `docs/spec.md`), `/pm-skill:clarify` (resolve
  `[NEEDS CLARIFICATION]`, ≤5 questions), `/pm-skill:constitution` (project rules), `/pm-skill:analyze`
  (read-only cross-artifact consistency report).
- **New agent:** `pm-verifier`, a read-only final `PASS`/`FAIL`/`UNKNOWN` gate; a story can't ship
  without PASS.
- **New references:** `specification.md`, `verification.md`, `artifact-consistency.md`.
- **Traceability:** stable spec IDs (`US-`/`FR-`/`AC-`/`SM-`), a story `Covers:` field, and a plan
  `covers` column + Traceability table.
- **New templates:** spec, constitution, verification-report, and four quality checklists.
- Workflow is now discover → specify → clarify → plan → sign-off → analyze → decompose → build → gate
  → review → fix → verify → ship → log. `pm-state.json` gains `spec`, `constitution`,
  `last_analysis_status`, and `current_story_verification_status`.

## 0.5.0 - 2026-06-04

Parallel `[P]` story execution via git worktrees, opt-in, best-effort, with a hard fallback to the
sequential loop.

- New `references/parallel-execution.md`: build independent `[P]` stories at once in isolated git
  worktrees, then integrate them **one at a time** (concurrent build, serialized integration, the
  model behind merge queues / merge trains / the "Not Rocket Science Rule").
- Safe because builders make no commits (the PM owns git): the concurrent phase does zero git writes,
  so there's no shared-`.git` contention. Before each land, the latest integration tip is merged in
  and the full gates re-run, catching semantic conflicts two "independent" stories can create.
- Decomposition records each story's **Touches** (files/modules); `[P]` + non-overlapping Touches
  selects the batch. Default fan-out 3 (configurable). `tmp/worktrees/` (gitignored); native
  worktree isolation preferred when the host offers it.
- Worktree safety: never `rm -rf`, never force-remove a dirty worktree, no orphans (prune on
  resume). `pm-state.json` gains a `parallel_batch` array for resume. Same gates/review panel as
  sequential.

## 0.4.0 - 2026-06-04

More delivery agents and optional model tiering. All additive, with defaults unchanged.

- New bundled agents: `security-auditor` (read-only deep security lens, risk-selected),
  `technical-writer` (docs only: README, usage, CHANGELOG, completion report), and `debugger`
  (read-only root-cause diagnosis → fix plan the builder applies).
- `security-auditor` is now a first-class risk-triggered lens in the review panel
  (`review-gates.md`); `debugger` joins the fix loop when a gate fails or it stalls; an optional
  Document step adds `technical-writer` at the sprint/project boundary.
- **Optional model tiering** (`references/model-tiering.md`). Map agents to cheaper/stronger models
  by abstract tier (deep / standard / light). Off by default; every agent still inherits the session
  model and no vendor model IDs are hardcoded.
- New `completion-report.md.template`.

## 0.3.0 - 2026-06-04

Hardening: enforcement, recoverable state, CI, and a worked example.

- **Sign-off enforcement hook** (`hooks/`). A fail-open `PreToolUse` hook that blocks implementation
  writes until `tmp/pm-state.json` has `signed_off: true`. Inert outside a PM project; kill switch
  `PM_SKILL_NO_ENFORCE=1`.
- **Structured state + resume**. `tmp/pm-state.json` and the `/pm-skill:resume` command.
- **Story-readiness check** before build, and **reviewer-finding triage** before the fix loop.
- **Worked example** under `examples/todo-cli/`.
- **CI + OSS hygiene**. `scripts/validate.sh`, a validate workflow, CONTRIBUTING, and issue/PR templates.

## 0.2.0 - 2026-06-04

Delivery agents and risk-based review.

- New bundled agents: `codebase-analyst` (read-only context pack), `test-engineer` (tests only),
  `architecture-reviewer` (read-only design lens).
- Review generalised into a risk-selected **panel** (`review-gates.md`): always run
  `code-integrity-reviewer`; add `architecture-reviewer` for structural changes.
- Planning gains an optional `codebase-analyst` analyze step for brownfield projects.

## 0.1.0 - 2026-06-02

Initial release.

- `project-manager` skill: discover → plan → sign-off → decompose → orchestrate → review → ship → log.
- Bundled agents: `expert-builder` (implementation) and `code-integrity-reviewer` (read-only review).
- `/pm-skill:pm` command entry.
- Target-project templates: `CLAUDE.md`, `plan.md`, `story.md`, `log.md`.
- Sprint-level checkpoints (configurable); `tmp/log.md` recovery; repository-safety rules.
