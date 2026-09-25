# How to write Claude Code subagent files for Opus 5.5

Date checked: 2026-09-25

Question: what is the best current practice for standardising Claude Code subagent definition
files (plugin `agents/*.md` with YAML frontmatter) to get peak performance on Opus 5.5? How should
the task, boundaries, and guardrails be expressed, and what belongs in the file versus elsewhere?

Method: one Opus 5.5 research agent, web research only, no local runs. The report below is the
agent's, lightly reformatted. Page contents came through a summarising fetch, so check exact quotes
before relying on them. The companion note for Codex is
`2026-09-25-codex-task-briefing-practices.md`.

## Summary

Anthropic has no single guide to writing subagent files for Opus 5.5. The rules below combine the
Claude Code subagent and best-practices docs, the platform prompting guides for Opus 5.5 and Opus 5,
and one measured practitioner source (obra/superpowers' 2026 eval work).

## 1. Recommendations

1. **Start the body with one role sentence and a "Done means:" line.** The finish line tells the
   agent when to return. The Opus 5.5 blog says to name the finish line [S1]; Tembo says subagents
   do best with "one job and a clear definition of done" [S11].
2. **Keep per-task details out of the file.** The file holds the standing role, behaviour and
   constraints. The docs say "Avoid repeating task details" because the delegation message carries
   them [S3]. The PM's dispatch should also pass on any global constraints that bind the task:
   superpowers found reviewers missed a version floor that no dispatch mentioned [S9].
3. **List the required inputs and say what to do when one is missing.** For example: return
   `BLOCKED: <what>` and stop. Anthropic's multi-agent write-up says each subagent needs "an
   objective, an output format, guidance on the tools and sources to use, and clear task
   boundaries" [S7].
4. **Limit scope with a positive rule that has a named-risk exception.** For example: "Start from
   the diff; open other code only to check a consequence you can name." In superpowers'
   measurements, reviewers with a diff-scope guard used 6 to 16 tool calls. Reviewers without one
   used 50 or more and ran repo-wide greps [S9].
5. **Say when to stop, and name the stops you don't want.** Opus 5.5 "is responsive to instructions
   that name the specific kinds of early stop you want it to avoid" and to naming the stops you do
   want [S2]. For a subagent, ending its turn means returning to the PM. So the rule is: return when
   the task is finished or blocked, never with a progress report.
6. **Enforce boundaries with configuration, not prose.** Use `tools`/`disallowedTools` and hooks.
   The docs say "hooks are deterministic" while written instructions "are advisory" [S4]. Plugin
   agents ignore `hooks`, `permissionMode` and `mcpServers` [S3], so for a plugin the tool allowlist
   and the plugin-level hooks are the enforcement.
7. **Ask reviewers for file:line, why it is wrong, and how to show it fails.** This is Anthropic's
   Opus 5.5 review prompt [S1].
8. **Have reviewers report every real finding at its true severity, and filter afterwards.**
   Telling Opus 5 "only report high-severity issues" or "be conservative" makes it report less.
   Anthropic suggests asking for everything and filtering in a separate pass [S5]. Balance this by
   defining which severities block, because a reviewer "prompted to find gaps will usually report
   some" [S4].
9. **Require evidence for each check item.** Each item needs file:line, not a bare yes/no.
   Superpowers added this after reviewers gave unsupported "yes" answers while the defect was in the
   diff [S9].
10. **Name specific failure modes instead of giving generic directives.** Opus 5.5 "responds well
    to instructions that name specific patterns to avoid" [S2].
11. **Give the reason for a non-obvious rule in one clause.** Explaining why helps Claude "deliver
    more targeted responses" [S6].
12. **Write in a normal tone, without CAPS or MUST.** Turn "CRITICAL: You MUST use this tool" into
    "Use this tool when…" [S6]. If you need emphasis, put it on one line only [S4].
13. **Fix the return shape and lead with the outcome.** Put the verdict first [S5]. Keep the
    summary condensed, about 1,000 to 2,000 tokens [S8].
14. **Keep the file to the minimum that fully describes the behaviour.** Aim for "the minimal set
    of information that fully outlines your expected behavior" [S8]. Test each line with "Would
    removing this cause Claude to make mistakes?" [S4]. When two phrasings work equally well, use
    the shorter one [S10].
15. **Use a positive recipe when the output is something the agent composes.** Discrete
    prohibitions are fine. In superpowers' micro-tests a composition prohibition did worse than no
    guidance at all; a positive recipe won [S10].

## 2. Leave out

- **"Think carefully" / "think step by step".** Opus 5.5 always thinks, and effort is the control.
  Removing the line made replies start sooner "with no clear decline in the quality" [S2].
- **Self-verification ("double-check", "include a final verification step").** It causes
  over-verification and adds cost without improving results [S5].
- **Instructions to write out reasoning in the reply.** These can be declined under the
  `reasoning_extraction` refusal category [S2].
- **CAPS, CRITICAL, "if in doubt, use X".** These cause overtriggering on current models [S6].
- **Project facts such as commands, conventions and layout.** The CLAUDE.md hierarchy (and so
  AGENTS.md via `@import`) loads into every subagent unless `omitClaudeMd` is set [S3].
- **Prose that repeats the tool allowlist.** "Do not modify files" adds nothing when `Write`/`Edit`
  aren't granted.
- **"Only report high-severity" / "be conservative".** It cuts recall [S5].
- **Open-ended directives ("check all uses"), or re-running tests the implementer already ran.**
  Reviewers read them literally, and cost goes up 4 to 8 times [S9].
- **Exhaustive edge-case lists.** Use "diverse, canonical examples" instead [S8].
- **Generic quality rules ("write clean code").** The CLAUDE.md "exclude" list names these [S4].
- **Long example blocks in `description`.** Descriptions should be short, and combined
  descriptions over 15,000 tokens trigger a warning [S3].

## 3. Frontmatter reference

From [S3], with versions from the changelog [S12] (current release 2.1.282):

- **`name`** (required). The identifier. Plugin agents show as `plugin:name`. Hooks receive it as
  `agent_type`.
- **`description`** (required). This is what the parent reads to decide whether to delegate. Write
  it as a triage rule: when to use it, what it needs, what it returns. "Use proactively" or "use
  after X" encourages delegation.
- **`tools`**. An allowlist. If omitted, the agent inherits every tool. Leaving out `Agent` also
  stops the agent spawning subagents. `Agent(type)` restricts which agents it may spawn.
- **`disallowedTools`**. Subtracts tools, is applied first, and accepts MCP patterns. Plugin agents
  support it since 2.1.78.
- **`model`**. An alias, a full ID, or `inherit`. Precedence: per-spawn override, then frontmatter,
  then `CLAUDE_CODE_SUBAGENT_MODEL`, then the main model. `CLAUDE_CODE_SUBAGENT_MODEL_FORCE`
  (2.1.257) overrides all of them. Use full IDs to pin a version [S13].
- **`effort`**. `low` to `max`. It overrides the session level, but not the env var or org caps
  [S13]. It was ignored on pinned-default models until 2.1.267. The Opus 5.5 default is `medium`,
  so `effort: medium` behaves exactly like omitting it; the docs still recommend setting it
  explicitly [S14]. Opus 5.5 at `low` "comes close" to `medium` on several coding evals [S2], so
  sweep rather than guess.
- **`maxTurns`**. A hard stop. Since 2.1.246 the output comes back marked partial, with a hint to
  continue via `SendMessage`.
- **`omitClaudeMd`** (2.1.271, new). Drops the user, project and local CLAUDE.md files. Don't use
  it where the agent depends on AGENTS.md.
- **`experimental.cacheTtl`** (2.1.248, new). Per-agent prompt-cache TTL, `5m` or `1h`.
- **`skills`**. Preloads full skill content.
- **`memory`**. Persistent memory, scoped `user`, `project` or `local`.
- **`background`**. Runs the agent in the background. Mostly redundant, since subagents already
  run in the background by default in interactive sessions.
- **`isolation: worktree`**. Gives the agent its own worktree. For writers, not reviewers.
- **`initialPrompt`**. Only applies when the agent runs as the main session. Ignored for plugins.
- **`color`**. Display only.
- **`permissionMode`, `hooks`, `mcpServers`**. Ignored in plugin agents.

Fields the deliver agents do not use: `omitClaudeMd` and `experimental.cacheTtl` are the recent
additions, and `maxTurns`/`disallowedTools` are also unused. The changelog has no dates, so the
exact release dates are unverified. A community PR found by grepping the raw changelog that only
`omitClaudeMd` is new in September 2026 [S15].

## 4. Recommended template (about 345 words)

```
---
name: code-integrity-reviewer
description: Use after every build and every fix round, once the PM has the story diff, to review it for correctness, security basics, and convention adherence. Needs the diff text in the dispatch; read-only; returns graded findings and a PASS/CONCERNS/FAIL verdict.
tools: Read, Grep, Glob
model: claude-opus-5-5
effort: medium
color: red
---

You review one story's diff. Done means: you have read every changed hunk and every contract it changes, placed each acceptance criterion as met, unmet, or not verifiable, and returned the report below.

## Inputs
The dispatch gives you the story file (acceptance criteria, scope, `Specs`) and the diff text. If either is missing, return `BLOCKED: <what is missing>` and stop. Don't reconstruct the diff from the tree.

## What to check
- Each acceptance criterion the story states.
- Correctness: logic errors, edge cases, broken contracts.
- Security basics: injection, auth, secret handling, unsafe deserialization, path traversal.
- Conventions from `AGENTS.md`: error handling, naming, dead or duplicated code, missing tests.
- Specs: a `Must`, `Must not`, or `Exposes` violation, or a `.sdd` change outside the story's `Specs`, is `major`.

## How to review
Start from the diff. Open other code only to check a consequence you can name, such as a changed signature's callers. When the diff can't settle a question, say what evidence is missing and which test would settle it. Report every real finding at its true severity; the PM filters. `block` breaks correctness, security, or an acceptance criterion; `major` must not merge unfixed; `minor` is polish. Over-grading costs a needless fix round; under-grading ships a bug.

Return only when the diff is covered or input is missing.

## Return
Verdict first: FAIL for any block or major, CONCERNS for minors only, otherwise PASS.
Then one entry per finding:
- `severity` and `file:line`
- What is wrong and why.
- How to show it fails: an input, call, or test.
- A concrete fix.
Then `Not verifiable from the diff:` one line per item, or `none`.
End with one line naming the files and contracts you inspected.
```

## 5. Assessment of the shipped `code-integrity-reviewer.md` (0.26.0)

**What it already does right:**
- The description gives when to use it, what it needs ("Requires the PM-generated diff text as
  input (it cannot diff itself)"), and what it returns.
- It has a tool allowlist, a pinned full model ID and an explicit effort.
- "Open adjacent code only to verify a named consequence" matches the measured scope guard [S9].
- "Name missing evidence instead of assuming" is good.
- The severity definitions come with a reason ("Inflated severity forces a needless fix round").
- The return shape is fixed. There are no CAPS, no "think carefully" and no self-verification
  lines.

**What to change:**
1. **Add a finish line.** There is no "Done means" sentence.
2. **Add a rule for missing input.** Nothing says what to do if the diff is absent.
3. **Replace "Do not run tests or modify files."** It is redundant: without Bash, Write or Edit the
   agent can't do either. Swap it for "say which test would settle it".
4. **Add a reproduction field.** "the problem, a concrete fix" should also cover how to show it
   fails [S1].
5. **Make acceptance criteria produce a status.** "Acceptance criteria. Every one the story
   states." should give a per-criterion met/unmet/not-verifiable result, which enforces the
   evidence rule [S9].
6. **Move the verdict to the top of the Return section** [S5].
7. **Balance the severity sentence.** "Inflated severity…" alone pushes toward conservatism, which
   cuts recall [S5]. Add the cost of under-grading.
8. **Keep `effort: medium`.** The 2026-09-24 sweep document is the right place to decide whether
   `low` holds.
9. **Don't adopt `omitClaudeMd`.** The agent relies on AGENTS.md.

All nine were applied across the fleet in 0.27.0.

## 6. Sources

- [S1] https://claude.dev/blog/getting-the-most-out-of-opus-5-5/ (2026-09-22, Addy Osmani). Finish
  lines, stopping rules, deleting "think carefully", the review prompt, naming what to avoid. Not
  confirmed as an official Anthropic channel.
- [S2] https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5-5
  (undated, fetched 2026-09-25). Effort default `medium`, early-stop instructions, removing
  thinking lines, `reasoning_extraction`, specific avoid-lists.
- [S3] https://code.claude.com/docs/en/sub-agents (undated, reflects 2.1.271+). Full frontmatter
  table, what a subagent receives, plugin restrictions.
- [S4] https://code.claude.com/docs/en/best-practices (undated). Hooks vs advisory text, the
  pruning test, adversarial reviewer caveat, emphasis on one line only.
- [S5] https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5
  (undated). Over-verification, "only report high-severity" lowers recall, lead with outcome,
  delegation control.
- [S6] https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices
  (undated). Give reasons, dial back aggressive language.
- [S7] https://www.anthropic.com/engineering/multi-agent-research-system (2025-06-13). Objective,
  output format, tools and boundaries per subagent; heuristics over rigid rules.
- [S8] https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
  (2025-09-29). Right altitude, minimal information, canonical examples, 1,000 to 2,000-token
  summaries.
- [S9] The obra/superpowers spec "SDD task-scoped review dispatch design", dated 2026-06-09, under
  `docs/superpowers/specs/` at https://github.com/obra/superpowers (the file name is spelled out
  here rather than linked because it trips the secrets guard's key-shaped pattern). Measured
  reviewer scope, evidence rule, cost data.
- [S10] https://github.com/obra/superpowers/blob/main/docs/superpowers/specs/2026-06-10-positive-instruction-redesign-design.md
  (2026-06-10). Micro-tests of prohibitions vs positive recipes.
- [S11] https://www.tembo.io/blog/claude-code-subagents (2026-05-15). "One job and a clear
  definition of done". Its claim that subagents can't nest is out of date.
- [S12] https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md (versions to
  2.1.282, undated). Frontmatter version gates.
- [S13] https://code.claude.com/docs/en/model-config (undated). Effort precedence, pinning with
  full IDs.
- [S14] https://platform.claude.com/docs/en/build-with-claude/effort (undated). Effort levels,
  "set effort explicitly".
- [S15] https://github.com/gosha70/code-copilot-team/pull/365 (2026-09-19). Changelog-verified
  version gates, per-role effort practice.

Also consulted: https://github.com/wshobson/agents (last commit 2026-09-13; 202 agents, model
tiers), evidence of practice, not guidance; and
https://github.com/laywill/awesome-claude-code-subagents/issues/319 (2026-09-22), which shows that
large collections still use only the four basic keys.

## 7. Confidence and gaps

- **Well supported:** the frontmatter semantics and plugin restrictions (docs plus changelog);
  removing "think carefully", self-verification and reasoning-reproduction lines; effort defaults;
  hooks and tools over prose for enforcement; a normal tone.
- **Moderate:** Anthropic's finish-line and stopping advice targets user prompts and CLAUDE.md.
  Applying it to agent system prompts is an extrapolation. Superpowers' evidence is measured but
  comes from a small set of evals and mostly from earlier Opus versions.
- **Unresolved tension:** "list only problems you'd block the merge for" [S1] versus "report
  everything, filter separately" [S5]. Grading every finding and letting the PM filter satisfies
  both.
- **Opinion:** the exact section order and the one-sentence role line.
- **Not found:** any Anthropic page specifically on writing subagent files for Opus 5.5; release
  dates for changelog entries; whether unknown frontmatter keys are officially inert (S15 tested
  this empirically only); wshobson's `docs/agents.md` conventions in detail.
