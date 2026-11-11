---
name: codex
description: Get an independent Codex review of the last commit, the worktree, the branch or the codebase, one reviewer child per objective, or ask Codex a question. Reserve ask for consequential decisions.
argument-hint: "[review [last-commit|worktree|branch|codebase] [objective…] | ask <question>]"
---

If you were dispatched as a child agent (your task begins 'You are a bstack … child'), do not use this skill.

`references/…` below means `${CLAUDE_PLUGIN_ROOT}/skills/project-manager/references/…`, and
`<plugin>` in any reference means `${CLAUDE_PLUGIN_ROOT}`. Neither is a shell variable: write the
path out in every command.

Use the `bstack:project-manager` skill's host rules: probe as `references/host.md` `## Probe` says
(without T3 Code, say "bstack requires T3 Code" and stop), and dispatch as its `## Dispatch`
says. Never review the code or answer the question yourself, and never run the `codex` CLI.

Arguments: $ARGUMENTS

## review
`/bstack:codex review [last-commit|worktree|branch|codebase] [objective…]`

- **Scope**, default `worktree`:
  - `last-commit`: `git diff HEAD~1..HEAD`.
  - `worktree`: the uncommitted changes, `git diff HEAD` plus the untracked files
    `git ls-files --others --exclude-standard` lists.
  - `branch`: `git diff <base>...HEAD`, `<base>` the plan's `Integration branch:`, else `main`.
  - `codebase`: the whole tracked tree, no diff.
- **Objectives**: every remaining word or quoted phrase, such as `security`, `performance`,
  `design` or `"error handling in the parser"`. None means one general review.
- **Model**: Codex `gpt-6.1-sol`, `reasoningEffort: high`, the reviewer default for Claude's work.
  Use another only when the user names one (`model=<id>`, `effort=<level>`) and
  `orchestrator_capabilities` lists it. A Codex target always sets `reasoningEffort`.

Take one stamp now, `YYYYMMDDHHMMSS`. Dispatch one `delegate_task` per objective, all in one
message so they run in parallel:
- `task`: the `references/roles.md` `## reviewer` soul, from its first line through **Returns**,
  then the brief: the repository root (`git rev-parse --show-toplevel`), the scope and the exact
  diff command to run (or "review the codebase"), and the objective, as a `focus:` line when it is
  `design`, `security` or `performance`, else `Objective: <text>`. When the review targets a
  story, add its story file (with its acceptance criteria) and its recorded `pm-exec.worktree`,
  and run the diff there. With no story, add: "No story: skip the per-criterion check and report
  spec findings as none."
- `target`: `{"providerInstanceId":"codex","model":"gpt-6.1-sol","options":{"reasoningEffort":"high"}}`.
- `isolation: "shared"`, so the child sees the checkout as it is, uncommitted changes included.
- `title`: `codex review <scope> <objective>`.
- `clientRequestId`: `codex-review-<stamp>`, fresh per call; with several objectives, append
  `-<k>` per child (`codex-review-<stamp>-2`), since T3 answers a reused key with the first child.

Wait without polling. Save each result verbatim to
`tmp/codex-reviews/<stamp>-<scope>-<objective-slug>.md`, headed by one line naming the model,
effort, scope, objective and `childThreadId`. `tmp/` is scratch and must be gitignored: if
`.gitignore` does not ignore it, show the one-line addition and ask before appending it.

Relay each verdict and the most severe findings across the reports, attributed ("Codex
(gpt-6.1-sol) found …"), with the report paths. On a story, triage them as `references/loop.md`
step 6 does before anything goes to a builder.

## ask
`/bstack:codex ask <question>`

- An empty question: ask the user what they want Codex's opinion on.
- Codex knows nothing of this conversation, so make the question a self-contained brief: the
  question, the relevant file paths, the options being weighed with their trade-offs, and the
  constraints. End it with: `Read the referenced files before answering. Give a concrete
  recommendation and your reasoning, in your reply.`
- `task`: the `references/roles.md` `## researcher` soul, from its first line through
  **Returns**, then the brief.
- Dispatch one `delegate_task` on the researcher's second-opinion default, `target`
  `{"providerInstanceId":"codex","model":"gpt-6-astra","options":{"reasoningEffort":"high"}}`
  (another model only when the user names one), `isolation: "shared"`, `title` `codex ask`,
  `clientRequestId` `codex-ask-<YYYYMMDDHHMMSS>`, fresh per call.
- Relay the answer attributed to the model, "Codex (gpt-6-astra) recommends …", then your own
  take: where you agree, where you differ, and why. The decision stays yours; when it settles one,
  log it with `bash "${CLAUDE_PLUGIN_ROOT}/scripts/log.sh" "<message>"`.
