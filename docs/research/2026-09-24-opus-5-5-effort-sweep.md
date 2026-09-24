# Claude Opus 5.5 effort sweep for the Opus fleet

Date checked: 2026-09-24

Scope: the eight `claude-opus-5-5` agents in `plugins/deliver/agents/`, moved from `claude-opus-5`
in 0.26.0. Which effort each role should ship at, and what the move changes in cost and behaviour.

Method: documentation-driven, like the 2026-08-26 sweep. Anthropic's Opus 5.5 model, migration,
prompting, and effort pages were read on the date above, together with the launch announcement and
the independent evaluations published in the first two days. No local runs were made; the fleet has
no effort-level harness, and `/deliver:benchmark-builders` compares builders, not effort levels. The
decisions below are the best reading of first-party measurements, and the last section names the
two experiments that would replace them with local evidence.

## Bottom line

- Effort level names do not mean the same thing on Opus 5.5 as on Opus 5. Anthropic's default moved
  from `high` to `medium`, and its own measurements put Opus 5.5 at `medium` at or above Opus 5 at
  `high` on agentic coding and knowledge work, in fewer steps and with fewer tokens. On several
  coding evaluations `low` comes close.
- At any given level, Opus 5.5 thinks more per turn than Opus 5, most of all at `xhigh` and `max`.
  Carrying a level name over is therefore a one-notch increase in thinking, not a like-for-like move.
  Anthropic says to re-run the sweep rather than carry settings over.
- Per-token prices fell 20%, cache reads 60%, output speed rose over 30%, and Anthropic's typical
  workloads cost 40% less at default settings.
- Code review is the role-specific result that matters most here: Anthropic reports Opus 5.5 at its
  lowest effort catching 72% of known bugs against Opus 5's 56% at `high`, and early testers
  reported fewer false alarms. CodeRabbit's independent run found the lower-effort configuration
  gave better precision on its broad 80-pattern set and the higher one caught more on its 13 hard
  cases at lower precision and about 60% more tokens.
- Effort still buys accuracy on some agentic coding: CursorBench 4.0 moves from 52.5% at `medium`
  to 57.8% at `xhigh`, while FrontierCode does not move at all (54.6% against 54.4%).

The shipped result: `expert-builder` drops from `high` to `medium`. `security-auditor` and
`debugger` keep `high`. The five `medium` roles stay at `medium`. No Opus role ships at `xhigh` or
`max`, as before.

## Evidence

| Claim | Source | Confidence |
| --- | --- | --- |
| Default effort is `medium`; a request that omits it runs one level lower than on Opus 5 | Anthropic effort and what's-new pages | High |
| `medium` on Opus 5.5 matches or exceeds `high` on Opus 5 for coding and knowledge work; `low` close on several coding evals | Anthropic prompting guide, "Calibrate effort" | High, first-party evals |
| More thinking per turn at a given level, especially `xhigh` and `max`; re-run the sweep | Anthropic what's-new and prompting guide | High |
| Reserve `xhigh` and `max` for measured gains; lower effort before prompting for less thinking | Anthropic prompting guide | High |
| Lowest effort caught 72% of known review bugs vs Opus 5 `high` at 56%; fewer false alarms | Anthropic launch post | Medium, first-party and unaudited |
| Lower-effort review: 63.8% catch, 38.6% precision on 80 patterns; higher-effort: 62.5% and 35.7%. On 13 hard cases higher effort caught 10 vs 8 at 52.0% vs 66.7% precision, with roughly 60% more tokens | CodeRabbit evaluation | Medium, independent but small |
| CursorBench 4.0 gains five points from `medium` to `xhigh`; FrontierCode v1.1 does not move | Anthropic launch post, Vellum and Orcarouter write-ups | Medium; effort configurations differ across published runs |
| Terminal-Bench 4.0 at `xhigh` is 66.4% against Opus 5 at `max` 52.3%; default effort beats Opus 5 `max` at about a fifth of the cost | Anthropic launch post | Medium, first-party |
| Boundary circumvention about 85% less frequent than Opus 5; matches or beats Opus 5 on prompt injection | Anthropic launch post, Gray Swan benchmark | Medium |
| Sustains long unattended runs better; may end a turn with a text report while items are open | Anthropic prompting guide, "Unattended agentic runs" | High |
| Text between tool calls returns as thinking blocks, empty at the default display | Anthropic what's-new | High; affects API integrations, not Claude Code subagents |
| Claude Code added `claude-opus-5-5` in `v2.1.280` and made it the default Opus model | Claude Code changelog, 2026-09-22 | High |

No independent comparison at matched effort levels existed at the time of checking. Every
cross-model number above comes from Anthropic or from a vendor run with its own configuration.

## Decisions by role

Two rules drove the mapping. First, the level a role sat at on Opus 5 is a target amount of
thinking, not a name to preserve, so the question for each role is which Opus 5.5 level gives at
least that much. Second, the fleet's standing policy from the 2026-08-26 sweep still holds: explicit
scope, current evidence, and observable completion criteria fix focus failures better than extra
thinking, and higher effort raises latency, tool use, and token use.

| Agent | Opus 5 | Opus 5.5 | Reasoning |
| --- | --- | --- | --- |
| `expert-builder` | `high` | `medium` | The role Anthropic's coding evidence addresses directly. `medium` is measured at or above Opus 5 `high` on multi-step repository work in fewer steps and tokens, it is the level Anthropic says to start at, and it is the level at which the 40% cost reduction was measured. The builder runs on every story and dominates fleet cost. Keeping `high` would be a one-notch increase in thinking on the role the earlier sweep found most prone to scope expansion under deeper effort. The CursorBench gain at `xhigh` is real but is the case for a measured override, not a default. |
| `security-auditor` | `high` | `high` | Runs only on stories that touch auth, crypto, secrets, untrusted input, or I/O, so its cost is bounded. Recall matters more than precision on that surface, and the one independent data point on hard review cases favours more effort for recall. `high` on Opus 5.5 is deeper than `high` on Opus 5; that is accepted for this lens. |
| `debugger` | `high` | `high` | Dispatched only on a gate failure or a stalled fix loop, so it is rare and always on the hardest case in the workflow. Same recall argument as the auditor. |
| `code-integrity-reviewer` | `medium` | `medium` | The review evidence says lower effort already beats Opus 5 `high` on catch rate and gives better precision on broad sets. `medium` is the default and the level Anthropic's review claims were made at. Moving a gate role to `low` without local evidence is a larger bet than this release makes; see the next section. |
| `architecture-reviewer` | `medium` | `medium` | Same as the integrity reviewer. |
| `pm-verifier` | `medium` | `medium` | The ship gate. Unchanged for the same reason, and because no role-specific evidence for `low` exists for evidence-checking. |
| `test-engineer` | `medium` | `medium` | Derives tests from written criteria; no evidence either way for a move. |
| `spec-architect` | `medium` | `medium` | Design judgement once per sprint; cost is not the constraint. |

Net effect against Opus 5: the builder should cost noticeably less per story and finish in fewer
steps at the same or better quality. The two `high` roles will think more per run than they did on
Opus 5, partly offset by the cheaper tokens. The five `medium` roles get one notch more thinking
than before at a lower per-token price.

## What the move does not change

- The `xhigh` and `max` prohibition on shipped Opus roles, checked by `scripts/validate.sh`.
- The role contracts from the 2026-08-26 sweep: re-ground in current inputs, one target and one
  role, a real stop condition, missing evidence reported rather than filled in, and writer scope
  checked from Git. Anthropic's Opus 5.5 guidance is consistent with all five.
- The four breaking API changes (thinking cannot be disabled, forced tool use rejected, thinking
  blocks bound to the producing model, new computer-use toolset) do not reach this plugin. Claude
  Code owns the request; the agent frontmatter sets only `model` and `effort`.

## Things to watch after the move

- **Early turn ends.** Anthropic says Opus 5.5 may end a turn with a text report while checklist
  items are still open. The PM already treats a builder summary as a report, not as completion, and
  derives changed paths from Git. If builders start returning with open work and no stated blocker,
  the implementation loop's re-dispatch rule is the fix, not a higher effort.
- **Review round counts.** If the number of fix rounds per story rises after the builder moves to
  `medium`, that is the signal to run the builder experiment below before touching the default.
- **Claude Code version.** `v2.1.280` is the minimum; `/deliver:doctor` flags older installs.

## Recommended next experiments

Both use the same design: several representative stories, repeated runs, measured outside the
delivery workflow, comparing pass rate, review findings, fix rounds, wall time, and output tokens.

1. **Builder at `high` against `medium`.** The only shipped change in this sweep, and the one with
   a published counter-signal (CursorBench). Run first if fix rounds rise.
2. **Reviewers at `low` against `medium`.** Anthropic's own review numbers and CodeRabbit's
   precision result both point at `low` being enough for `code-integrity-reviewer` and
   `architecture-reviewer`. This is the largest remaining cost lever in the fleet. Keep
   `pm-verifier` at `medium` regardless until it has its own evidence.

## Sources

- [What's new in Claude Opus 5.5](https://platform.claude.com/docs/en/models/opus-5-5/whats-new-opus-5-5)
- [Migrating to Claude Opus 5.5](https://platform.claude.com/docs/en/models/opus-5-5/migration-guide)
- [Prompting Claude Opus 5.5](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5-5)
- [Effort](https://platform.claude.com/docs/en/build-with-claude/effort)
- [Models overview](https://platform.claude.com/docs/en/models/overview)
- [Introducing Claude Opus 5.5](https://www.anthropic.com/claude-opus-5-5)
- [CodeRabbit: Claude Opus 5.5 code review benchmarks](https://www.coderabbit.ai/blog/opus-5-5-model-review)
- [Vellum: Claude Opus 5.5 benchmarks explained](https://www.vellum.ai/blog/claude-opus-5-5-benchmarks-explained)
- [Orcarouter: Claude Opus 5.5 vs Claude Opus 5](https://www.orcarouter.ai/blog/claude-opus-5-5-vs-claude-opus-5)
- [Claude Code changelog](https://code.claude.com/docs/en/changelog)
- The previous sweep: `docs/research/2026-08-26-opus-agent-performance.md`
