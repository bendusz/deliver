# Instruction layers

Four layers carry what an agent needs. Keep each thing in exactly one of them.

| Layer | Holds | Where it lives | Loaded |
|---|---|---|---|
| Facts | commands, layout, non-default conventions, gotchas, safety norms | `AGENTS.md` (Claude Code reads it through the `@AGENTS.md` line in `CLAUDE.md`; Codex, Cursor, and Copilot read it natively) | every session, every custom subagent dispatch (Claude Code's built-in Explore and Plan agents skip it) |
| Procedure | phases, checklists, hand-off contracts, review and verification rules | this skill's `SKILL.md` and `references/` | on demand, one reference per phase |
| Constraints | sign-off, secrets, actor isolation, `pm-meta.touches` | the bundled hooks and the Codex runner | enforced mechanically |
| Persona | role, tone, boundaries, stop conditions | each `agents/*.md` body; the runner prompt for Codex | per dispatch |

## Rules
- `AGENTS.md` is written once from `templates/AGENTS.md.template` and stays under 200 lines and
  32 KiB (the Codex budget); target 30 to 40 lines when filled. Every custom subagent receives the
  whole file on every dispatch (Claude Code's built-in Explore and Plan agents skip it), so each
  extra line is paid many times over. The test for a line: would removing it cause mistakes?
- Never copy procedure or hard rules from this skill into `AGENTS.md`. The hooks enforce them and
  the skill explains them; a restatement drifts and costs context. That includes a line saying the
  project is delivered with pm-skill: the agents already load this skill, so the note buys nothing
  and is paid on every dispatch.
- `CLAUDE.md` is a bridge: its first line is `@AGENTS.md`. Claude-only notes may follow it; keep
  them rare. Symlinks are not used (Windows needs Developer Mode; git needs `core.symlinks`).
- `SOUL.md` files (an OpenClaw convention for persona) are not created by the PM. Neither Claude
  Code nor Codex loads them; the agent bodies already carry the persona. A project author who
  keeps one may import it from the bridge file.
- Path-scoped constraints that only matter inside one directory go in `.claude/rules/<name>.md`
  with a `paths:` frontmatter (Claude Code) and a nested `<dir>/AGENTS.md` (Codex). The scaffold
  offers this for `pm/` at `standard` scale and above (`Instruction rules: pm-state`).

## Migrating an existing project

The PM performs this migration on request at any time, not only at scaffold; `/pm-skill:resume`
offers it when `AGENTS.md` is absent.

- `CLAUDE.md` exists, `AGENTS.md` does not: propose moving the content into a new `AGENTS.md`,
  trimmed to the template shape, and replacing `CLAUDE.md` with the bridge. Show the diff and
  ask. On refusal, leave both files alone and log that the project keeps a standalone `CLAUDE.md`.
- Both exist and `CLAUDE.md` is not a bridge: leave both, log a WARN; `/pm-skill:doctor` reports it.
