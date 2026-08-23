# Model Tiering

Control cost/quality by giving heavier work a stronger model and routine work a cheaper one.

## Shipped defaults (v0.13)
Every agent ships pinned to an explicit model **and** reasoning-effort level, so the workflow's
behaviour is reproducible regardless of which model the session happens to run. The judgement-heavy
core runs on one model — `opus` — differentiated by effort; the breadth/documentation roles run
on `sonnet`. Aliases resolve to the Claude 5 family (`opus` → Opus 5, `sonnet` → Sonnet 5) and
auto-track future releases within each tier:

| Agent | Model | Effort | Why |
| --- | --- | --- | --- |
| `expert-builder` | `opus` | `xhigh` | writes the code — the deepest-thinking agent in the fleet |
| `codex-builder` | `sonnet` | `medium` | thin wrapper; local Codex does the implementation at `gpt-5.6-sol` / `high` |
| `security-auditor` | `opus` | `high` | adversarial security reasoning rewards extra thinking depth |
| `debugger` | `opus` | `high` | root-cause analysis is the workflow's hardest read-only task |
| `code-integrity-reviewer` | `opus` | `medium` | judgement-heavy review at standard depth |
| `architecture-reviewer` | `opus` | `medium` | design judgement at standard depth |
| `pm-verifier` | `opus` | `medium` | independent evidence-checking at standard depth |
| `test-engineer` | `opus` | `medium` | derives tests from written criteria |
| `codebase-analyst` | `sonnet` | `medium` | reads and summarises; breadth over depth |
| `technical-writer` | `sonnet` | `medium` | documents already-shipped facts |
| `researcher` | `sonnet` | `medium` | web research; breadth and sourcing over depth |
| `codex-researcher` | `sonnet` | `medium` | thin wrapper — the thinking happens inside Codex |

Effort — not model tier — is the quality lever within the core: the builder thinks hardest
(`xhigh`), the two rare, hard-problem analysts (`security-auditor`, `debugger`) keep targeted
extra depth (`high`), and everything else runs standard depth (`medium`).

Pinned agents do **not** follow the session model — changing the session tier changes only the PM
itself, not the specialists.

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
- **Stronger builder:** pin `expert-builder` back to `fable` if you want the top tier writing code
  regardless of cost.
- **Codex builder:** change the inner default per dispatch with the agent's `Model` / `Effort`
  inputs. Do not add free-form CLI flags to the runner.
- **Cheaper everywhere:** pin agents down a tier (e.g. reviewers to `sonnet`) and/or lower their
  effort. Scaling down never relaxes the workflow's gates — a cheap reviewer still needs its
  verdict, and `pm-verifier` PASS is still required to ship.

## Guidance, not automation
The PM never silently switches models mid-project. If you change the mapping, record it in the
project `CLAUDE.md` so it's visible and reproducible.
