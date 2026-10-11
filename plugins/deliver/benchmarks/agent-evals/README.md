# Agent evals

Sixteen frozen fixtures for the two agents whose mistakes ship bugs: `code-integrity-reviewer`
(nine diffs, six with one seeded defect and three clean) and `pm-verifier` (seven small
repositories, five with a criterion that is not met or cannot be shown and two that pass).

- `cases.json` names each case, its split, and what a passing trial returns.
- `fixtures/<id>/` holds `story.md` and `diff.patch`, plus `repo/` for the verifier.
- `MANIFEST.sha256` pins every file here. `bash scripts/validate.sh` fails when they differ.

`/deliver:agent-evals` runs the trials and `scripts/agent-evals.mjs` scores them.

## Rules
- **Frozen.** Nothing that proposes a prompt change may edit this directory. A person changes a
  fixture on purpose, runs `node plugins/deliver/scripts/agent-evals.mjs manifest --write`, and
  commits both alone, never in the commit that changes a prompt.
- **Two splits.** A proposer reads `dev` fixtures only, through `agent-evals.mjs list`, and never
  `cases.json`. Acceptance is decided on `heldout`.
- **What it can show.** Three trials over a few cases detect a large loss, never a small gain.
  The acceptance rule is therefore "no worse, and no bigger", and a pass here is a floor for a
  prompt change, never proof that it helped.
