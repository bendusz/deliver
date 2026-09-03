---
description: Ask the OpenAI Codex CLI for a second opinion — advice, a recommendation, or help with a decision — on the current work. Reserve for consequential changes, not routine questions.
---

Ask **Codex** (OpenAI's coding agent CLI) a specific question and relay its answer, via the
`codex-advisor` wrapper agent and the bundled Node runner. This is a second pair of eyes from an
independent model — use it **sparingly**: real design decisions, risky refactors, tricky
tradeoffs. Not for routine questions you can answer yourself. Wrappers never pass sandbox or
approval flags; the runner owns them per platform (workspace-write on macOS and Linux, full
access on Windows with post-run scope detection).

Arguments: $ARGUMENTS

## 1. Parse arguments

- **model=<id>** — default `gpt-5.6-sol` (judgment work gets the top tier).
- **effort=<level>** — `none|minimal|low|medium|high|xhigh|max`; default `medium`.
- Everything else is the **question**. If empty, ask the user what they want Codex's opinion on.

## 2. Compose the brief

Codex can read the repo but knows nothing about this conversation. Write a self-contained
brief: the question, the relevant file paths, the options being weighed with their
trade-offs, and any constraints. End with: `Give a concrete recommendation and your
reasoning. Read the referenced files before answering.`

## 3. Dispatch

Dispatch `codex-advisor` with the brief and any `model=` / `effort=` overrides. Never run
`codex` yourself. The agent returns Codex's attributed answer or the runner's failure reason.

## 4. Relay

Present Codex's answer, clearly attributed ("Codex (gpt-…) recommends …"), followed by your
own take: where you agree, where you differ, and why. You own the final recommendation. If
`pm/log.md` exists, append one entry in the shared-log schema (actor id per
`references/logging-and-state.md`): `- <YYYY-MM-DD HH:MM> <actor-id> — codex-help:
<question gist> → <answer gist>.`
