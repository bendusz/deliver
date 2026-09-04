# Environment and agents

Read this when you are routing a dispatch, opening a remote PR, or checking what the host offers.
Everything here is detection, never dependency. On a bare Claude Code install the bundled agents and
references are enough on their own.

## What the host may have
- `node` 20 or newer is required, because the hooks and the Codex runner are Node scripts.
- `git` for version control. Offer to init if it is absent and the user wants it.
- `gh` plus a GitHub remote, and only then real PRs; otherwise local merges.
- A more specialized tool or skill for one step, a dedicated planner or an external reviewer for
  example. You MAY prefer it where it exists.
- The optional `poteto` companion plugin from the same marketplace. When its skills are installed,
  the references name them at the right phase (`architect`, `interrogate`, `blast-radius`,
  `create-verification-skill`, `technical-writing`). Absent, nothing changes.

## Remote PRs, opt-in
The loop merges locally by default. Open a real PR only when the user has explicitly asked for
pushes or PRs, `gh auth status` succeeds, and a GitHub remote exists. Then push the story branch,
open the PR with the message format in `implementation-loop.md`, and merge it. Never push to a
remote without an explicit request.

## Agents you orchestrate
Run reviewers as a risk-selected **panel** (see `review-gates.md`), not always all of them.

The PM never assembles a `codex` command line. It may call the bundled runner
`scripts/codex/run.mjs`, the `--preflight` probe for example, and every model run goes through a
Sonnet wrapper agent. `scripts/validate.sh` fails on any direct `codex exec` in an agent or command
prompt. When the OpenAI Codex CLI is installed, `/deliver:codex-review` can add an independent
second-model review alongside the panel, never as a replacement for it, and `/deliver:codex-help`
offers a one-off second opinion on a consequential decision. Use both sparingly. The
`codex-researcher` agent plays the same independent-second-model role for research questions.
`codex-builder` is different: it is write-capable inside one fixed worktree and may replace
`expert-builder` only when the story or fix brief is narrow enough. The normal gates, separate review
panel, and `pm-verifier` still judge its work.

Every agent pins its model and effort in its frontmatter; see `docs/model-tiering.md` in the
repository for the rationale.
