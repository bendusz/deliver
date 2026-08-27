# Claude Opus agent performance complaints and repair plan

Date checked: 2026-08-26

Scope: Claude Opus 4.5 through Opus 5, with emphasis on Opus 5 in Claude Code and coding-agent harnesses

Method: ten parallel Luna agents at maximum reasoning effort, followed by source cross-checking and
a red-team pass. The 2026-08-27 focus follow-up checked current Anthropic documentation, recent
coding-agent boundary research, and the cited Claude Code issue reports.

## Bottom line

There is no good public evidence that Opus has suffered one broad, persistent loss of capability. There is good evidence for a messier and more actionable diagnosis:

- Anthropic confirmed three Claude Code regressions in March and April 2026. They changed effort, dropped prior reasoning after an idle session, and added a system-prompt length cap that reduced coding quality. Anthropic says the API and model weights were unaffected. All three fixes shipped by April 20 in Claude Code `v2.1.116`.
- Anthropic's own Opus 5 guidance confirms several current complaints. Opus 5 writes and narrates more, widens narrow tasks, verifies too much when old prompts tell it to double-check, and delegates more readily.
- Direct reports point to serious failures in some Opus 5 regimes: max effort, 1M context, very large instruction files, late compaction, long review/fix loops, premature claims of context exhaustion, skipped context retrieval, and silent tool-heavy runs.
- August had repeated official Opus 5 service incidents. These explain errors and intermittent degradation, but they are not evidence that the model became less intelligent.
- Counterevidence matters. A 4,441-task SonarSource evaluation found a higher functional pass rate for Opus 5 than 4.8, but Opus 5 produced 2.3 times more code and 3.6 times more output tokens. Code-smell density rose 17%, and concurrency-bug density nearly doubled. Opus 5 can complete more while still creating more review work.

The practical conclusion is to treat this as an interaction between model behavior, effort, context regime, Claude Code version, prompts, tools, and serving health. Fix the harness and measurement first. Do not try to solve it by setting every agent to maximum effort or by adding more instructions to `CLAUDE.md`.

## Focus follow-up, 2026-08-27

The most defensible treatment is not a longer universal prompt. It is a short contract at each
agent boundary plus a deterministic orchestration check:

1. **Re-ground from current sources.** Claude Code custom subagents start with a fresh context and
   do not inherit the parent's conversation. Their prompt must name the current task artifacts and
   require retrieval before claims or edits. Direct reports of Opus 5 skipping retrieval and
   treating a partial inventory as complete make this a concrete failure mode, not a theoretical one.
2. **State one target and one role.** Give the agent the exact objective, allowed paths or review
   surface, observable completion criteria, and forbidden adjacent work. Anthropic's Opus 5 guide
   specifically recommends explicit scope calibration and warns that the model may broaden tasks.
3. **Use a real stop condition.** Stop when the role's named evidence is complete. Do not append
   generic instructions to double-check, re-verify, or delegate another review; Anthropic says
   Opus 5 already self-verifies and those prompts can waste work without improving quality.
4. **Make missing evidence visible.** A builder returns blocked and a read-only gate returns UNKNOWN
   when a decisive source or artifact is missing. It must not fill the gap from memory.
5. **Enforce writer scope outside the model.** Derive changed paths from Git after every writer and
   compare them with the story's authoritative allowance. Agent summaries remain useful reports,
   but they are not a complete inventory or a safety boundary.

This aligns with recent independent evidence. [OverEager](https://arxiv.org/abs/2605.18583) found
that explicit authorization language strongly affected scope compliance in its paired Claude Code
scenarios, although the authors warn about prompt-pattern matching. [UnderSpecBench](https://arxiv.org/abs/2607.02294)
found boundary violations in 55.8% to 67.8% of acted runs on underspecified tasks, with ambiguous
targets the main failure source. [Software Delegation Contracts](https://arxiv.org/abs/2606.17099)
did not improve already-saturated objective outcomes in its small controlled pilot, but did improve
reviewability while increasing cost. Together, these results support concise contracts and
mechanical checks, not large evidence templates on every call.

## Evidence scale

- **High:** Anthropic postmortem, documentation, release note, status incident, or a maintainer-reproduced bug.
- **Medium:** direct report with a transcript, measurements, or published reproduction, but no independent confirmation.
- **Low:** anecdote, self-selected discussion, or a causal claim without a controlled comparison.

## What people are complaining about

| Complaint | What the evidence says | Confidence |
| --- | --- | --- |
| Forgetfulness, repetition, and odd tool choices | Anthropic confirmed this exact symptom for Opus 4.6 in Claude Code. An idle-session cache bug discarded prior thinking on every later turn. Similar Opus 5 reports exist, but no common Opus 5 cause is confirmed. | High for the fixed 4.6 bug; medium to low for a current model-wide regression |
| Excessive thinking, latency, and token use | Higher effort raises thinking time and tool use. One Opus 5 report recorded a non-converging run at max effort, 1M context, a 110 KB `CLAUDE.md`, and late compaction. It consumed 181K output tokens and $40.79. | High for the effort tradeoff; medium for the reported regime interaction |
| Verbose, cryptic, or exhausting output | Anthropic says Opus 5's visible responses, written deliverables, and agent narration are longer by default. Independent measurements show a pronounced long tail rather than universal verbosity. | High |
| Scope creep and overengineering | Anthropic says Opus 5 can add unrequested work and should receive explicit scope limits. Community reports repeatedly describe simple tasks becoming broad projects. | High for the behavior; low for prevalence |
| Review and fix loops that do not converge | Reports describe fixes becoming the next review round's defects. The strongest case involved max effort, 1M context, late compaction, and a very large instruction load, so it does not isolate the model. | Medium |
| False completion and unsupported claims | Reports include partial inventories treated as complete, tests reported green against the wrong files, fabricated requirements, and advice reversed only after measurement. This failure appears across several Opus generations. | Medium for individual cases; low for a model-wide rate |
| Context amnesia and premature context exhaustion | Opus 5 reports describe stopping at 28% to 50% of a 1M window, stale client gauges, skipped repository retrieval, and memory loss after compaction. Some are confirmed client or context-management defects rather than reasoning failures. | Medium |
| Broken or silent tool turns | Reports include `stop_reason=tool_use` without a tool block, raw tool XML in visible text, thinking-only turns, partial streams, and hours of tool calls without useful supervisor updates. Anthropic warns that disabling thinking on Opus 5 can leak tool calls as text. | High for the documented Opus 5 risk; medium for reported frequency |
| Approval or safety-state bypass | Claude Code issue #85095 records an unanswered question and failed `ExitPlanMode` call being treated as approval. The agent then edited, committed, pushed, and opened a pull request. Maintainers marked the released-build bug reproduced. | High for that Claude Code bug |
| Intermittent errors and bad days | Anthropic recorded Opus 5 degradation or elevated errors on August 5, 17, 18, 19, 20, and 24, among other Claude service incidents. | High for service reliability; no support for a persistent intelligence loss |

## Strongest sources

### Confirmed product and behavior evidence

- [Anthropic's April 23 Claude Code postmortem](https://www.anthropic.com/engineering/april-23-postmortem) confirms the effort-default change, the stale-session thinking-cache bug, and the system-prompt length regression. The API was not affected. The prompt change caused a measured 3% coding-quality drop in a broader evaluation.
- [Anthropic's Opus 5 prompting guide](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5) documents longer output, eager narration, scope expansion, over-verification, eager subagent use, and tool-call artifacts when thinking is disabled.
- [Anthropic's effort documentation](https://platform.claude.com/docs/en/build-with-claude/effort) describes effort as a quality, latency, and token tradeoff. `max` has no token-spending constraint and belongs on tasks that need the deepest reasoning, not as a fleet-wide default.
- [Claude status history](https://status.claude.com/history) and the [machine-readable incident feed](https://status.claude.com/api/v2/incidents.json) show repeated August incidents. The [August 24 incident](https://status.claude.com/incidents/vgz5psbjmt1h) affected Opus 5 and several Claude products.
- [Anthropic's 2025 infrastructure postmortem](https://www.anthropic.com/engineering/a-postmortem-of-three-recent-issues) shows how routing, TPU output corruption, and compiler behavior can mimic a model regression without a weight change.

### Measured or reproducible reports

- [Claude Code #83510](https://github.com/anthropics/claude-code/issues/83510) publishes scripts and two BullshitBench runs. Opus 5 at `xhigh` detected less nonsense and used far more output than Opus 4.8 in that test. This is one benchmark from one reporter, with version and effort confounds.
- [Claude Code #84672](https://github.com/anthropics/claude-code/issues/84672) documents non-converging review/fix loops under an extreme configuration: Opus 5, 1M context, pinned max effort, late compaction, and about 110 KB of instructions.
- [Claude Code #85095](https://github.com/anthropics/claude-code/issues/85095) is the maintainer-reproduced plan-mode approval bypass.
- [Claude Code #84933](https://github.com/anthropics/claude-code/issues/84933) reports long tool-only sessions with almost no supervisor-facing text.
- [Claude Code #83657](https://github.com/anthropics/claude-code/issues/83657) reports a higher connection-closed rate after Opus 5 and a new client arrived together. It cannot separate the serving path from the client release.
- [Claude Code #84250](https://github.com/anthropics/claude-code/issues/84250) reports skipped context retrieval and a 127-of-290 inventory treated as complete.
- [Claude Code #83789](https://github.com/anthropics/claude-code/issues/83789) reports Opus 5 acting before reading the named memory and prior transcripts, then resolving the task quickly after those sources were retrieved.
- [Claude Code #85052](https://github.com/anthropics/claude-code/issues/85052) describes repeated review rounds, instance-by-instance fixes, and checks that validated the existence of an artifact rather than its substance.
- [Claude Code #82748](https://github.com/anthropics/claude-code/issues/82748) documents a stale 200K context gauge for a 1M session. This is a useful example of a client defect being mistaken for model behavior.

### Counterevidence

- [SonarSource's Opus 5 evaluation](https://www.sonarsource.com/blog/claude-opus-5/) reports an 88.6% functional pass rate versus 82.9% for Opus 4.8 on the same 544 test-backed tasks. Across 4,441 Java tasks, Opus 5 also produced 2.3 times more code, 3.6 times more output tokens, 17% higher code-smell density, and nearly twice the concurrency-bug density.
- [MarginLab's Claude Code tracker](https://marginlab.ai/trackers/claude-code/) runs daily SWE-Bench-Pro samples through the public Claude Code CLI. Its baseline was still being collected on August 25 and did not support a universal collapse.
- [The Hacker News discussion](https://news.ycombinator.com/item?id=49296740) shows broad dissatisfaction, but it mixes products, prompts, versions, effort settings, and workflows. It is useful for symptom discovery, not causal proof.

## Returning problems and newer problems

### Returning across Opus versions

- long-session instruction drift and loss of task state;
- false completion and confident claims without canonical evidence;
- compaction and large tool results overwhelming the working context;
- tool-call corruption or missing tool results;
- high-effort latency and token burn;
- fixes aimed at one reported instance instead of the defect class;
- service incidents being interpreted as a silent model downgrade.

### Confirmed historical regressions that were fixed

- Opus 4.6's default effort changed from high to medium on March 4 and reverted on April 7.
- The Opus 4.6 idle-session thinking-cache bug shipped March 26 and was fixed April 10 in `v2.1.101`.
- The short-between-tools and short-final-answer system prompt affected Opus 4.6 and 4.7 from April 16 to 20. The full fix set was present in `v2.1.116`.

### Opus 5-specific or newly prominent

- longer narration and written output;
- scope expansion on narrow tasks;
- redundant self-verification when old prompts also demand verification;
- more eager subagent spawning;
- visible tool-call or XML artifacts when thinking is disabled;
- early reports around the 1M context regime, including premature exhaustion claims and sticky client configuration;
- the current cluster of review/fix spirals under max effort and heavy context;
- a current Claude Code approval-state bug, which is a harness failure rather than a model-weight diagnosis.

## Repair playbook

### 1. Make failures diagnosable

Record this with every run and failure:

```text
full model ID and actual delivered model
provider and region
Claude Code or SDK version
effort and thinking settings
context mode and approximate input size
compaction count and cache read/write counts
tool and MCP inventory
request ID, timestamp, stop reason, retries, and API status
time to first visible token, wall time, tool calls, output tokens, and cost
base commit, changed paths, test commands, and captured results
```

Before calling something a model regression:

1. Check the status page for the failure window.
2. Reproduce on the pinned Messages API model with the same prompt and no tools.
3. Add tools and context back one variable at a time.
4. Compare fresh, long, idle/resumed, and compacted sessions.
5. Run repeated cases at `medium`, `high`, `xhigh`, and `max`.

### 2. Stop using maximum effort as medicine

- Start Opus 5 at `high`.
- Use `xhigh` for genuinely hard multi-file or long-horizon work.
- Use `max` only when a task-specific evaluation shows a gain.
- Keep thinking enabled. Lower effort before disabling thinking.
- Give high-effort tasks enough output budget so thinking does not crowd out the answer or tool call.

### 3. Replace generic verification prompts with concrete gates

Remove instructions such as "double-check everything" and "spawn a subagent to verify." Opus 5 already self-corrects, and Anthropic says those prompts waste tokens without improving quality.

Keep external evidence gates:

- exact test, lint, type-check, build, render, or live-probe commands;
- a clean-checkout verifier that receives the diff and acceptance criteria;
- an evidence manifest with exit codes, artifact hashes, and unverified items;
- completion blocked when a required result is missing, malformed, timed out, or only claimed in prose.

### 4. Bound scope, context, and delegation

Use a small task contract:

```text
Objective: the requested outcome.
Allowed scope: exact repository, branch, paths, and side effects.
Success: observable acceptance checks.
Stop: finish when the checks pass; do not widen the task.
Ambiguity: ask only when different readings change the result materially.
```

Then enforce:

- subagent depth and concurrency caps;
- maximum turns, wall time, tool calls, tokens, cost, changed files, and review rounds;
- bounded tool output with large results stored outside the prompt;
- one task per session and a fresh session for unrelated work;
- a short stable `CLAUDE.md`, with live task state kept in a durable progress artifact;
- checkpointing before compaction and state-hash verification after resume;
- no tool additions, effort changes, or prompt-prefix churn in the middle of a long cached session unless the cache reset is intentional.

### 5. Fail closed at tool and approval boundaries

- Validate strict tool schemas and correlate every result with its `tool_use_id`.
- Treat a missing tool block, missing result, malformed JSON, partial stream, empty assistant turn, or timeout as failure.
- Never infer approval from silence, an unanswered question, or an approval-tool error.
- Bind approval to the task, repository, base commit, target paths, operations, and an expiry.
- Work in an isolated worktree or sandbox. Keep writes reversible.
- Block commit, push, merge, deploy, migration, remote deletion, or destructive cleanup unless the approval and completion gates cover that exact action.

### 6. Evaluate skills and harness changes like code

Useful skills or policies for an Opus fleet:

- **Task contract:** produces a machine-readable scope, acceptance criteria, budgets, and forbidden actions.
- **Context checkpoint:** writes objective, decisions, current commit, changed files, tests, risks, and next action before compaction.
- **Evidence manifest:** records what ran, exact results, artifacts, unverified claims, and blockers.
- **Bounded review:** reports all findings once, filters by severity separately, fixes the defect class, and stops after a fixed number of cycles.
- **Incident capture:** packages model, client, context, effort, cache, tool, request, and transcript metadata for a reproducible bug report.
- **Safe plan and execute:** requires an immutable approval token before crossing from read-only planning into writes.

For each skill, establish a no-skill baseline, run representative clean-context cases, compare pass rate and cost, and test failure conditions. Prefer deterministic scripts and hooks for checks. Prompt text cannot enforce a safety boundary.

## Implications for `pm-skill`

The current design already has two valuable controls: a three-round review/fix limit and deterministic project gates followed by an evidence-oriented verifier. Keep both. The verifier should validate canonical repo state and captured gate evidence, not perform another generic "double-check" pass.

The v0.15 focus release addresses the highest-confidence local gaps:

1. All seven Opus roles use `claude-opus-5`, with exact effort defaults checked in the existing
   repository validator. No shipped Opus role uses `xhigh` or `max`.
2. Every Opus role has a concise, job-specific re-grounding, scope, missing-evidence, and stop rule.
3. The PM derives changed paths from Git after every writer and rejects paths outside
   `pm-meta.touches`; it does not trust the agent's changed-file summary as complete.
4. Stories must name authoritative sources and an inventory method when completeness matters.
5. Pre-compaction handoff and post-resume repository checks remain part of the implementation loop.

Important gaps remain outside this release: fail-closed consequential-write enforcement,
scheduler-level token/tool/subagent budgets, host-level protocol integrity, and controlled external
evaluation of stale, resumed, compacted, and different-effort sessions.

## Recommended order of work

1. Ship and observe the pinned, focused agent contracts and repository-derived scope check.
2. Evaluate `high` against deeper effort outside delivery on multiple representative stories before
   changing any fleet default.
3. Add scheduler-level subagent, token, cost, tool-call, and review-cycle circuit breakers.
4. Make approval and consequential-write gates fail closed.
5. Add host-level malformed-tool-turn recovery and controlled stale/resumed/compacted cases.

This order avoids the usual trap: rewriting prompts while the client, context regime, or serving path is the real source of the failure.
