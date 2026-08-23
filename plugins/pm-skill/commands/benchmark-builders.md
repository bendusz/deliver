---
description: Compare expert-builder and codex-builder on the same signed-off story in isolated disposable worktrees. Never merges benchmark work.
---

Use the `project-manager` skill to benchmark the two implementation workers on one story.

Story: $ARGUMENTS

This command is explicitly opt-in because it runs both builders and consumes both providers' usage.
It is an evaluation, not part of normal delivery. Never merge, push, or ship either benchmark run.

Before starting:

- Require one tracked, build-ready story and a clean repository at a fixed base commit.
- Require valid story `pm-meta`, signed-off tracked PM state, an ignored `tmp/`, and passing
  `codex-builder-run.sh --preflight --worktree <root> --story <story>`.
- If `$ARGUMENTS` is missing or identifies more than one story, stop and ask for one story.
- Record the base commit and create a timestamped directory under
  `tmp/builder-benchmark/<stamp>/`. Keep all reports there.

Create two temporary branches and worktrees from the same base commit, one for `expert-builder` and
one for `codex-builder`. Use names containing the timestamp so they cannot collide with delivery
branches. Dispatch both builders concurrently with the same story, same acceptance criteria, and
same starting commit. Give each its own absolute worktree. Codex uses `Mode: build`; do not change
the story's persisted route for the evaluation.

For each run, measure and record:

- status and wall-clock seconds;
- whether all story gates passed on the first builder response;
- gates passed and total gates after the allowed retry;
- independent review `block` and `major` counts;
- retries and number of authoritative changed paths;
- tokens or cost only when the host reports them, otherwise `null`.

Run identical deterministic gates and the same risk-selected review panel in each worktree. Allow at
most one clarification retry so the comparison stays bounded. Do not run the normal fix loop and do
not let one worker see the other worker's result.

Write `results.json` matching
`${CLAUDE_PLUGIN_ROOT}/schemas/builder-benchmark-result.schema.json`, then generate `summary.md` with:

```bash
"${CLAUDE_PLUGIN_ROOT}/scripts/score-builder-benchmark.sh" \
  tmp/builder-benchmark/<stamp>/results.json \
  > tmp/builder-benchmark/<stamp>/summary.md
```

The 100-point score gives 20 points for completion, 30 for final gate pass rate, 20 for first-pass
gate success, up to 20 for no block/major review findings, 5 for low retry count, and 5 for relative
speed. Changed-path count is reported but not rewarded, because a smaller diff is not automatically
a better implementation.

After reporting, remove a benchmark worktree only when it is clean. Use `git worktree remove`, then
delete its temporary branch. Preserve and report any dirty or failed worktree for inspection. End
with the measured table, the scorer's recommendation, and a reminder that routing should be updated
only after several representative stories. The bundled routing cases at
`${CLAUDE_PLUGIN_ROOT}/benchmarks/codex-builder-routing-cases.json` are the stable regression corpus
for checking the routing heuristic itself.
