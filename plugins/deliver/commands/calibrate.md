---
description: Maintainers only. Run the review lenses over the frozen assurance corpus in two phases, select then certify, score each trial, and recompute the calibrated panel per risk tier in panels.json.
---

Measure how often each review lens, alone and in combination, lets a seeded defect through, and
write `plugins/deliver/benchmarks/assurance/panels.json`. This runs only inside a checkout of the
deliver source, and it spends model usage on both providers.

**Cost for batch 1** (100 seeded and 25 clean cases):
- The select phase is about 310 runs: two trials of each lens on its classes' 35 select seeded cases
  plus the 10 select clean cases.
- The certify phase is 80 runs (65 certify seeded plus 15 certify clean) for each lens trial in the
  certify plan. A plan of two lenses at one trial is 160 runs; the six-slot ceiling is 480. T2 is
  skipped at this corpus size.
- The total is about 470 runs for a two-lens plan, and at most about 790.

Arguments: $ARGUMENTS  (optional: `--targets T0=0.10,T1=0.05,T2=0.02` to pass through to `calc`)

## When to run
Re-run whenever any lens's model, effort, or prompt changes, the Codex runner's review defaults in
`scripts/codex/lib/args.mjs` change, or a corpus batch lands. Every trial line records the sha256 of
its lens's agent file and of the corpus manifest, and `calc` refuses trials whose hashes no longer
match. `panels.json` stamps those hashes and the `args.mjs` hash, and `retro-stats.mjs --trust`
treats a stamp that no longer matches as no calibration at all: every tier then runs the maximum
panel.

**Start a fresh trials file** whenever this command's scoring rules change, including the grade
mapping in step 4: trials scored under different rules never mix.

## 1. Preconditions
- `plugins/deliver/.claude-plugin/plugin.json` exists under the repository root. Otherwise say this
  command is for the deliver source repository and stop.
- `node plugins/deliver/scripts/assurance.mjs manifest --check` and
  `node plugins/deliver/scripts/assurance.mjs witness` both exit 0. Otherwise stop: the corpus is
  not admitted, and no trial on it counts.
- `node plugins/deliver/scripts/codex/run.mjs --mode review --scope codebase --preflight` reports
  ready, or `codex-reviewer` is skipped and the report says so.
- When starting a fresh select phase, and only then, move any existing
  `benchmarks/assurance/results/trials.jsonl` to `tmp/calibrate/<YYYYMMDD-HHMMSS>-previous.jsonl`, so
  old trials never mix with new ones. When continuing a calibration, or moving on to the certify
  phase, keep the file: the certify trials join the select trials they follow.
- Dispatch the lenses from a session whose working directory is outside the deliver checkout where
  you can, so a lens's own exploration cannot wander into the corpus.

## 2. What a lens sees
For each trial, build a fresh repository with
`node plugins/deliver/scripts/assurance.mjs prepare --id <case> --variant <defect|clean>`. A seeded
case uses `defect`, a clean case uses `clean`. It prints `{ "dir", "diff" }`: `dir` is an opaquely
named repository under the system temporary directory, `<prep>` below, and `diff` is the staged
diff. Keep the mapping from `<prep>` to the case in your own scoring notes only; never write it
into `<prep>` or into a dispatch. Never reuse a prepared repository for a second trial, and delete
it once the trial is scored.

A lens receives the text of `fixtures/<case>/story.md` and that diff, and nothing else. Never the
case id, its class, its kind, its split, `cases.json`, `witness.test.mjs`, the other patch, a path
inside the deliver checkout, or a previous trial's output. Every dispatch states: "Your repository
is `<prep>`. Read nothing outside it." `architecture-reviewer` and `performance-reviewer` also get
one line in place of the plan sections they expect: "The plan has no Architecture or
Non-functional requirements beyond the story's Context." Add one line to every dispatch: write
nothing, and return only the report your instructions describe.

**A peek is an error.** A trial whose transcript shows any read under `benchmarks/assurance`, or
of any path inside the deliver checkout, is recorded as an `error` (step 3) and re-run in a fresh
prepared repository.

## 3. Dispatching a lens
Dispatch the four Claude lenses as separate general-purpose subagents, in concurrent batches, each
at its agent file's frontmatter `model` and `effort`, with the agent body as the instructions.
Trial 2 is a fresh dispatch with the same inputs; never show it trial 1.

`codex-reviewer` runs through its runner, with the working directory set to `<prep>` and its report
directory inside it, as `runReview` requires (`--out` must be `<repository root>/codex` or
`<repository root>/untracked`):

```
cd <prep> && node <deliver checkout>/plugins/deliver/scripts/codex/run.mjs --mode review --scope worktree \
  --out <prep>/codex \
  --objective "Review the staged change against the story in docs/story.md, including its acceptance criteria. Grade every finding block, major, minor, or nit."
```

The prepared repository's committed `.gitignore` already ignores `/codex/`, and the staged patch is
what the `worktree` scope reviews. Read the report at the envelope's `report_path`. Record the
envelope's `model` and `effort` as the trial's model and effort; they are the runner's effective
review model. If they differ from the runner's review default (a fallback model ran), the
calibration will read as stale for `codex-reviewer`; re-run those trials once the default model is
available.

**Errors are not results.** A dispatch or runner run that errors, times out, returns a non-zero
runner status, returns nothing, or peeks (step 2) is an `error`: record nothing for it and re-run
the trial with a fresh prepared repository. Never score an error as caught or as a miss, and never
retry a trial because its answer looks wrong. Report every case still in error at the end; its
absence keeps the affected panels out of selection or certification.

## 4. Score each trial
You score; the lens never sees the answer. Open the case's `defect.patch` and `witness.test.mjs`
only now, after the trial returned.

- **Grades.** The objective asks Codex for block, major, minor, and nit. When Codex answers in
  P-grades instead, P0, P1, and P2 count as block or major for both caught and false-positive;
  P3 and lower do not.
- **caught** (seeded cases): true only when the trial has a finding graded `block` or `major` that
  names the seeded defect. That means either the location, the file and the changed lines or
  function holding the defect, together with a claim that the code there is wrong, or the
  behaviour, an input or condition under which the code does the wrong thing that the witness
  tests. A finding at the right place that misstates the problem, a `minor` or `nit` that names
  it, a general worry ("consider edge cases"), or a verdict of FAIL without such a finding is not
  caught. When two readings are possible, record not caught and note the case in the report.
- **false-positive** (clean cases): true when the trial has any finding graded `block` or `major`,
  whatever it says. On a seeded case it is always false.
- **tokens**: the dispatch's total token count when the host reports it. The Codex runner's
  envelope reports none, so omit `--tokens` for `codex-reviewer`; its cost is then unknown, and
  `calc` ranks panels with an unknown cost after every fully priced panel.

Record each trial as it is scored. `trial-record` stamps the line with the prompt and corpus hashes
and the UTC time, plus the `scripts/codex/lib/args.mjs` hash on a codex-reviewer line. It refuses an
unknown lens, a trial other than 1 or 2, trial 2 before trial 1, a case whose split differs from
`--phase`, a trial already recorded, and a select trial once the file holds any certify trial:

```
node plugins/deliver/scripts/assurance.mjs trial-record --phase <select|certify> --lens <lens> \
  --model <model> --effort <effort> --case <id> --trial <1|2> --caught <true|false> \
  --false-positive <true|false> [--tokens <n>]
```

## 5. Phase 1, select
Each lens runs on the `select` seeded cases of its classes plus every `select` clean case, two
trials per case. List them with `node plugins/deliver/scripts/assurance.mjs list --split select
--class <c>` and `list --split select --kind clean`.

| lens | classes |
|------|---------|
| `code-integrity-reviewer` | all eight |
| `codex-reviewer` | all eight |
| `security-auditor` | security, error-handling, data |
| `architecture-reviewer` | criterion-unmet, error-handling, data |
| `performance-reviewer` | performance, async |

A lens never run on a case counts as missing it, so a specialist lens earns its place only through
the panels it joins. A lens is offered at two trials only where its trial 2 exists for every case
its trial 1 does.

Then run `node plugins/deliver/scripts/assurance.mjs calc` (with `--targets` when the arguments
name them). For each tier it chooses the cheapest panel whose select-split escape rate is within
the target, and prints the **certify plan**. A tier whose target the certify split cannot reach even
with no escapes is reported `unmeasured (corpus too small: needs ≥ N certify cases)` and is left
out of the plan; at batch 1 that is T2, which needs 149.

## 6. Phase 2, certify
Run exactly the certify plan `calc` printed: the union of the reachable tiers' chosen lenses, once
each, at the most trials any of those panels gives the lens. Each runs, fresh, on **every**
`certify` case, seeded of every class and clean (`list --split certify`), and records with
`--phase certify`. Never run a lens the plan does not name. The first certify line closes the select
phase: `trial-record --phase select` then refuses, and `calc` refuses any select trial recorded
after the first certify trial. Redoing selection means a fresh trials file and both phases again.

## 7. Calculate
Run `node plugins/deliver/scripts/assurance.mjs calc --write` (plus `--targets`). It takes each
tier's status, bound, and false-positive rate from the certify trials of exactly its chosen panel.
A tier is `measured` only when those trials are complete and the certify bound meets the target;
otherwise it is `unmeasured` and runs the maximum panel. The stamp's time is the latest trial's,
so running `calc --write` again on the same trials writes the same file.

Report the tier table `calc` prints, the lens table's caught out of seeded and false positives out
of clean for each split, every case scored as ambiguous, every trial still in error, and any lens
skipped. Commit `panels.json` and `results/trials.jsonl` together as `chore(assurance): calibrate`,
never with a prompt change or a corpus batch. Never edit a prompt or a fixture from this command.
