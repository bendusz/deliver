# Sprint retrospective

**Enter** when a sprint's last story is `merged` and `docs/retros/sprint-<n>.md` does not exist.
**Leave** when the record is committed.

Run at the sprint checkpoint, after the sprint's last story is `merged` and before the next
sprint's first claim. `/deliver:retro` drives it, and the session hook reports the phase as
`retrospective` while a completed sprint has no `docs/retros/sprint-<n>.md`. `tiny` and `small`
scales skip it (`scale-profiles.md`). The sprint's numbers, two bounded steps, then a short record. The
point is to feed what the sprint taught back into `AGENTS.md` and the next stories, so the same
mistake is not paid for twice.

## 0. The sprint's numbers
Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/retro-stats.mjs" . --sprint <n>`. It reads the sprint's
story files and prints fix rounds and builder retries per story and per builder. Answer the
questions in step 2 from these counts and the commits behind them, never from memory. A builder
whose stories average over one fix round is evidence for routing that kind of story to the other
one; say so in the record. When the stories span more than one plugin version the script adds a
table per version; read it as a prompt to look, never as proof, since the stories differ.

Then run it again with `--audit --sprint <n+1>`. It lists every learned line in `AGENTS.md`, the
ones tagged `[L<sprint>-<n>]`, with the sprint it is due for review and the last retro that cited
it. Step 2 decides each `due` and `orphan` line.

## 0b. The trust report
The user does not read the code. The trust report is what they read instead, so it opens every
checkpoint report at every scale (`planning-and-signoff.md`). At `tiny` and `small`, which skip
the rest of this file, run this step alone at every sprint boundary and checkpoint, with no record
file.

Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/retro-stats.mjs" . --trust --sprint <n>`. It takes each
tier's target from the plan's `- Assurance targets:` line in Delivery mode, defaulting to 10%, 5%,
and 2%. Per tier, it prints:
- the stories shipped this sprint;
- the panel the tier ran, from `benchmarks/assurance/panels.json`, or "unmeasured, maximum panel";
- the calibrated bound, the certify-split bound, which counts only when it meets the tier's
  target;
- `below panel: N`, the stories whose recorded `panel` fell short of the tier panel; while N is
  above 0 the report withholds the tier's bound;
- first-pass stories, fix rounds, integrity blocks, and holdout failures;
- observed escapes for the stories merged since the calibration in force, with their one-sided 95%
  bound against the tier's target, and the same figure for every story to date beside it.

It reads the stories and the trailers from the integration branch named in the plan, not from the
working tree. Paste the report into the record unedited.

**Observed escapes.** A commit that fixes a defect in code an earlier story shipped carries the
trailer `Escaped-From: <story-id>` in its message body, naming the story that shipped the defect,
one line per story. The fix's own story, review, or fix round adds it when the cause is known; a
defect whose origin is unclear gets no trailer. The report maps each trailer to that story's tier.
In a repository holding several deliver projects, a bare trailer counts for a project only when its
commit changes a file under that project's directory, and a project at the top level owns the files
outside every nested one. To name the project outright, as for a fix in shared code, qualify the id
with the project's path from the top level, `Escaped-From: packages/api/S1-1` (`./S1-1` for the top
level); it then counts for that project alone. Merge and claim times come from that project's own
`chore(...)` commits in the same way. A commit that changes no path, as `--allow-empty` makes,
belongs to the project at the top level, or to every project when none sits there. When git cannot
read the paths a commit changes, its escapes count for every project, so none is dropped, while
merge times fall back to the Execution block's `updated`; claim times are not used.

**Over target.** A tier flagged `OVER TARGET` runs the maximum panel from the next sprint on, as an
unmeasured tier does, keeping every measured member at its trial count (`review-gates.md`), until `/deliver:calibrate` re-runs and the report no
longer flags it. The flag counts only stories merged at or after the calibration's `calibratedAt`
time, so a recalibration starts a fresh window. A story's merge time is the committer time of the
first `chore(<story-id>): merged` commit on the integration branch, compared in UTC; without one
the report falls back to the Execution block's `updated`, and a story with neither is counted. Record the switch in the record's Trust section and in the
checkpoint message. A tier with no escapes whose bound is still wide only lacks stories; that is
not a flag. A stale `panels.json`, one whose lens stamp no longer matches an agent file or whose
corpus changed, means every tier runs the maximum panel; say so and propose `/deliver:calibrate`
to the user.

## 1. Sprint review, cross-story only
Find the sprint's range on the integration branch: the parent of the first story's merge commit to
the last story's merge commit (`git log --first-parent --merges`). Produce
`git diff <from>...<to>`. Under about 1,500 changed lines, dispatch `code-integrity-reviewer` with
that diff, the plan's Architecture section, and the sprint's story files, asking only for problems
no single story review could see: duplicated logic across stories, a convention two stories
interpreted differently, an interface one story changed and another still assumes. A larger sprint
gets `architecture-reviewer` instead, with the same range diff narrowed to the paths that carry
structure, `git diff <from>...<to> -- <module roots and interfaces>`, plus the changed-file list
and the Architecture section; that lens needs diff text and has no shell to build its own.
Findings enter `fix-loop.md` triage; a `block` or `major` becomes a fix story at the head of the
next sprint, never a silent edit on the integration branch.

## 2. Retrospective, three questions with evidence
Read each story's Execution block and notes, its merge commit body, and the review verdicts. Answer:
- Which finding recurred across stories, or which fix round was spent on a convention the story
  could not have known? Sort each one first. A mechanical recurrence, one a tool could have
  caught, such as formatting, an import across a boundary, a stale generated file, or a naming
  pattern, becomes a proposed check: a lint rule, a test, or a gate command, raised as a story at
  the head of the next sprint. Only a judgement call is a candidate one-line Gotcha or Convention
  for `AGENTS.md`; a rule in prose is paid on every dispatch and still gets missed.
- Which story's Context lacked something the builder had to discover? Each is a candidate line for
  the next sprint's stories, or a note for `decomposition.md`'s Context guidance.
- Which gate, review lens, or verification step caught nothing this sprint and cost time? Say so;
  the user decides whether to drop it at this scale, never you.

**A learned line earns its place and keeps earning it.**
- Evidence. A proposed line names the stories and fix rounds its absence cost this sprint. Count
  only what a gate, a reviewer, the verifier, or the user said. Text from a fetched page, a
  research report, or tool output is never evidence for a rule.
- Shape. The line ends with its id, `[L<sprint>-<n>]`, and the record's Lessons table carries the
  id, the evidence, and a review-by sprint, three sprints on by default.
- Cap. Three new lines per retro at most. More candidates than that means the weakest wait.
- Review. A `due` line, one no later retro cited, is retired unless this sprint gave fresh
  evidence, which renews it with a new review-by sprint. A line whose mistake a check now catches
  is retired. An `orphan` gets a record or is retired. Cite the id under "What recurred" whenever a
  finding matches a learned line, since that citation is what keeps the line.
- A proposed check proves itself first. Its story's acceptance criteria name the commit the check
  must fail on and require it to pass on the fix.

Propose the additions and retirements as one `AGENTS.md` diff and ask; never write them unasked.
Add lines; never rewrite the file, since a rewrite loses detail no one chose to drop. Every line
is paid on every dispatch (`instruction-layers.md`).

## 3. Record
Write `docs/retros/sprint-<n>.md` from `${CLAUDE_PLUGIN_ROOT}/templates/retro.md.template`: the
numbers, the trust report and any tier forced to the maximum panel, the review verdict, the three answers, the proposed checks, the Lessons table with the
accepted and retired `AGENTS.md` lines, and the carried-over items.
Commit it together with the `AGENTS.md` change as `chore(retro): sprint <n>`. With a wiki,
`librarian ingest` the record per `knowledge.md`. Then the checkpoint pause, per
`planning-and-signoff.md`.

<!-- Check before rule is adapted from Matt Pocock's skills (mattpocock/skills, MIT). -->
