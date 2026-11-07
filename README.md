# deliver, a project manager skill for T3 Code

Claude acts as the project manager. It agrees a plan with you, waits for your sign-off, then
delivers the work through T3 child agents: builders write the code, a reviewer from the other model
family checks it, a verifier signs it off, and the PM runs the gates and merges. It never writes
implementation code itself.

**Requirements.** deliver requires T3 Code. It dispatches every role through
T3, and stops if T3 is not there. Codex in T3 is used for the opposite-family review and for
bounded builds; without it, those defaults move to a Claude model.

## Install

Run these two steps separately. Submit the first, wait for it to finish, then run the second. If you
paste both at once, the second line gets swallowed into the first command's argument.

**1. Add the marketplace**

```
/plugin marketplace add https://github.com/bendusz/deliver
```

**2. Install the plugin**

```
/plugin install deliver@deliver
```

Use the full `https://` URL above. The `owner/repo` shorthand resolves to SSH, which fails on
machines without a GitHub SSH key. If the plugin does not appear right away, restart the session.

## Use

Describe the work ("act as my PM to build a CLI todo app"), or run `/deliver:pm build a CLI todo app`.

1. **Plan.** The PM talks the need through with you, writes `docs/plan.md` (and `docs/spec.md`
   when the work will outlive the plan), and iterates until you are happy.
2. **Sign-off, in conversation.** Nothing is built until you say "approved". The PM records it in
   `docs/approval.json`.
3. **Stories.** Each sprint becomes self-contained story files under `docs/stories/`, tracing to
   the plan's requirement IDs.
4. **Per-story loop on T3.** Claim, tests first, build in a T3 worktree, gate, review, at most
   three fix rounds, verify. Up to three independent stories build at once.
5. **Ship.** A `--no-ff` merge whose body is the story's record, or a real PR when you ask for one.
   Each sprint ends with a retro that proposes `AGENTS.md` learnings as a diff.

Size follows the work: a one-story fix gets a short plan and the loop, with no spec, sprints or retro.

## Roles

Each role is a short "soul" the PM pastes into a T3 `delegate_task`, with a recommended model the PM
may override per task.

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
| `/deliver:pm` | Act as the PM end to end: plan, sign-off, stories, loop, ship. |
| `/deliver:resume` | Pick up from git, the approval record, the story Execution blocks and the log. |
| `/deliver:doctor` | Check the T3 host, the toolchain, the project's gates, Codex and `log.sh`. |
| `/deliver:retro` | Run the sprint boundary's cross-story review and retrospective. |
| `/deliver:codex` | `review` a commit, worktree, branch or codebase with Codex, or `ask` it a question. |
| `/deliver:skeleton` | Write or extend the SpecDD skeleton for a sprint. |

## State and the decision log

Git is the record: the claim, each status change and the merge are commits. `docs/log.md` is the
decision log: one timestamped line per decision, with the why, appended only through the bundled
`scripts/log.sh` and committed with the PM's next commit, so months later you can see what was
decided and why.

SpecDD is optional and off by default. Say you want it during planning and the plan's
`Skeleton:` becomes `specdd`, so each sprint gets its `.sdd` contracts before any code.

Projects started on 0.29 or earlier leave some old files behind; see the 0.30.0 entry in
[CHANGELOG.md](CHANGELOG.md) for the cleanup commands.

## poteto

`/plugin install poteto@deliver` adds Lauren Tan's [pstack](https://github.com/cursor/plugins/tree/main/pstack)
engineering skills (`how`, `why`, `architect`, `arena`, `interrogate`, `blast-radius`, `unslop`,
verification-skill generators and 24 principles), ported to Claude Code under her MIT license.
deliver uses them when present and works without them. See [`plugins/poteto/README.md`](plugins/poteto/README.md).

## License

GPL-3.0-or-later; see [LICENSE](LICENSE). Copyright (c) 2026 bendusz. The `poteto` plugin stays
under its own MIT license.
