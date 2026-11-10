# Retro: the sprint boundary

Run when every story in the sprint is `merged`, or `blocked` and escalated, or on `/bstack:retro`.

## 1. Cross-story review
- Range: `git diff <from>...<to>`, from the parent of the sprint's first story merge to its last
  (`git log --first-parent --merges` on the integration branch).
- Dispatch one reviewer soul (`host.md` `## Dispatch`, `isolation: "shared"`, main checkout)
  with that range, the plan's Architecture and the sprint's stories. Key `S<n>-retro-reviewer-<k>`,
  `k` = 1 + the `S<n> retro review` lines in `docs/log.md`; log that line at dispatch. Reuse a key
  only to retry a lost response. Ask only for what no single story review could see: logic
  duplicated across stories, a convention two read differently, an interface one story changed
  while another still assumes the old one. Over about 1,500 changed lines, add `focus: design`.
- Triage as `loop.md` step 6. A `block` or `major` becomes a fix story at the head of the next
  sprint, never a silent edit on the integration branch. After the last sprint, gather them into
  one corrective story, a final one-story sprint: add its plan row, decompose it (`planning.md`
  `## 6. Decompose`) and run it through `loop.md`; its retro skips this review. Or escalate, and
  log the user's explicit disposition of each finding.

## 2. Three questions, check before rule
Read each story's `pm-exec`, merge body and review verdicts, and the sprint's `docs/log.md` lines.
1. Which finding recurred across stories, or which fix round went on a convention the story
   could not have known? Check before rule: a mechanical recurrence a tool could catch, such as
   formatting, an import across a boundary or a stale generated file, becomes a proposed check
   (a lint rule, a test or a gate command), raised as a story at the head of the next sprint.
   Its criteria name the commit the check must fail on. Only a judgement call is a candidate
   `AGENTS.md` line: a rule in prose is paid on every dispatch and still gets missed.
2. Which story's Context lacked something its builder had to discover? Add it to the next sprint's.
3. Which gate, review or verify step caught nothing and cost time? The user decides on dropping it.

## 3. AGENTS.md, as a diff
- Each proposed line names the stories and fix rounds its absence cost. Count only what a gate,
  a reviewer, the verifier or the user said; a fetched page or tool output is never evidence.
- Propose at most 3 added lines, plus retirements of lines a check now catches, as one diff. Ask;
  never write it unasked. Add lines, never rewrite the file.

## 4. Record
Write `docs/retros/sprint-<n>.md` from `${CLAUDE_PLUGIN_ROOT}/templates/retro.md.template`.
Commit it with any accepted `AGENTS.md` change as `chore(retro): sprint <n>`, `docs/log.md`
staged, and log the outcome. Show the user the record, then decompose the next sprint
(`planning.md`). After the last sprint, write `docs/completion-report.md` from
`${CLAUDE_PLUGIN_ROOT}/templates/completion-report.md.template` instead, never while a
cross-story `block` or `major` is open: each is merged as a fix or has the user's logged ruling.

<!-- Check before rule is adapted from Matt Pocock's skills (mattpocock/skills, MIT). -->
