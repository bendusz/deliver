---
description: Ask the OpenAI Codex CLI for a second opinion on the current work, whether advice, a recommendation, or help with a decision. Reserve for consequential changes, not routine questions.
---

Ask Codex, OpenAI's coding agent CLI, a specific question and relay its answer, via the
`codex-advisor` wrapper agent and the bundled Node runner. Dispatch it only for consequential design
decisions, risky refactors, or tradeoffs, never for a routine question you can answer yourself.

Arguments: $ARGUMENTS

## 1. Parse arguments

- **model=<id>**, default `gpt-6-astra`, with a one-time runner fallback to `gpt-5.6-sol` if the
  account is refused it.
- **effort=<level>**: `none|minimal|low|medium|high|xhigh|max`, default `medium`.
- Everything else is the question. If it is empty, ask the user what they want Codex's opinion on.

## 2. Compose the brief

Write a self-contained brief, since Codex reads the repo but knows nothing about this conversation:
the question, the relevant file paths, the options being weighed with their trade-offs, and any
constraints. End with: `Give a concrete recommendation and your reasoning. Read the referenced files
before answering.`

## 3. Dispatch

Dispatch `codex-advisor` with the brief and any `model=` or `effort=` overrides. Never run `codex`
yourself. The agent returns Codex's attributed answer or the runner's failure reason.

## 4. Relay

Present Codex's answer, clearly attributed as "Codex (gpt-...) recommends ...", followed by your own
take: where you agree, where you differ, and why. You own the final recommendation. If `pm/log.md`
exists, append one entry in the shared-log schema, with the actor id per
`references/logging-and-state.md`: `- <YYYY-MM-DD HH:MM> <actor-id>: codex-help, <question gist>,
<answer gist>.`
