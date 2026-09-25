# Model tiering

Control cost and quality by giving heavier work a stronger model and routine work a cheaper one.
This file is repository documentation. The agents do not load it; each one pins its own model and
effort in its frontmatter.

## Shipped defaults (0.27)

Every agent declares a model and effort level. Every role that does its own model work runs on
`claude-opus-5-5`, pinned instead of the moving `opus` alias, so a future Opus release cannot change
it without an explicit plugin update and evaluation. Effort does the tiering within Opus:
gate-bearing roles run at `medium` or `high`, and the four breadth roles run at `low`, the level
Anthropic names for subagents and simple tasks. The four Codex wrappers stay on the moving `sonnet`
alias at `medium`: they only marshal a Codex run, so a silent alias change carries no delivery risk.

| Agent | Model | Effort | Why |
| --- | --- | --- | --- |
| `expert-builder` | `claude-opus-5-5` | `medium` | broad implementation at the Opus 5.5 default, which matches Opus 5 at `high` on agentic coding |
| `codex-builder` | `sonnet` | `medium` | thin wrapper; local Codex implements at `gpt-6-astra` / `high`, falling back to `gpt-6-sol` / `medium` when the account refuses it |
| `security-auditor` | `claude-opus-5-5` | `high` | adversarial security reasoning rewards extra thinking depth |
| `debugger` | `claude-opus-5-5` | `high` | root-cause analysis is the workflow's hardest read-only task |
| `code-integrity-reviewer` | `claude-opus-5-5` | `medium` | judgement-heavy review at standard depth |
| `architecture-reviewer` | `claude-opus-5-5` | `medium` | design judgement at standard depth |
| `pm-verifier` | `claude-opus-5-5` | `medium` | independent evidence-checking at standard depth |
| `test-engineer` | `claude-opus-5-5` | `medium` | derives tests from written criteria |
| `spec-architect` | `claude-opus-5-5` | `medium` | design judgement, turns plan decisions into contracts |
| `codebase-analyst` | `claude-opus-5-5` | `low` | reads and summarises; breadth over depth |
| `technical-writer` | `claude-opus-5-5` | `low` | documents already-shipped facts |
| `researcher` | `claude-opus-5-5` | `low` | web research; breadth and sourcing over depth |
| `librarian` | `claude-opus-5-5` | `low` | summarises shipped artifacts into wiki pages |
| `codex-researcher` | `sonnet` | `medium` | thin wrapper; the thinking happens inside Codex |
| `codex-reviewer` | `sonnet` | `medium` | thin wrapper; the review happens inside Codex |
| `codex-advisor` | `sonnet` | `medium` | thin wrapper; the opinion happens inside Codex |

`medium` is the builder default on Opus 5.5. Effort level names do not carry the same amount of
thinking across models: Anthropic measured Opus 5.5 at `medium` matching or beating Opus 5 at `high`
on agentic coding in fewer steps and tokens, and at any given level Opus 5.5 thinks more per turn
than Opus 5 did. Higher effort still increases latency, tool use, and token use, and current
evidence, explicit scope, and observable completion criteria fix focus failures better than extra
thinking does. `security-auditor` and `debugger` keep `high` because they run rarely, on the hardest
cases, where recall matters more than token cost. The four `low` roles summarise, document, and
source rather than judge, so the cheapest level is enough. No shipped Opus role uses `xhigh` or
`max`. Test
any deeper override outside the delivery workflow, on several representative stories, before you
change a fleet default. The sweep behind these values is
`docs/research/2026-09-24-opus-5-5-effort-sweep.md`.

Pinned agents do not follow the session model. Changing the session tier changes the PM itself, not
the specialists.

Claude Code can override these files through `CLAUDE_CODE_SUBAGENT_MODEL`, an invocation-specific
model, or an organization model allowlist. `/deliver:doctor` records the configured agent values and
the Claude Code version, and flags host-level model or effort overrides. A model name the agent
guessed is not evidence.

`codex-builder` has two model settings. Its Claude wrapper stays on `sonnet` / `medium`; the bundled
runner defaults the implementation run to `gpt-6-astra` / `high`, with a one-time
fallback to `gpt-6-sol` / `medium` when the account refuses it. Override the inner model or effort only in an
explicit dispatch. Valid efforts are `low|medium|high|xhigh|max`. Since
0.23 the runner runs Codex without an OS sandbox and with the user's own config, so MCP servers and
web search apply as configured; it still pins the model and effort it was asked for and keeps
Codex hooks and subagents off.

## Overriding

- **Per agent, model.** Edit the `model:` field in the agent's frontmatter: a Claude Code model
  alias (`haiku`, `sonnet`, `fable`), a full model ID, or `inherit` to follow the session. The
  shipped value is the pinned `claude-opus-5-5`; the moving `opus` alias fails `validate.sh` and doctor.
  Plugin updates overwrite edited bundled agents, so keep a note of your overrides.
- **Per agent, effort.** Edit the `effort:` field: `low`, `medium`, `high`, `xhigh`, or `max`, with
  the available levels depending on the model. Remove the field to inherit the session's effort.
- **Deeper builder.** Override `expert-builder` to `high` or `xhigh` only for an external,
  controlled evaluation. Compare repeated runs with `medium` before changing the fleet default.
- **Codex builder.** Change the inner default per dispatch with the agent's `Model` and `Effort`
  inputs. Do not add free-form CLI flags to the runner.
- **Cheaper everywhere.** Lower an agent's effort first; on Opus 5.5 that is the better lever than
  dropping to a smaller model. Pin a role to `sonnet` or `haiku` only when you have measured it. Scaling down never relaxes the workflow's gates: a cheap reviewer still owes a
  verdict, and `pm-verifier` PASS is still required to ship.

## Guidance, not automation

The PM never silently switches models mid-project. If you change the mapping, record it in the
project `AGENTS.md` so it is visible and reproducible.
