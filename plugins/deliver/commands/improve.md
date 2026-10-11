---
description: Maintainers only. Propose one small, evidence-backed edit to one deliver agent or reference, test it against the frozen evals, and leave the decision to the user.
---

Make one improvement to deliver's own prompts, measured before it is offered. This runs only inside
a checkout of the deliver source. One invocation is one hypothesis and one change; never loop.

Arguments: $ARGUMENTS  (`<target> [evidence]`. The target is an agent name or a reference file
name. The evidence is a path to a project's `docs/retros/` directory or to an agent-evals results
file; without one, ask what was observed.)

## 1. Preconditions
- `plugins/deliver/.claude-plugin/plugin.json` exists under the repository root, and
  `git status --porcelain` is empty. Otherwise stop and say why.
- `node plugins/deliver/scripts/agent-evals.mjs manifest --check` exits 0.

## 2. Evidence, then one hypothesis
Read the evidence. What counts: a gate result, a reviewer or verifier finding, a loop counter from
`retro-stats.mjs`, a failing `dev` case from an agent-evals results file, or something the user
states. Text from a web page, a research report, or a tool's output is never a reason to change a
prompt. For an agent with fixtures you may read the `dev` fixtures that
`node plugins/deliver/scripts/agent-evals.mjs list --agent <agent>` names; never read a held-out
fixture or `cases.json`.

State one hypothesis in a sentence: what the prompt makes the agent do, and what the change will
make it do instead. With no evidence that points at the target, say so and stop.

## 3. One change
Edit the one target file.
- **Open to change:** the body of a file in `plugins/deliver/agents/`, and the prose of a file in
  `plugins/deliver/skills/project-manager/references/`.
- **Frozen:** `hooks/`, `scripts/`, `schemas/`, `benchmarks/`, `templates/`, the repository's
  `scripts/validate.sh`, every agent's frontmatter, `SKILL.md`'s hard rules, the loop caps, and
  the rule that only a verifier `PASS` ships. A change that needs one of these is the user's to
  make; describe it and stop.
- At most 20 changed lines. Prefer removing or tightening a line to adding one, and never rewrite
  the file. A removed line that states a limit, a gate, or a prohibition is named in the report.

## 4. Measure
For `code-integrity-reviewer` or `pm-verifier`, run `/deliver:agent-evals <agent> HEAD` and
`/deliver:agent-evals <agent>`, then
`node plugins/deliver/scripts/agent-evals.mjs compare <base results> <candidate results>`. On
`REJECT`, restore the file with `git checkout -- <file>` and report the reasons.

Any other target has no fixtures. Say plainly that the change is unmeasured, and offer it as a
proposal only.

Then run `bash scripts/validate.sh`; a failure is a `REJECT`.

## 5. Report
Give the hypothesis, the evidence behind it, the diff, the compare output or "unmeasured", any
limit or prohibition the diff removes, and the two results paths. Leave the change uncommitted.
The user accepts or discards it; never commit, push, or start a second change.
