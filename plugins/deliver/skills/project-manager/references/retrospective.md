# Sprint retrospective

Run at the sprint checkpoint, after the sprint's last story is `merged` and before the next
sprint's first claim. `/deliver:retro` drives it. Two bounded steps, then a short record. The
point is to feed what the sprint taught back into `AGENTS.md` and the next stories, so the same
mistake is not paid for twice.

## 1. Sprint review, cross-story only
Find the sprint's range on the integration branch: the parent of the first story's merge commit to
the last story's merge commit (`git log --first-parent --merges`). Produce
`git diff <from>...<to>`. Under about 1,500 changed lines, dispatch `code-integrity-reviewer` with
that diff, the plan's Architecture section, and the sprint's story files, asking only for problems
no single story review could see: duplicated logic across stories, a convention two stories
interpreted differently, an interface one story changed and another still assumes. A larger sprint
gets `architecture-reviewer` with the changed-file list and the Architecture section instead.
Findings enter `fix-loop.md` triage; a `block` or `major` becomes a fix story at the head of the
next sprint, never a silent edit on the integration branch.

## 2. Retrospective, three questions with evidence
Read each story's Execution block and notes, its merge commit body, and the review verdicts. Answer:
- Which finding recurred across stories, or which fix round was spent on a convention the story
  could not have known? Each is a candidate one-line Gotcha or Convention for `AGENTS.md`.
- Which story's Context lacked something the builder had to discover? Each is a candidate line for
  the next sprint's stories, or a note for `decomposition.md`'s Context guidance.
- Which gate, review lens, or verification step caught nothing this sprint and cost time? Say so;
  the user decides whether to drop it at this scale, never you.

Propose the `AGENTS.md` additions as a diff and ask; never write them unasked. A line earns its
place only when its absence caused a mistake this sprint, since every line is paid on every
dispatch (`instruction-layers.md`).

## 3. Record
Write `docs/retros/sprint-<n>.md` from `${CLAUDE_PLUGIN_ROOT}/templates/retro.md.template`: the
review verdict, the three answers, the accepted `AGENTS.md` lines, and the carried-over items.
Commit it together with the `AGENTS.md` change as `chore(retro): sprint <n>`. With a wiki,
`librarian ingest` the record per `knowledge.md`. Then the checkpoint pause, per
`planning-and-signoff.md`.
