# bstack, a project manager skill for T3 Code

Claude acts as the project manager. It agrees a plan with you, waits for your sign-off, then
delivers the work through T3 child agents: builders write the code, a reviewer from the other model
family checks it, a verifier signs it off, and the PM runs the gates and merges. It never writes
implementation code itself.

**Requirements.** T3 Code, with Codex available in T3. bstack dispatches every role through T3
and stops if T3 is not there. The default workflow needs Codex for the opposite-family review and
for bounded builds. You may name other models for any dispatch.

**Secrets stay on the machine.** A secret comes in through T3's `request_secret`, never a file.
On the way out, the PM installs a git pre-push hook that scans every pushed commit for
high-confidence token formats (cloud and API keys, tokens, JWTs, private keys), and scans every
commit of a story before merging it. A hit blocks the push or merge and names the commit and file,
never the value.
It lives in git, so it covers every agent and provider. Agents never bypass it; only you may, with
`git push --no-verify`.

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

## Commands

| Command | What it does |
|---|---|
| `/bstack:pm` | Act as the PM end to end: plan, sign-off, stories, loop, ship. |
| `/bstack:resume` | Pick up from git, the approval record, the story Execution blocks and the log. |
| `/bstack:doctor` | Check the T3 host, the toolchain, the project's gates, Codex, `log.sh` and the secret scan. |
| `/bstack:retro` | Run the sprint boundary's cross-story review and retrospective. |
| `/bstack:codex` | `review` a commit, worktree, branch or codebase with Codex, or `ask` it a question. |
| `/bstack:skeleton` | Write or extend the SpecDD skeleton for a sprint. |

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
