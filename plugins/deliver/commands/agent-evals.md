---
description: Maintainers only. Run one deliver agent's prompt over the frozen eval fixtures, three trials per case, and score the results.
---

Measure one agent prompt against the fixtures in `plugins/deliver/benchmarks/agent-evals`. This
runs only inside a checkout of the deliver source, and it spends model usage: three dispatches per
case, 27 for `code-integrity-reviewer` and 21 for `pm-verifier`.

Arguments: $ARGUMENTS  (`<agent> [ref]`. The agent is `code-integrity-reviewer` or `pm-verifier`.
The ref is a git ref whose version of the agent file is measured; without one, the working tree.)

## 1. Preconditions
- `plugins/deliver/.claude-plugin/plugin.json` exists under the repository root. Otherwise say this
  command is for the deliver source repository and stop.
- `node plugins/deliver/scripts/agent-evals.mjs manifest --check` exits 0. Otherwise stop: the
  fixtures changed and no score from them is comparable.
- Never open `cases.json`. It holds the expected answers, and the scorer is the only reader.

## 2. The prompt under test
Read `plugins/deliver/agents/<agent>.md` from the ref with `git show <ref>:<path>`, or from the
working tree. Keep its frontmatter `model` and `effort`, its body, and the file's size in bytes.

## 3. Run the trials
List the cases with `node plugins/deliver/scripts/agent-evals.mjs list --split all --agent <agent>`.
For each case, dispatch three separate general-purpose subagents, in concurrent batches, each at
the frontmatter `model` and `effort`. Each dispatch carries, and nothing else:
- the agent body, as the subagent's instructions;
- the text of the case's `story.md` and `diff.patch`;
- for `pm-verifier`, the absolute path of the case's `repo/` as the repository root, and these
  facts: the project has no `docs/spec.md` or `docs/plan.md`, the story is the whole contract, the
  one gate is `node --test`, which is non-mutating, and there are no prior findings and no
  captured artifacts;
- one line: write nothing, and return only the report your instructions describe.

A trial that errors or returns nothing is recorded with an empty output. Never retry a trial
because its answer looks wrong.

## 4. Record and score
Write `tmp/agent-evals/<YYYYMMDD-HHMMSS>-<agent>-<ref or worktree>.json`:

```json
{ "agent": "<agent>", "ref": "<ref or worktree>", "prompt_bytes": 0,
  "runs": [{ "case": "<id>", "trial": 1, "output": "<the subagent's full return>" }] }
```

Then run `node plugins/deliver/scripts/agent-evals.mjs score <that file>` and report its numbers:
passes out of trials for `dev`, `heldout`, `seeded`, and `clean`, and each case that did not pass
every trial. End with the results path. Never edit a prompt or a fixture from this command.
