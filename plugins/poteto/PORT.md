# Port record

Upstream: `https://github.com/cursor/plugins`, directory `pstack`, commit
`bdf7aa355337897f167153e05069aca505dae17c` (pstack 0.14.3). Ported 2026-08-26.
Nine workflow skills and the 21 principles were first ported on 2026-08-19 at upstream
`60c641e4fad674784b30abcf9f8915dea39df38d`; none of those files changed upstream between the two
commits, so the whole bundle reflects `bdf7aa3`.

Skills bundled: 35

`scripts/validate.sh` (repository root) reads the line above and fails if the directory count
differs. Keep it current.

## Patch classes

1. **Models.** `claude-fable-5-thinking-max` to `fable`; `claude-opus-5-thinking-xhigh` to `opus`;
   `grok-4.6-fast-xhigh` to `sonnet`; `gpt-5.6-sol-max` to "the OpenAI Codex CLI, when installed",
   skipped when absent. Panel defaults are `fable`, `opus`, `sonnet`.
2. **Subagent parameters.** `subagent_type: generalPurpose` to `general-purpose`; `readonly: true`
   to `subagent_type: Explore`; roles that need MCP tools stay on `general-purpose` with a note that
   `Explore` strips MCP access.
3. **Config lookups.** Sentences reading `~/.cursor/rules/pstack-models.mdc` removed; inline default
   stands.
4. **Paths.** `.cursor/skills/` to `.claude/skills/`; `~/.cursor/plugins/` to `~/.claude/plugins/`;
   Cursor `agent-transcripts/` to `~/.claude/projects/<slug>/<session>.jsonl` and
   `<session>/subagents/agent-<id>.jsonl`.
5. **Tool names.** Cursor `create-skill` to "your skill-authoring skill, if one is installed"; the
   routing tag `new skill via create-skill:` to `new skill:`. `AskQuestion` did not occur in the
   bundled set.
6. **Namespacing.** Slash references in descriptions and bodies to `/poteto:<name>`.

## Patches by skill

| Skill | Files | Classes | Notes |
|---|---|---|---|
| `how` | `SKILL.md` | 1, 2 | Explorer, explainer, and critic params; critic list is `opus`, `fable`, `sonnet` plus an optional Codex CLI run. |
| `why` | `SKILL.md` | 1, 2 | MCP discovery rewritten for `mcp__<server>__<tool>` names and `ToolSearch`; investigators and synthesizer stay on `general-purpose` because they need MCP tools. |
| `architect` | `SKILL.md` | 1, 6 | Runner list; `/poteto:architect` in description and Phase C. |
| `arena` | `SKILL.md` | 1, 3, 6 | Runner and cross-judge lists; `/poteto:arena` in description. |
| `create-verification-skill` | `SKILL.md` | 4, 6 | Output path `.claude/skills/verify-<app>/`; `/poteto:create-verification-skill` in description. |
| `maintain-verification-skill` | `SKILL.md` | 4, 6 | Target path `.claude/skills/verify-*/`; description. |
| `interrogate` | `SKILL.md` | 1, 2, 3 | Reviewer table `fable` / `opus` / `sonnet` / Codex CLI; params; the slug-fallback paragraph shortened to one sentence. |
| `reflect` | `SKILL.md`, `references/synthesizer.md`, `references/judgment-reviewer.md`, `references/tooling-reviewer.md`, `references/divergent-reviewer.md` | 1, 2, 4, 5, 6 | Transcript lookup; reviewer and synthesizer params and models; `create-skill` routing; skill paths in the three reviewer prompts; `/poteto:reflect`. |
| `technical-writing` | `SKILL.md` | 6 | Description only. |
| `principle-prove-it-works` | `SKILL.md` | prose | The `show-me-your-work` mention now says the skill is upstream-only and names `pm/log.md` as pm-skill's trail. |
| `unslop`, `blast-radius`, `teach`, `typescript-best-practices`, `bro`, the other 20 `principle-*` | none | none | Byte-identical to upstream. |

## Excluded upstream skills

| Skill | Reason |
|---|---|
| `poteto-mode`, playbooks, `poteto-agent` | Orchestration entry point built on "never block on the human"; conflicts with pm-skill's sign-off gate. Also depends on `cursor-team-kit`, Graphite, Bugbot, `/goal`, and `mode: true` frontmatter. |
| `swarm` | Built on Cursor cloud workers (`environment: "cloud"`); pm-skill's `parallel-execution.md` and the Claude Code harness cover the shape. |
| `figure-it-out` | pm-skill's spec, plan, and stories pipeline is the same role; depends on `poteto-mode` and `show-me-your-work`. |
| `show-me-your-work` | A second decision trail next to `pm/log.md`; its log-audit idea moved into `/pm-skill:handoff`. |
| `recall` | `/pm-skill:resume` and `/pm-skill:handoff` cover PM-managed work; needs the transcript-path patch for anything else. |
| `tdd` | Conflicts in name and default with the superpowers TDD skill; pm-skill's `test-engineer` covers TDD-red. |
| `no-comments`, Comment Sicko | Taste; needs an agent file. |
| `automate-me`, `setup-pstack` | Cursor `create-skill` and `pstack-models.mdc` mechanisms. |
| Benny automations | Cursor automations; a Claude Code equivalent would be a rewrite. |

## Re-sync recipe

1. `git clone --depth 1 --filter=blob:none --sparse https://github.com/cursor/plugins.git` and
   `git sparse-checkout set pstack`.
2. Copy each bundled skill directory over `plugins/poteto/skills/<name>/`.
3. Re-apply the patches in the table above. `grep -rnE '\.cursor|grok-4|sol-max|thinking-max|generalPurpose|pstack-models|agent-transcripts|create-skill' plugins/poteto/skills` lists what regressed.
4. Update the SHA and pstack version at the top of this file and in `.claude-plugin/plugin.json`.
5. Run `bash scripts/validate.sh` from the repository root.
