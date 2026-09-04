# Model tiering

Control cost and quality by giving heavier work a stronger model and routine work a cheaper one.
This file is repository documentation. The agents do not load it; each one pins its own model and
effort in its frontmatter.

## Shipped defaults (v0.19)

Every agent declares a model and effort level. Opus roles use `claude-opus-5` instead of the moving
`opus` alias, so a future Opus release cannot change the gate-bearing fleet without an explicit
plugin update and evaluation. The Sonnet breadth roles still use the moving `sonnet` alias, where a
silent change carries less delivery risk.

| Agent | Model | Effort | Why |
| --- | --- | --- | --- |
| `expert-builder` | `claude-opus-5` | `high` | broad implementation at the deepest shipped Opus effort |
| `codex-builder` | `sonnet` | `medium` | thin wrapper; local Codex implements at `gpt-6-astra` / `high`, falling back to `gpt-5.6-sol` / `medium` when the account refuses it |
| `security-auditor` | `claude-opus-5` | `high` | adversarial security reasoning rewards extra thinking depth |
| `debugger` | `claude-opus-5` | `high` | root-cause analysis is the workflow's hardest read-only task |
| `code-integrity-reviewer` | `claude-opus-5` | `medium` | judgement-heavy review at standard depth |
| `architecture-reviewer` | `claude-opus-5` | `medium` | design judgement at standard depth |
| `pm-verifier` | `claude-opus-5` | `medium` | independent evidence-checking at standard depth |
| `test-engineer` | `claude-opus-5` | `medium` | derives tests from written criteria |
| `spec-architect` | `claude-opus-5` | `medium` | design judgement, turns plan decisions into contracts |
| `codebase-analyst` | `sonnet` | `medium` | reads and summarises; breadth over depth |
| `technical-writer` | `sonnet` | `medium` | documents already-shipped facts |
| `researcher` | `sonnet` | `medium` | web research; breadth and sourcing over depth |
| `librarian` | `sonnet` | `medium` | summarises shipped artifacts into wiki pages |
| `codex-researcher` | `sonnet` | `medium` | thin wrapper; the thinking happens inside Codex |
| `codex-reviewer` | `sonnet` | `medium` | thin wrapper; the review happens inside Codex |
| `codex-advisor` | `sonnet` | `medium` | thin wrapper; the opinion happens inside Codex |

`high` is the builder default because higher effort increases latency, tool use, and token use, and
current evidence, explicit scope, and observable completion criteria fix focus failures better than
extra thinking does. No shipped Opus role uses `xhigh` or `max`. Test any deeper override outside the
delivery workflow, on several representative stories, before you change a fleet default.

Pinned agents do not follow the session model. Changing the session tier changes the PM itself, not
the specialists.

Claude Code can override these files through `CLAUDE_CODE_SUBAGENT_MODEL`, an invocation-specific
model, or an organization model allowlist. `/pm-skill:doctor` records the configured agent values and
the Claude Code version, and flags host-level model or effort overrides. A model name the agent
guessed is not evidence.

`codex-builder` has two model settings. Its Claude wrapper stays on `sonnet` / `medium`; the bundled
runner defaults the implementation run to `gpt-6-astra` / `high`, with a one-time
fallback to `gpt-5.6-sol` / `medium` when the account refuses it. Override the inner model or effort only in an
explicit dispatch. Valid efforts are `none|minimal|low|medium|high|xhigh|max`. The
runner ignores Codex user config and overrides safety-sensitive project settings, so local defaults
cannot silently change its sandbox, model, effort, network, web, MCP, or hook posture.

## Overriding

- **Per agent, model.** Edit the `model:` field in the agent's frontmatter: any Claude Code model
  alias (`haiku`/`sonnet`/`opus`/`fable`), a full model ID, or `inherit` to follow the session.
  Plugin updates overwrite edited bundled agents, so keep a note of your overrides.
- **Per agent, effort.** Edit the `effort:` field: `low`, `medium`, `high`, `xhigh`, or `max`, with
  the available levels depending on the model. Remove the field to inherit the session's effort.
- **Deeper builder.** Override `expert-builder` to `xhigh` only for an external, controlled
  evaluation. Compare repeated runs with `high` before changing the fleet default.
- **Codex builder.** Change the inner default per dispatch with the agent's `Model` and `Effort`
  inputs. Do not add free-form CLI flags to the runner.
- **Cheaper everywhere.** Pin agents down a tier (reviewers to `sonnet`, for example) or lower their
  effort, or both. Scaling down never relaxes the workflow's gates: a cheap reviewer still owes a
  verdict, and `pm-verifier` PASS is still required to ship.

## Guidance, not automation

The PM never silently switches models mid-project. If you change the mapping, record it in the
project `AGENTS.md` so it is visible and reproducible.
