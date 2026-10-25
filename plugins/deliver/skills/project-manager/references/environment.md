# Environment and agents

Read this when you are routing a dispatch, opening a remote PR, or checking what the host offers.
Everything here is detection, never dependency. On a bare Claude Code install the bundled agents and
references are enough on their own.

## What the host may have
- `node` 20 or newer is required, because the hooks and the Codex runner are Node scripts.
- `git` for version control. Offer to init if it is absent and the user wants it.
- `gh` plus a GitHub remote, and only then real PRs; otherwise local merges.
- A more specialized tool or skill for one step, a dedicated planner or an external reviewer for
  example. You may prefer it where it exists.
- The optional `poteto` companion plugin from the same marketplace. When its skills are installed,
  the references name them at the right phase (`architect`, `blast-radius`,
  `create-verification-skill`, `technical-writing`). They are user-invoked, so ask the user to
  run them. Absent, nothing changes.

## Remote PRs, opt-in
The loop merges locally by default. Open a real PR only when the user has explicitly asked for
pushes or PRs, `gh auth status` succeeds, and a GitHub remote exists. Then push the story branch,
open the PR with the message format in `implementation-loop.md`, and merge it. Before
`gh pr merge` or a merge in the UI, confirm the recorded `verifier: PASS <sha>` and, at `T1` and
`T2`, `integrity: pass <sha>` name the PR head, or an ancestor of it followed only by story-file
and handoff commits or by merges of the integration branch that git would make automatically.
This is the rule the hook applies to a local merge. Check it for each recorded `<sha>`:

1. `git merge-base --is-ancestor <sha> <head>` succeeds.
2. `git log --stat <sha>..<head> --not origin/<integration>` shows only the story file and
   `docs/handoff/*.md` in its non-merge commits.
3. For each merge commit that `git rev-list --merges <sha>..<head> --not origin/<integration>`
   lists, run `git merge-tree --write-tree --name-only <merge>^1 <merge>^2`. Its first line is the
   result tree; on a conflict it exits 1 and lists the conflicted paths after that line. The merge
   passes when either holds:
   - it exits 0 and the tree equals `git rev-parse <merge>^{tree}`;
   - the only conflicted path is the story file, `docs/stories/<story-id>.md`, and
     `git diff --name-only <result-tree> <merge>^{tree}` lists only that path. The hook allows a
     conflict confined to the story file the same way.

   `git show --remerge-diff <merge>` shows the same difference as a diff.

If any step fails, re-verify before merging. The `require-verified.mjs` hook does not see this
path, so the check is yours alone; treat it as a residual risk. Never push to a remote without an
explicit request.

## Agents you orchestrate
Run reviewers as the tier panel `review-gates.md` sets, plus the lenses the story's risk adds.

The PM never assembles a `codex` command line. Outside T3 Code's `delegate_task` advisory and
research path, every Codex invocation goes through the bundled runner `scripts/codex/run.mjs`: the PM may call it
directly, the `--preflight` probe for example, and every model run goes through a Sonnet wrapper
agent. `scripts/validate.sh` fails on any direct `codex exec` in an agent or command
prompt. When the OpenAI Codex CLI is installed, `codex-reviewer` is the opposite-family lens for
work Claude wrote, alongside the panel and never as a replacement for it, and
`codex-advisor` gives a second opinion on a consequential decision. `review-gates.md` owns when
`codex-reviewer` runs, and `SKILL.md` when `codex-advisor` does. `/deliver:codex-review` and `/deliver:codex-help` are
the user-run forms. The
`codex-researcher` agent plays the same independent-second-model role for research questions.
`codex-builder` is different: it is write-capable inside one fixed worktree and may replace
`expert-builder` only when the story or fix brief is narrow enough. The normal gates, separate review
panel, and `pm-verifier` still judge its work.

Every agent pins its model and effort in its frontmatter.
