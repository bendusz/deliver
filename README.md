# bstack, a project manager skill for T3 Code

Claude acts as the project manager. It agrees a plan with you, waits for your sign-off, then
delivers the work through T3 child agents: builders write the code, a reviewer from the other model
family checks it, a verifier signs it off, and the PM runs the gates and merges. It never writes
implementation code itself.

**Requirements.** T3 Code, with Codex available in T3. bstack dispatches every role through T3
and stops if T3 is not there. The default workflow needs Codex for the opposite-family review and
for bounded builds. You may name other models for any dispatch. bstack leans on how T3 behaves
(where it puts a worktree, what a child's result carries, how a reused request key answers).
Dispatch, messaging and the model ids were last checked against T3 Code 0.1.9 nightly on
2026-11-10; the worktree behaviour on 2026-11-07.

**Secrets stay on the machine.** A secret comes in through T3's `request_secret`, never a file.
On the way out, the PM installs a git pre-push hook that scans every pushed commit, and scans
every commit of a story before merging it. A hit blocks the push or merge and names the commit and
file, never the value. It lives in git, so it covers every agent and provider. Agents never bypass
it; only you may, with `git push --no-verify`.
- **What it catches.** Token formats that identify themselves, in added lines, file paths and
  commit messages: AWS access key ids, private key headers, GitHub, GitLab, Slack, npm, PyPI,
  Stripe live, SendGrid and Google API keys, `sk-` API keys and JWTs.
- **What it does not.** A secret with no telltale format: a password, an AWS secret access key, a
  database URL. It is a net for the common leak, not a guarantee.
- **False positives.** A token-shaped test fixture blocks too. You allow it with a line in
  `.scan-secrets-allow`, `<pattern name> <path glob>`; the PM proposes the line and adds it only
  on your yes. The scan reads that file from the base branch for a merge and from the remote's
  default branch for a push, never from the branch being checked, so no branch can allow its
  own hit.
- **Hook managers.** If husky, lefthook or anything else sets `core.hooksPath`, git skips the
  hook. The PM then proposes the one-line call that runs the scan from your manager's pre-push.

## Install

Run these two steps separately. Submit the first, wait for it to finish, then run the second. If you
paste both at once, the second line gets swallowed into the first command's argument.

**1. Add the marketplace**

```
/plugin marketplace add https://github.com/bendusz/bstack
```

**2. Install the plugin**

```
/plugin install bstack@bstack
```

Use the full `https://` URL; the `owner/repo` shorthand resolves to SSH, which fails without a
GitHub SSH key. If the plugin does not appear right away, restart the session.

## Use

Describe the work ("act as my PM to build a CLI todo app") or run `/bstack:pm <request>`.

1. **Plan.** The PM talks it through with you and writes `docs/plan.md`, plus `docs/spec.md` when
   the work will outlive the plan.
2. **Sign-off, in conversation.** Nothing is built until you say "approved", recorded in `docs/approval.json`.
3. **Stories.** Each sprint becomes self-contained files under `docs/stories/`, tracing to the plan's IDs.
4. **Per-story loop on T3.** Claim, tests first, build in a T3 worktree, gate, review, at most three
   fix rounds, verify. Up to three independent stories build at once.
5. **Ship.** A `--no-ff` merge whose body is the story's record, or a PR when you ask. Each sprint
   ends with a retro that proposes `AGENTS.md` learnings as a diff. A one-story fix skips the spec,
   sprints and retro.

## Roles

Each role is a short "soul" pasted into a T3 `delegate_task`; its default model is a recommendation.

| Role | Does | Default |
|---|---|---|
| builder | Implements one story, a tests-only brief or a fix, in its own worktree | Codex `gpt-6-astra` for bounded work, `claude-opus-5-5` for broad work |
| reviewer | Reviews the diff against the story; never the builder | The family that did not build |
| verifier | Checks each acceptance criterion PASS, FAIL or UNKNOWN before merge | `claude-opus-5-5` |
| researcher (optional) | Answers one external question, report under `docs/research/` | `claude-opus-5-5`, Codex for a second opinion |
| spec-architect (optional) | Writes the SpecDD `.sdd` files for a sprint | `claude-opus-5-5` |

## Skills

Each is a skill: run it as `/bstack:<name>`, or describe the task and Claude picks it up.

| Skill | What it does |
|---|---|
| `/bstack:pm` | Act as the PM end to end: plan, sign-off, stories, loop, ship. |
| `/bstack:resume` | Pick up from git, the approval record, the story Execution blocks and the log. |
| `/bstack:doctor` | Check the T3 host, the toolchain, the project's gates, Codex, `log.sh` and the secret scan. |
| `/bstack:retro` | Run the sprint boundary's cross-story review and retrospective. |
| `/bstack:codex` | `review` a commit, worktree, branch or codebase with Codex, or `ask` it a question. |
| `/bstack:skeleton` | Write or extend the SpecDD skeleton for a sprint. |
| `/bstack:board` | Convene the board: a 0-10 status score with recommendations, or `ask` it a question. |

## The board

`/bstack:board` seats three stakeholders, each a T3 child on its own model: a **sponsor**
(`claude-opus-5-5`, high), an **engineering** lead (Codex `gpt-6-astra`, xhigh) and a **customer**
(`claude-fable-5-2`, medium). With no arguments they score how well placed the project is to reach
its next milestone, from 0 to 10, and recommend what to do; `/bstack:board ask <question>` puts a
question to them instead.

They write their first statements without seeing each other's. In a second round each reads the
other two, with the scores removed, and holds or changes its own. The board's score is the median,
shown with all three, and dissent stays on the record. Claude chairs and has no vote. The board is
advisory and only you convene it: one meeting is six model runs. `quick` holds the first round
only, and `sponsor=<model>:<effort>` reseats a member. Minutes go to `docs/board/` in a project
the PM manages, and to `tmp/board/` anywhere else.

## State and the decision log

Git is the record: the claim, each status change and the merge are commits. `docs/log.md` is the
decision log, one timestamped line per decision with the why, appended only through the bundled
`scripts/log.sh` and committed with the PM's next commit. SpecDD is optional and off by default:
opt in during planning and each sprint gets its `.sdd` contracts before any code. Projects started
on 0.29 or earlier: see the 0.30.0 entry in [CHANGELOG.md](CHANGELOG.md) for cleanup commands.

## poteto

`/plugin install poteto@bstack` adds Lauren Tan's [pstack](https://github.com/cursor/plugins/tree/main/pstack)
skills (`how`, `why`, `architect`, `arena`, `interrogate`, `blast-radius`, `unslop`, verification-skill
generators and 24 principles), ported to Claude Code under her MIT license. bstack uses them when
present and works without them. See [`plugins/poteto/README.md`](plugins/poteto/README.md).

## License

GPL-3.0-or-later; see [LICENSE](LICENSE). Copyright (c) 2026 bendusz. `poteto` stays under MIT.

What bstack writes into your project is yours. The plan, spec, stories, `AGENTS.md`, retros,
board minutes and `.sdd` files it creates from its templates are your work, under whatever licence
your project uses. The pre-push hook is an untracked local copy of `scan-secrets.sh`; it is not
part of your repository.
