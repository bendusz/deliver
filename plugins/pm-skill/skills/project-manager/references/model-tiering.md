# Model tiering

Control cost/quality by giving heavier work a stronger model and routine work a cheaper one.

## Shipped defaults (v0.15)
Every agent declares a model and effort level. Opus roles use `claude-opus-5` instead of the moving
`opus` alias. This keeps a future Opus release from changing the gate-bearing fleet without an
explicit plugin update and evaluation. The Sonnet breadth roles still use the moving `sonnet` alias,
where a silent change has less delivery risk.

| Agent | Model | Effort | Why |
| --- | --- | --- | --- |
| `expert-builder` | `claude-opus-5` | `high` | broad implementation at the deepest shipped Opus effort |
| `codex-builder` | `sonnet` | `medium` | thin wrapper; local Codex does the implementation at `gpt-5.6-sol` / `high` |
| `security-auditor` | `claude-opus-5` | `high` | adversarial security reasoning rewards extra thinking depth |
| `debugger` | `claude-opus-5` | `high` | root-cause analysis is the workflow's hardest read-only task |
| `code-integrity-reviewer` | `claude-opus-5` | `medium` | judgement-heavy review at standard depth |
| `architecture-reviewer` | `claude-opus-5` | `medium` | design judgement at standard depth |
| `pm-verifier` | `claude-opus-5` | `medium` | independent evidence-checking at standard depth |
| `test-engineer` | `claude-opus-5` | `medium` | derives tests from written criteria |
| `codebase-analyst` | `sonnet` | `medium` | reads and summarises; breadth over depth |
| `technical-writer` | `sonnet` | `medium` | documents already-shipped facts |
| `researcher` | `sonnet` | `medium` | web research; breadth and sourcing over depth |
| `codex-researcher` | `sonnet` | `medium` | thin wrapper — the thinking happens inside Codex |

`high` is the builder default because higher effort increases latency, tool use, and token use, and
focus failures are better addressed by current evidence, explicit scope, and observable completion
criteria. No shipped Opus role uses `xhigh` or `max`. Test any deeper override outside the delivery
workflow on multiple representative stories before changing a fleet default. `security-auditor`
and `debugger` remain at `high`; the other Opus roles use `medium`.

Pinned agents do **not** follow the session model — changing the session tier changes only the PM
itself, not the specialists.

Claude Code can override these files through `CLAUDE_CODE_SUBAGENT_MODEL`, an invocation-specific
model, or an organization model allowlist. `/pm-skill:doctor` records the configured agent values and
Claude Code version and flags host-level model or effort overrides. A model name guessed by the
agent is not evidence.

`codex-builder` has two model settings. Its Claude liaison stays on `sonnet` / `medium`; the
bundled runner defaults the actual implementation run to `gpt-5.6-sol` / `high`. Override the
inner model or effort only in an explicit dispatch. Valid Sol efforts are
`none|low|medium|high|xhigh|max`. The runner ignores Codex user config and overrides
safety-sensitive project settings so local defaults cannot silently change its sandbox, model,
effort, network, web, MCP, or hook posture.

## Overriding
- **Per agent, model:** edit the `model:` field in the agent's frontmatter — any Claude Code model
  alias (`haiku`/`sonnet`/`opus`/`fable`) or full model ID, or `inherit` to follow the session.
  (Plugin updates overwrite edited bundled agents — keep a note of your overrides.)
- **Per agent, effort:** edit the `effort:` field — `low`, `medium`, `high`, `xhigh`, or `max`
  (available levels depend on the model); remove the field to inherit the session's effort level.
- **Deeper builder:** override `expert-builder` to `xhigh` only for an external, controlled
  evaluation. Compare repeated runs with `high` before changing the fleet default.
- **Codex builder:** change the inner default per dispatch with the agent's `Model` / `Effort`
  inputs. Do not add free-form CLI flags to the runner.
- **Cheaper everywhere:** pin agents down a tier (e.g. reviewers to `sonnet`) and/or lower their
  effort. Scaling down never relaxes the workflow's gates — a cheap reviewer still needs its
  verdict, and `pm-verifier` PASS is still required to ship.

## Guidance, not automation
The PM never silently switches models mid-project. If you change the mapping, record it in the
project `CLAUDE.md` so it's visible and reproducible.
