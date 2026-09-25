# Codex CLI task briefing, boundaries, and guardrails

Date checked: 2026-09-25

Question: what is the best current practice for briefing tasks, boundaries, and guardrails to the
OpenAI Codex CLI (around 0.154) to get peak performance, and which layer (AGENTS.md, the per-run
prompt, `config.toml`, CLI flags, native agent definitions) should own which concern? The deliver
runner composes a fixed mode preamble plus a story file and calls `codex exec` non-interactively
with a pinned model and effort.

Method: one Opus 5.5 research agent, web research only, no local runs. The report below is the
agent's, lightly reformatted. Page contents came through a summarising fetch, so check exact quotes
before relying on them. The companion note for Claude Code subagents is
`2026-09-25-claude-subagent-definition-practices.md`.

Decision taken on reading: the runner keeps `danger-full-access`. It was a deliberate 0.23 choice
so that the user's MCP servers and web search apply; the preamble and the post-run scope diff stay
the guards on git state.

## 1. Recommendations

1. **Give every brief four parts: Goal, Context, Constraints, Done when.** This is OpenAI's own
   Codex template, and it keeps runs "scoped" with "fewer assumptions" (Codex Best practices).
2. **State the finish line as something the model can check, then say "stop".** For example:
   "done when every acceptance criterion holds and `<cmd>` passes." OpenAI tells Astra users to
   define completion up front "to prevent premature stopping", and its short-form template ends
   with a Stop Condition (OpenAI Astra blog; latest-model guide; Decoder).
3. **Split boundaries into what the model may do without asking and what it must never do,
   instead of blanket "ask first" rules.** Astra is "more tentative" and asks more questions.
   Naming the authorized actions stops it stalling. OpenAI's own example: "Run them, fix failures
   caused by the requested change, and rerun affected tests without asking for approval" (Astra
   blog; proflead, 2026-09-20).
4. **Explain why a boundary exists, once.** For example: "the runner diffs the worktree and
   rejects the run." OpenAI says Astra's judgment is better, so restrictive wording can be softened
   when a reason is given. Proflead: "justify repeated checks" (Astra blog; proflead).
5. **Make "blocked" a normal, fast exit with named triggers, and forbid questions.** `codex exec`
   has no one to answer them. OpenAI's persistence guidance says not to end a turn with
   clarifications "unless truly blocked", so define "truly blocked" for the model (Codex prompting
   guide; latest-model guide).
6. **Say which instructions win.** OpenAI: "The user's instructions take precedence over
   guidelines provided in a skill." Conflicts between AGENTS.md, skills, and the prompt make Astra
   "pause and block work early" (latest-model guide; Decoder).
7. **Size testing to the change.** Astra tests on its own and "may perform more testing than
   necessary." Use OpenAI's wording: run tests suited to the change, and broaden only "when new
   changes, failures, or unresolved concerns justify it" (latest-model guide).
8. **Let `--output-schema` enforce the report shape.** Keep the prompt's report section to meaning
   (when to use `blocked`), not format rules the schema already enforces (Non-interactive mode
   docs).
9. **Keep AGENTS.md to what the model cannot discover:** exact commands, non-standard conventions,
   gotchas. Studies found repository overviews gave no benefit, and context files raised cost by
   more than 20% (Gloaguen et al.; Upsun).
10. **Replace blanket pre-reads with conditional pointers**, such as "Use database.md for schema
    changes." OpenAI calls pre-reading a stack of docs before every edit "excessive" (Astra blog).
11. **Don't expect AGENTS.md structure tuning to do much.** A factorial study found no measurable
    compliance effect from file size, instruction position, file architecture, or contradictions
    between files. A 2026 two-agent ablation found context strategy did not measurably change
    correctness. Put the effort into the per-run brief instead (McMillan, 2026-05; Khatri,
    2026-07).
12. **Avoid contradictions and vague "be thorough" wording.** GPT-5-family models spend reasoning
    tokens trying to reconcile contradictions, and "Be THOROUGH" was "counterproductive" for Cursor
    (GPT-5 prompting guide).

## 2. Leave out

- **Requests for an upfront plan, preambles, or status updates.** OpenAI says these "can cause the
  model to stop abruptly before the rollout is complete." They are also useless in exec (Codex
  prompting guide).
- **Nagging to run tests or to "always write tests".** It causes over-testing on Astra (Astra
  blog; latest-model guide).
- **Directory maps and framework descriptions.** The file system already shows them, and studies
  found no benefit (Gloaguen; Upsun).
- **Mandatory "read X before any task" rules.** Use conditional pointers instead (Astra blog).
- **Step-by-step recipes.** "Overly specific guidance can now hinder results" (Astra blog).
- **Safety disclaimers and checklists** (Decoder, reporting OpenAI's guide).
- **Repeating a rule in both AGENTS.md and the preamble.** No source rewards repetition, and the
  contradiction risk is documented. Put each rule in exactly one layer. This is the agent's
  inference, not a sourced finding.
- **Hand-written JSON format rules** when `--output-schema` is supplied.

## 3. Configuration reference

**AGENTS.md** (loaded natively, root down, capped by `project_doc_max_bytes`, 32 KiB default;
`AGENTS.override.md` wins at each level):
- Commands, conventions, gotchas, conditional doc pointers.
- No task content and no run policy.

**Per-run prompt (the preamble plus the story):**
- Goal, allowed paths, forbidden actions with reasons, done condition, blocked triggers,
  instruction priority, test sizing.

**CLI flags** (highest precedence):
- `-m`
- `-c model_reasoning_effort=…`
- `--sandbox` (exec defaults to read-only)
- `--output-schema`
- `-o` / `--output-last-message`
- `--json`
- `--ephemeral`
- `--ignore-rules`
- `--ignore-user-config`
- `--skip-git-repo-check`
- `--ask-for-approval`
- `--dangerously-bypass-approvals-and-sandbox`
- `--full-auto` is deprecated; the docs say to use `--sandbox workspace-write` instead.

**config.toml keys** (layer order: CLI, then profile, then project `.codex/config.toml` if
trusted, then user):
- `model`, `model_reasoning_effort` (`low|medium|high|xhigh|max|ultra`, depending on the model),
  `model_verbosity`
- `sandbox_mode` (`read-only|workspace-write|danger-full-access`)
- `approval_policy` (`on-request|never|{granular}`)
- `sandbox_workspace_write.writable_roots`, `sandbox_workspace_write.network_access`
- `developer_instructions`, `model_instructions_file`, `project_doc_fallback_filenames`
- `features.hooks`, `features.multi_agent`, `agents.enabled`,
  `agents.max_concurrent_threads_per_session`
- `web_search` (`disabled|cached|indexed|live`), `shell_environment_policy.*`,
  `hide_agent_reasoning`

**Profiles:** separate files at `~/.codex/<name>.config.toml`, using top-level keys, applied with
`--profile`.

**Custom agents:** `.codex/agents/*.toml` or `~/.codex/agents/*.toml`, with required `name`,
`description`, `developer_instructions`. OpenAI notes that `developer_instructions` "is not the
same as limiting what the helper can actually do." They only run when a prompt names them, so they
are irrelevant with `agents.enabled=false`.

**Findings about the deliver runner (verified against the code on 2026-09-25):**
- It runs `danger-full-access` in every mode. In `workspace-write`, `.git`, `.codex` and `.agents`
  are read-only, but that protection does not apply here, so the preamble and the post-run diff are
  the only guards on git state. Kept deliberately; see the decision above.
- Astra is "particularly responsive to instructions in files and skills", and the user's own
  skills still load. The instruction-priority line (recommendation 6) is the cheap defence.
- The effort allowlist accepted `none` and `minimal`. Astra rejects `none`, and the Codex config
  reference lists `low` through `ultra` only.
- The fallback model was `gpt-5.6-sol`; `gpt-6-sol` shipped on 2026-09-22 at about half the price.

## 4. Recommended build preamble (about 250 words)

```
You are implementing one story in the git worktree at {worktree}. The story file
{story} is your brief; read it first. AGENTS.md is already loaded.

Done means: every acceptance criterion in the story holds and `{verification}`
passes. When that is true, stop. Do not refactor, polish, or extend past the story.

Without asking, you may read anything in the worktree, create, edit, or delete
files under these paths only:
{allowed paths}
and run the project's build, test, and lint commands.

Never:
- change a file outside those paths. The runner diffs the worktree after you
  finish and rejects the whole run if any other path changed.
- edit docs/stories/, docs/wiki/, docs/handoff/, docs/approval.json,
  docs/spec.md, docs/plan.md, docs/constitution.md, .specdd/, or a root .sdd.
  These are the PM's records.
- run git commands that change state (commit, checkout, reset, stash, branch).
  The PM owns history.

Testing: run the verification command and the tests covering what you changed.
Add tests only where an acceptance criterion needs them.

Report blocked, without working around the limit, when finishing needs a change
outside the allowed paths, a decision the story leaves open, or a fix for a failure
you cannot resolve inside the allowed paths. Nobody can answer questions during
this run, so do not ask any.

If this brief conflicts with AGENTS.md or a skill, this brief wins.

Finish with the JSON the schema requires: status done or blocked, every changed
path, each command you ran with its result, and at most five short summary lines.
```

For fix mode, add one line: "Read {evidence}; make the smallest change that resolves its accepted
findings or failing gate."

**Suggested report shape**, extending the existing schema:
- `status`: `done` | `blocked`
- `files_changed`: list of paths
- `tests`: list of `{command, status: passed|failed|not-run, summary}`
- `summary`: at most five strings
- `root_cause`: string or null
- Optional, when `status` is `blocked`:
  - `blocked_reason`: `scope` | `decision` | `failing-gate` | `missing-evidence` | `environment`
  - `needs`: one sentence saying what would unblock it

The `blocked_reason` enum is the agent's proposal, not sourced.

## 5. Model and effort notes

- **Codex models page** (undated, current) lists `gpt-6-astra`, `gpt-6-sol`, `gpt-6-luna`,
  `gpt-5.5` (retiring 2026-10-14), `gpt-5.4` and `gpt-5.4-mini`.
  - Astra effort levels: Light, Medium, High, Extra High, Max, Ultra. Default is Light, which
    corresponds to `low` in the CLI.
  - Sol: default Medium.
  - Luna: High, Extra High and Max only; default High.
- **GPT-6 Sol and Luna** shipped on 2026-09-22 at roughly half the price of the 5.6 line. OpenAI
  says Sol reaches "Astra-level reliability at much lower cost" (TechCrunch).
- **`gpt-5.6-sol`** still has an API model page. Unverified whether it has a retirement date.
- **Effort values:**
  - Astra rejects `none`; OpenAI says to use `low` instead (latest-model guide).
  - The Codex config lists `low` through `ultra` and does not list `none` or `minimal`.
  - Ultra means delegating work to subagents. With `agents.enabled=false` it does nothing useful
    and adds cost (Vaughan, 2026-07-24).
- **Community effort advice:** `high` is a reasonable coding default on Astra, and Astra costs
  about 5x Sol, which is hard to justify for short, well-scoped stories (Vaughan, 2026-09-03).
  That is opinion, but it supports routing small stories to Sol at medium.
- **How prompt style should change:** fewer and softer constraints, each with its reason; explicit
  completion and stop conditions; explicit instruction priority; test sizing; a "bias to action"
  line when Astra asks too many questions; ask for "concise paragraphs" when you want prose, since
  Astra over-formats.

## 6. Sources

1. https://learn.chatgpt.com/guides/best-practices (redirect from
   developers.openai.com/codex/learn/best-practices), undated: the Goal/Context/Constraints/Done-when
   template and AGENTS.md brevity.
2. https://learn.chatgpt.com/docs/non-interactive-mode, undated: exec flags and output schema.
3. https://learn.chatgpt.com/docs/config-file/config-reference, undated: config keys and values.
4. https://learn.chatgpt.com/docs/config-file/config-advanced, undated: profiles and precedence.
5. https://learn.chatgpt.com/docs/agent-configuration/agents-md, undated: discovery order and the
   32 KiB cap.
6. https://learn.chatgpt.com/docs/agent-approvals-security, undated: sandbox and approval
   behaviour, protected paths.
7. https://learn.chatgpt.com/docs/models, undated: model ids and effort levels.
8. https://developers.openai.com/codex/subagents (via search snippets), undated: custom agent TOML.
9. https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra, undated
   (about September 2026): what to remove for Astra.
10. https://developers.openai.com/api/docs/guides/latest-model, undated: verbatim Astra prompt
    blocks.
11. https://developers.openai.com/api/docs/guides/reasoning, undated: effort values.
12. https://developers.openai.com/cookbook/examples/gpt-5/codex_prompting_guide, undated
    (gpt-5.3-codex era): no preambles, autonomy.
13. https://developers.openai.com/cookbook/examples/gpt-5/gpt-5_prompting_guide, August 2025 (date
    from memory): contradictions and over-prompting.
14. https://github.com/openai/codex/releases/tag/rust-v0.154.0, September 2026: Astra support,
    `--worktree`.
15. https://agents.md/, undated: the spec; nearest file wins.
16. https://the-decoder.com/openai-shares-prompting-tips-for-gpt-6-astra-including-a-blocklist-of-slop-words/,
    2026-09-05: summary of OpenAI's guide.
17. https://proflead.dev/posts/gpt-6-astra-codex-prompts-skills-agents-md/, 2026-09-20: approval
    boundaries, justified checks.
18. https://codex.danielvaughan.com/2026/09/03/gpt-6-astra-codex-cli-configuration-context-notes-safety/,
    2026-09-03 (updated 09-25): Astra effort and cost.
19. https://codex.danielvaughan.com/2026/07/24/codex-cli-ultra-mode-trade-off-reasoning-budgets-subagent-cost-task-routing/,
    2026-07-24: Ultra means subagents (search snippet only).
20. https://techcrunch.com/2026/09/22/openai-launches-gpt-6-sol-and-luna/, 2026-09-22: Sol/Luna
    launch.
21. https://arxiv.org/abs/2602.11988, 2026-02-12 (revised 06-23): context files add cost;
    overviews don't help.
22. https://arxiv.org/abs/2607.27250, 2026-07-28: context strategy does not move correctness on
    Claude Code or Codex.
23. https://arxiv.org/abs/2605.10039, 2026-05-11: file structure has no measurable compliance
    effect.
24. https://developer.upsun.com/posts/ai/agents-md-less-is-more, 2026-02-23: include only what
    agents cannot discover.

## 7. Confidence and gaps

- **Well supported:** the four-part brief; removing plan and preamble requests; explicit
  completion and stop conditions; instruction priority; test sizing; the config keys and flags
  listed above.
- **Mixed evidence:** AGENTS.md value. Three studies found little or no benefit from context
  files, including LLM-generated ones, while one reports efficiency gains.
- **The agent's own inference:** "state each rule once, with its reason" and the `blocked_reason`
  enum.
- **Not found or unverified:** official publication dates for the OpenAI pages; an official
  Codex-specific GPT-6 prompting guide beyond the bundled OpenAI Docs skill mentioned in the 0.154
  release notes; a config key to disable skills; whether `model_verbosity` affects Astra in Codex;
  the exact default model for a bare `codex exec` in 0.154.
