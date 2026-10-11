# Port record

Upstream: `https://github.com/cursor/plugins`, directory `pstack`, commit
`978ca6e9c0e012047cd5058b8e829240336e704e` (pstack 0.15.17). Ported 2026-10-11.
Earlier syncs: `60c641e4fad674784b30abcf9f8915dea39df38d` on 2026-08-19 and
`bdf7aa355337897f167153e05069aca505dae17c` (pstack 0.14.3) on 2026-08-26. Every bundled skill
directory was re-copied from `978ca6e` and re-patched, so the whole bundle reflects that commit.

Skills bundled: 40

`scripts/validate.sh` (repository root) reads the line above and fails if the directory count
differs. Keep it current.

## Patch classes

1. **Models.** `claude-opus-5-5-xhigh` to `opus`; `grok-4.7-xhigh-fast` to `sonnet`. Panel
   defaults are `opus` and `sonnet`. Upstream 0.15.15 dropped its Fable and Sol seats, so the
   `fable` alias and the optional OpenAI Codex CLI seat (the port of `gpt-5.6-sol-max`) no longer
   appear in any bundled skill. Should upstream bring them back: `claude-fable-*` to `fable`,
   `gpt-*-sol-*` to "the OpenAI Codex CLI, when installed", skipped when absent.
2. **Subagent parameters.** `subagent_type: generalPurpose` to `general-purpose`; `readonly: true`
   to `subagent_type: Explore`; roles that need MCP tools stay on `general-purpose` with a note that
   `Explore` strips MCP access.
3. **Config lookups.** Sentences reading `~/.cursor/rules/pstack-models.mdc` removed; inline default
   stands. The role-line names, the `auto` / `inherit-parent` aliases, and the slug-family fallback
   go with them; one sentence remains ("If the Task tool rejects a model alias, use the closest
   available tier and say so").
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
| `how` | `SKILL.md` | 1, 2, 3 | One sentence sets explorer (`sonnet`) and explainer (`opus`) params on `Explore`. Upstream removed critique mode and its two reference files after 0.14.3; they are gone here too. |
| `why` | `SKILL.md` | 1, 2, 3, prose | "cursor location" (the text caret) became "the IDE selection when one is attached"; MCP discovery rewritten for `mcp__<server>__<tool>` names and `ToolSearch`; investigators (`sonnet`) and synthesizer (`opus`) stay on `general-purpose` because they need MCP tools. |
| `architect` | `SKILL.md` | 1, 3, 6 | Runner list `opus`, `sonnet`; `/poteto:architect` in description and Phase C. `references/design-red-flags.md` gained four red flags upstream, unpatched. |
| `arena` | `SKILL.md` | 1, 2, 3, 6 | Runner and cross-judge lists; runners on `general-purpose`, judge on `Explore`; `/poteto:arena` in description. |
| `create-verification-skill` | `SKILL.md` | 4, 6 | Output path `.claude/skills/verify-<app>/`; `/poteto:create-verification-skill` in description; `/poteto:maintain-verification-skill` in step 5. Unchanged upstream since `bdf7aa3`. |
| `maintain-verification-skill` | `SKILL.md` | 4, 6 | Target path `.claude/skills/verify-*/`; `/poteto:maintain-verification-skill` in description; `/poteto:create-verification-skill` in the intro and step 0. Unchanged upstream since `bdf7aa3`. |
| `interrogate` | `SKILL.md` | 1, 2, 3 | Reviewer table `opus` / `sonnet` on `Explore`; the two slug-fallback paragraphs shortened to one sentence. |
| `reflect` | `SKILL.md`, `references/synthesizer.md`, `references/judgment-reviewer.md`, `references/tooling-reviewer.md`, `references/divergent-reviewer.md` | 1, 2, 3, 4, 5, 6 | Transcript lookup; reviewer and synthesizer params and models (judgment, divergent, synthesizer `opus`; tooling `sonnet`); `create-skill` routing; skill paths in the three reviewer prompts; `/poteto:reflect`. |
| `technical-writing` | `SKILL.md` | 6 | Description only. |
| `principle-prove-it-works` | `SKILL.md` | prose | The `show-me-your-work` mention now says the skill is upstream-only and names the story's Execution block and merge commit body as deliver's trail (the `pm/log.md` it named before 0.24). |
| `benchmark-checklist` (new in 0.28) | `SKILL.md` | prose | Names three upstream `poteto-mode` playbooks (Opening a PR, Perf issue, Hillclimb). The first mention and one added sentence under "Other perf material" say they are upstream-only. |
| `ketchup` (new in 0.28) | `SKILL.md` | 6 | `/poteto:ketchup` in the description and body; the `/bro` link text became `/poteto:bro`. |
| `unslop` | `SKILL.md` | deviation | Upstream added `disable-model-invocation: true` after 0.14.3. The port drops that one line so `unslop` keeps auto-loading, because `technical-writing`, `teach`, and `blast-radius` tell the model to apply it. Body is upstream's, including new rules 32 and 33. |
| `blast-radius`, `teach`, `typescript-best-practices`, `bro`, `principle-explain-the-number`, `principle-attack-the-premise`, `principle-test-behavior-not-implementation` (the last three new in 0.28), the other 20 `principle-*` | none | none | Byte-identical to upstream. `typescript-best-practices` carries upstream's single-line `paths: ["**/*.ts", "**/*.tsx"]` and `disable-model-invocation: true` as shipped. |

Upstream now sets `disable-model-invocation: true` on every skill. The port takes that everywhere
except `unslop`, so `how`, `why`, and `typescript-best-practices` no longer trigger on their
descriptions (the last still loads by `paths:` if the host honours it under that flag).

## Excluded upstream skills

| Skill | Reason |
|---|---|
| `poteto-mode`, playbooks, `poteto-agent` | Orchestration entry point built on "never block on the human"; conflicts with deliver's sign-off gate. Also depends on `cursor-team-kit`, Graphite, Bugbot, `/goal`, and `mode: true` frontmatter. |
| `swarm` | Built on Cursor cloud workers (`environment: "cloud"`); deliver's `parallel-execution.md` and the Claude Code harness cover the shape. |
| `figure-it-out` | deliver's spec, plan, and stories pipeline is the same role; depends on `poteto-mode` and `show-me-your-work`. |
| `show-me-your-work` | A second decision trail next to deliver's own merge commit bodies; its log-audit idea moved into `/deliver:handoff`. |
| `recall` | `/deliver:resume` and `/deliver:handoff` cover PM-managed work; needs the transcript-path patch for anything else. |
| `tdd` | Conflicts in name and default with the superpowers TDD skill; deliver's `test-engineer` covers TDD-red. |
| `no-comments`, Comment Sicko | Taste; needs an agent file. |
| `automate-me`, `setup-pstack` | Cursor `create-skill` and `pstack-models.mdc` mechanisms. |
| `correct`, `make-bot-ui`, `poteto-help` | Added upstream between 0.14.4 and 0.15.17; not evaluated for the port. `poteto-help` routes into `poteto-mode` and `setup-pstack`; `make-bot-ui` is Grok Bot webhook tooling. |
| Benny automations | Cursor automations; a Claude Code equivalent would be a rewrite. |

## Re-sync recipe

1. `git clone --depth 1 --filter=blob:none --sparse https://github.com/cursor/plugins.git` and
   `git sparse-checkout set pstack`. Drop `--depth 1` to diff against the previous pinned commit.
2. Copy each bundled skill directory over `plugins/poteto/skills/<name>/`, deleting files upstream removed.
3. Re-apply the patches in the table above. `grep -rnE '\.cursor|grok-4|sol-max|thinking-max|generalPurpose|pstack-models|agent-transcripts|create-skill' plugins/poteto/skills` lists what regressed.
4. Update the SHA and pstack version at the top of this file and in `.claude-plugin/plugin.json`.
5. Run `bash scripts/validate.sh` from the repository root.
