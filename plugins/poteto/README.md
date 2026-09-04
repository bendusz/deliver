# poteto: Lauren Tan's pstack skills, ported to Claude Code

This plugin exists because of [Lauren Tan](https://x.com/poteto), known as poteto. She has worked
with millions of lines of code at Meta, Netflix, and Cursor, sits on the React core team where she
helps build React Compiler, and wrote [pstack](https://github.com/cursor/plugins/tree/main/pstack)
as her answer to slop. Her line for it is the whole philosophy in nine words: *if you want to go
fast, go deep first.*

Every skill in this directory is hers. The words, the structure, the opinions, the 21 principles,
and the habit of proving work on the real artifact instead of a summary are her work, published
under the MIT license. What we did is small. We copied the skills that complement deliver, swapped
Cursor's model names, subagent parameters, and file paths for Claude Code's, and put them next to
the deliver plugin so a PM-orchestrated build can think the way she does.

Thank you, Lauren. Fork it, improve it, and send her the good parts.

## License

MIT. Copyright (c) 2026 Lauren Tan. The full text is in [`LICENSE`](LICENSE), unchanged from
upstream. This plugin is distributed inside the deliver repository, which is GPL-3.0-or-later. The
MIT terms continue to govern every file under `plugins/poteto/`.

## Install

Add the marketplace once (skip if you already have deliver), then install the plugin:

```
/plugin marketplace add https://github.com/bendusz/deliver
/plugin install poteto@deliver
```

Skills register as `poteto:<name>`. The deliver plugin's references name them as optional
examples, so it works with or without this plugin. If you kept a hand-copied port in
`~/.claude/skills/`, delete those directories after installing, or every skill shows up twice.

## What is here

Fourteen workflow skills. Most carry `disable-model-invocation: true` upstream, which means you
invoke them by slash command and the model does not reach for them on its own. `how`, `why`,
`unslop`, and `typescript-best-practices` are the exceptions and trigger on their descriptions.

| Skill | Use it when |
|---|---|
| `/poteto:how` | You want a walkthrough of how a subsystem works, or a placement / layering answer. |
| `/poteto:why` | You want to know why something was built this way. Queries every evidence source the session's MCP servers expose. |
| `/poteto:teach` | You want to actually understand a change or subsystem. Runs `how` and `why` and weaves one plain explanation. |
| `/poteto:architect` | You are about to write code that crosses a function boundary and want the types, signatures, and module shape settled first. Runs `arena`. |
| `/poteto:arena` | You want N parallel attempts at the same artifact, then the best parts of each grafted into one. |
| `/poteto:interrogate` | You have a diff and want several models to try to break it, then a lead reviewer's Act on / Consider / Noted / Dismissed verdict. |
| `/poteto:blast-radius` | You have a small-looking change and want to know what else it could break, with the one safety fact proven by running code. |
| `/poteto:reflect` | A long task landed and you want its lessons captured as edits to existing skills, with your approval before anything changes. |
| `/poteto:create-verification-skill` | Your project has no scripted way to prove app behavior. Generates `.claude/skills/verify-<app>/` with a feature map. |
| `/poteto:maintain-verification-skill` | The verify skill's feature map has drifted from the app. One source wave, one live pass, at most one PR of proven corrections. |
| `/poteto:technical-writing` | You are writing or reviewing docs, RFCs, readmes, PR descriptions, or commit messages. Diátaxis, Google developer style, STE, Global English. |
| `unslop` | Any prose. Cuts AI tells. Applies on its own. |
| `typescript-best-practices` | Reading or editing `.ts` / `.tsx`. Grounds the type-system-discipline principle in syntax. Applies on its own. |
| `/poteto:bro` | Restate the last message in plain human language. |

Twenty-one principle skills, one rule each, named `principle-<slug>`. You do not invoke them. You
steer with their names ("use subtract before you add", "apply prove it works"), and `architect`,
`arena`, `blast-radius`, and `interrogate` cite them. The deliver constitution template offers them
as a menu a project can adopt.

## What was left out, and why

- `poteto-mode`, its 22 playbooks, and `poteto-agent`. They are an orchestration entry point built
  on "never block on the human". The deliver entry point is built on "no implementation before
  sign-off". Two entry points with opposite rules in one session would fight.
- `swarm`, `figure-it-out`, `show-me-your-work`, `recall`, `tdd`. Each duplicates something the
  deliver plugin already provides (`parallel-execution`, the spec-plan-stories pipeline,
  `pm/log.md`, `/resume`), or the Claude Code harness does, or would need a rewrite for a
  non-Cursor host.
- `no-comments` and the Comment Sicko agent. A matter of taste, and it wants an agent file.
- `automate-me`, `setup-pstack`, and the Benny automations. Cursor-specific mechanisms.

Read them upstream. Several are worth borrowing ideas from even where they are not worth porting.
The deliver PR body format and its handoff log audit came from there.

## What changed for Claude Code

Six classes of edit, nothing else. `PORT.md` lists every occurrence by skill.

1. Model names. Cursor's slugs became Claude Code's `fable`, `opus`, and `sonnet` aliases. Where
   pstack used a fourth model family for diversity, the port names the OpenAI Codex CLI as an
   optional cross-family voice and skips it when absent.
2. Subagent parameters. `generalPurpose` became `general-purpose`; `readonly: true` became the
   read-only `Explore` agent; roles that need MCP tools stay on `general-purpose` with a note.
3. Config lookups. The `~/.cursor/rules/pstack-models.mdc` override layer was removed. The inline
   default stands.
4. Paths. `.cursor/skills/` became `.claude/skills/`; Cursor's transcript directory became
   `~/.claude/projects/<slug>/`.
5. Tool names. Cursor's `create-skill` became "your skill-authoring skill, if one is installed".
6. Namespacing. Slash references inside skill bodies became `/poteto:<name>`.

## Re-syncing with upstream

`PORT.md` records the upstream commit. To update: copy the skill directory from upstream, re-apply
the patches listed for it in `PORT.md`, run `bash scripts/validate.sh` from the repository root (it
greps for Cursor-only strings), and bump the plugin version to the pstack release you synced to.
