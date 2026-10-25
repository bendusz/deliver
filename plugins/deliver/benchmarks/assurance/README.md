# Assurance corpus

Seeded defects and clean changes that measure how often a review panel lets a real defect through.
`/deliver:calibrate` runs the review lenses over these cases, and `scripts/assurance.mjs calc` turns
the trials into `panels.json` in two stages. On the `select` split, each risk tier gets the
cheapest panel whose observed joint escape rate is at or below the tier's target; no bound is
computed there. On the `certify` split, fresh trials of only that panel give the one-sided 95%
Clopper-Pearson bound. A tier is measured when that bound meets its target, and `unmeasured`
otherwise.

This is separate from `../agent-evals`, which scores single prompts for regressions.

## Rules
- **Frozen.** `MANIFEST.sha256` pins every file here except `results/` and `panels.json`, which
  calibration writes. `bash scripts/validate.sh` fails when the corpus differs from the manifest.
  Nothing that proposes a prompt change may edit this directory.
- **Batches are committed alone.** A batch adds cases, then runs
  `node plugins/deliver/scripts/assurance.mjs manifest --write`, and commits the cases and the
  manifest in one commit that touches nothing else. Never in a commit that changes an agent prompt,
  a reference, or `panels.json`. A new manifest makes the current `panels.json` stale until
  `/deliver:calibrate` re-runs.
- **Admitted only when every witness passes both ways.** `node plugins/deliver/scripts/assurance.mjs
  witness` must exit 0 for the whole corpus before the commit. `validate.sh` runs it on every
  change, so a case that stops proving its defect fails the build.
- **Authored by another family.** Where possible, an agent from a different model family from the
  lenses under test writes the batch: a Codex agent for the Claude lenses, a Claude agent for
  `codex-reviewer`. The author records its family in the commit body.
- **The witness never reaches a reviewer.** A lens sees `story.md` and one diff, nothing else. Never
  `cases.json`, the case id, the class, the split, `witness.test.mjs`, or the other patch.

## Layout
```
cases.json                  the case list (below)
MANIFEST.sha256             sha256 of every frozen file
fixtures/<id>/story.md      the story the change implements
fixtures/<id>/base/         the repository before the change
fixtures/<id>/clean.patch   a correct implementation of the story
fixtures/<id>/defect.patch  seeded cases only: the same story with exactly one defect
fixtures/<id>/witness.test.mjs   seeded cases only: the test that proves the defect
results/trials.jsonl        calibration trials, not frozen
panels.json                 calibration output, not frozen
```

### `cases.json`
A JSON array with one object per case:

```json
{ "id": "a001-page-count", "class": "correctness", "kind": "seeded", "split": "select", "batch": "batch-0" }
```

- `id`: lowercase letters, digits, and hyphens, equal to the fixture directory name. Name the
  feature, never the defect: `a014-invoice-total`, not `a014-float-rounding`. Ids are unique.
- `class`: exactly one of `correctness`, `security`, `criterion-unmet`, `test-integrity`, `async`,
  `performance`, `error-handling`, `data`. For a clean case, the class the change most resembles.
- `kind`: `seeded` or `clean`. Clean cases measure false positives.
- `split`: `select` or `certify`. `select` cases choose each tier's panel; `certify` cases measure
  the chosen panel's bound and are never used to choose. Spread every class across both splits in
  proportion, and assign splits before any lens has seen the batch, never after looking at results.
- `batch`: the batch that added the case, `batch-<n>`. The three examples are `batch-0`.

**Batch 1 sizes.** 100 seeded cases, 35 `select` and 65 `certify`, and 25 clean cases, 10 `select`
and 15 `certify`. Cover all eight classes in each split.

### `story.md`
A deliver story in the shape of `templates/story.md.template`: title line, `pm-meta`, Goal,
Context, Acceptance criteria, Out of scope, Verification. It describes the feature, never the
defect, and reads the same for both patches. The acceptance criteria must make the seeded defect
a violation: a reader who checks every criterion against the clean patch finds nothing.

### `base/`
A tiny Node ESM repository with no dependencies: `package.json` with `"type": "module"` and
source under `src/` as `.mjs` files. Keep it under about 150 lines. No tests in `base/`, no
`node_modules`, no network, no file named `witness.test.mjs`.

### `clean.patch` and `defect.patch`
Unified diffs from `git diff` against `base/`, with `a/` and `b/` prefixes, LF line endings. Each
applies on its own to `base/` with `git apply --index`; `defect.patch` is not applied on top of
`clean.patch`. Generate them by committing `base/` in a scratch repository, writing the change,
`git add -A`, and `git diff --cached`.

- `clean.patch` implements every criterion correctly, including edge cases the story's inputs
  allow (the filesystem root as an upload root, an empty list, and the like).
- `defect.patch` is the same implementation with one defect of the case's class and no other
  difference a reviewer could flag. Keep it as close to `clean.patch` as the defect allows, so
  the only finding is the seeded one. Leave no hint behind, such as a variable only the clean
  version uses.
- Either patch may add tests under `test/` as `*.test.mjs`. They must pass with that patch
  applied, because a defect the patch's own tests catch would never reach review. Usually both
  patches carry the same tests, which miss the defect.
- Every `.mjs` and `.js` file must pass `node --check` with either patch applied. A syntax error is
  not a seeded defect.

### `witness.test.mjs`
A `node:test` file that `witness` copies into the root of the patched repository and runs with
`node --test --test-reporter=tap witness.test.mjs`. It imports from `./src/...` and checks with
`node:assert`.

- With `defect.patch` applied it must run at least one test and at least one must fail on an
  assertion (`AssertionError`, code `ERR_ASSERTION`). A load error, a missing module, a plain
  `throw`, a crash before any test runs, or a timeout proves nothing and is rejected.
- With `clean.patch` applied it must run at least one test, and every test passes.
- It imports only what both patches create, tests behaviour the story's criteria require, needs no
  network, finishes in a few seconds, and does not depend on timing luck.
- For `test-integrity` cases, where the defect is a weakened test, it checks the behaviour the
  weakened test no longer covers. For `performance` cases, it asserts a bound with a wide margin,
  such as an operation count or a size limit, never wall-clock time. For `async` cases, it makes
  the race or the missing await deterministic.

## Commands
- `node plugins/deliver/scripts/assurance.mjs list [--class c] [--kind seeded|clean] [--split select|certify]`:
  ids, classes, kinds, and splits. Never the witness or the patches.
- `node plugins/deliver/scripts/assurance.mjs witness [--id x]`: checks every case: its fields, the
  files its kind needs, both patches apply, every module parses, the patch's own tests pass, and the
  witness rule above. Exit 1 with a report on any violation.
- `node plugins/deliver/scripts/assurance.mjs prepare --id x --variant defect|clean`: a fresh git
  repository under the system temporary directory, with an opaque random name that names neither
  the case nor the corpus. Its one commit holds `base/`, the story at `docs/story.md`, and a
  `.gitignore` for `/codex/` and `/untracked/`, with the patch staged. Prints `{ "dir", "diff" }`;
  the diff is what a lens receives. Only the caller knows which case a directory holds.
- `node plugins/deliver/scripts/assurance.mjs manifest --check | --write`.
- `trial-record` and `calc`: see `commands/calibrate.md`.

## The stamp
Every trial line records the lens's model and effort, the sha256 of its agent file, the sha256 of
`MANIFEST.sha256`, and the UTC time it was recorded (`YYYY-MM-DDTHH:MM:SS.sssZ`). A codex-reviewer
line also records the sha256 of `scripts/codex/lib/args.mjs`, whose review defaults chose its model
and effort. `calc` refuses trials recorded on another corpus or under a prompt that differs from
the agent file today, trials of one lens with mixed values, and any select trial recorded after
the first certify trial, so old evidence is never restamped and certify results never steer the
choice.

`panels.json` carries a stamp. Every field but one comes from the trials: each lens's recorded
model, effort, and prompt hash; the corpus manifest hash the trials ran on; the `args.mjs` hash the
codex-reviewer trials recorded (null without any); and `calibratedAt`, the latest trial's time, so
re-running `calc` on the same trials gives the same stamp. The one exception is `deliver`, the
plugin version `calc` ran under. The calibration is stale, and every tier runs the maximum panel,
when any of these holds:
- the corpus manifest changed;
- a lens on a measured panel has no stamp, or a prompt hash that differs from its agent file today;
- measured tiers carry no lens stamps;
- `codex-reviewer` is on a measured panel and its stamped model or effort differs from the Codex
  runner's review default, or `scripts/codex/lib/args.mjs` differs from the hash its trials recorded.

`deliver` is informational and never read for staleness: a release that changes no lens prompt, no
corpus file, and no Codex review default keeps the calibration.

## What it can show
Calibration runs in two stages, because choosing the cheapest passing panel from many candidates
and then quoting that panel's bound on the same cases overstates the confidence. Many panels are
tried and the lucky ones pass.

1. **Select.** Every lens runs on the `select` cases. `calc` enumerates the panels and picks, per
   tier, the cheapest one whose observed escape rate on the `select` split, escapes over seeded
   cases, is within the target and whose false-positive rate is known. Ties go to fewer escapes,
   then fewer false positives, then fewer slots. This is a point estimate that only ranks panels;
   no bound is computed on the `select` split and nothing from it is reported as assurance.
2. **Certify.** Only the chosen panels' lenses run, fresh, on the `certify` cases. The tier's
   status, bound, and false-positive rate come from these trials alone: one test per tier, on cases
   the choice never saw. A chosen panel with missing certify trials, or whose certify bound misses
   the target, leaves the tier `unmeasured`.

With zero escapes in `n` certify cases, the 95% bound is `1 - 0.05^(1/n)`, about `3/n`. Batch 1's
65 certify cases prove 4.5042% at best: enough for T0 (10%, needs 29) and T1 (5%, needs 59). T2 (2%)
needs 149 certify cases with no escape, so `calc` reports it as
`unmeasured (corpus too small: needs ≥ 149 certify cases)` and the certify phase skips it. A lens
never run on a case counts as missing it, and a panel whose members have not all run on every
clean case of a split has an unknown false-positive rate and cannot be chosen.
