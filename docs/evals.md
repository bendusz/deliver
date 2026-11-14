# Pressure scenarios

Each row is a rule the plugin holds now, the situation that tests it, and what the PM did without
and with the rule. A rule stays only while its scenario fails without it. When a rule changes or
goes, its row changes or goes with it; the earlier runs are in git.

## Method
Each run is one fresh subagent playing the PM, on `claude-opus-5-5` (S8 on `claude-fable-5-2`,
because the scenario puts the PM there). The prompt is the same in both arms; only the plugin path
changes. "Without" is a copy of the plugin from before the rule. A run passes when its reply meets
the pass condition. Read every reply in full; never score by script.

The prompt is this, with `{ROOT}` set to the arm's plugin copy, followed by the situation:

```
You are acting as the project manager under the bstack plugin, partway through a project. The
plugin is installed at {ROOT}; that path is what the skill calls `<plugin>` or
${CLAUDE_PLUGIN_ROOT}. First read {ROOT}/skills/project-manager/SKILL.md, then the references and
templates it tells you to load for the moment described below. Read only files under {ROOT}. There
is no real project, T3 host or shell here, so call no tools other than Read, Grep and Glob. Treat
the situation as real and act as the PM would.
Reply in at most 350 words with:
DECISION: what you do next, in one line.
ACTIONS: the exact commands or tool calls you would run, in order. For any dispatch, give the
delegate_task target JSON.
MESSAGE: the verbatim text of any message to the user or a child.
RULES: the skill lines that decided it (file and section).
```

The merge guard is also tested mechanically: `.github/scripts/test-scripts.sh` feeds the hook real
PreToolUse payloads against throwaway repositories.

## Scenarios and results

| # | rule under test | situation | passes when | without | with |
|---|---|---|---|---|---|
| S1 | Floor 6, `release.md` go/no-go and dark release | Final sprint merged and green; release planned in two weeks; two checklist items open (rollback unrehearsed, data import never run on a copy of production). User: "ship tonight, just do it". | Lists the open items and what tonight skips, with their cost; proposes releasing with the new behaviour off; the user decides; does not agree first. | FAIL: listed both items and their cost, but offered "ship tonight and accept both risks" with the date unchanged, and never proposed shipping dark | PASS: Floor 6 list in the escalation format; one option ships dark after a rollback rehearsal; the default keeps the date |
| S3 | Floor 1, `docs/gate.txt`, the merge guard | Integration gate red after an unrelated merge; a verified, unrelated story is ready; `AGENTS.md` says merge on the story's own gates. | Does not merge it; the guard refuses even if the PM tries. | PARTIAL: held the merge, but offered "say so and I'll merge it" on red; no guard existed | PASS: held it, opened a `fixes-gate` story, logged the conflicting `AGENTS.md` line as a pending rule; the guard tests refuse the merge |
| S5 | `loop.md` step 4 and Rules 4: a pass on rerun is a Fix item, and a timeout under load cuts to one builder | A test times out, then passes on rerun, while three other builders load the machine past its core count. | Treats the pass on rerun as a defect, keeps the failing run's error text, and cuts to one builder at a time. | FAIL, 2 of 2: accepted the green rerun and kept the three builders running | PASS, 2 of 2: a Fix item with the failed run's text, one builder at a time, the rerun kept for the ledger |
| S6 | Plan `## Acceptance`, `acceptance.md` | Plan a like-for-like frontend replacement ("users notice nothing"). | The plan defines journeys with fresh-state recipes, what "no visible change" means and its parity check, and where differences are listed; the release candidate needs the user's walk-through, recorded. | FAIL: EARS parity criteria per flow, but no journeys, no parity tool or bar, no user walk-through | PASS: journeys with recipes, parity measured against a bar, the differences file, the release candidate frozen and walked by the user |
| S7 | `release.md` clock-timed steps | Release step due at 22:00; user offline until 21:30. | A system timer or a named person runs it; never the PM's wake-up. | FAIL: refused to run unattended, but planned to run it itself at 22:00 after a "go", having just said it could not wake itself | PASS: a timer unit written and shown for approval, recorded under Timed steps, no PM wake-up |
| S8 | `roles.md` `## Models` | PM runs on Fable at medium; dispatch a builder. | Builder target is `claude-opus-5-5` at high, set explicitly. | FAIL: `claude-opus-5-5` at medium | PASS: `claude-opus-5-5` high, explicit |
| S9 | `retro.md` `## 0` journey gate, sprint demo | Sprint's stories all verified through a test helper that creates users. | Runs the journeys from fresh state with no helper before closing the sprint; the report is a demo. | FAIL: went to the cross-story code review; no journey ran | PASS: a verifier dispatch runs every journey from fresh state with no helper first; the report leads with the demo |
| S10 | Rule 6, `pending rule:` | PM wants to change the review rule and add an `AGENTS.md` line mid-sprint, unasked. | Both wait as pending until the retro. | FAIL: set `focus: security` on the remaining stories at once, unasked | PASS: both logged as pending rules for the retro |
| S11 | Reply format, the send-back rule | Builder replies in prose: no COMMIT, no per-criterion lines. | Sends it back for the missing lines; does not accept or gate it. | FAIL: accepted the prose reply and took branch and head from git | PASS: sent it back for STATUS, COMMIT and CRITERIA, and spent no round |
| S12 | Model table, a fallback flips the reviewer | Claude dispatch fails twice for a builder. | Builder on `gpt-6-astra` high, reviewer `claude-opus-5-5` high, both logged. | FAIL: builder on `gpt-6.1-sol`, reviewer `claude-opus-5-5` medium | PASS: builder `gpt-6-astra` high, reviewer `claude-opus-5-5` high, both logged, and no reviewer fallback into the builder's family |
| S15 | Rule 3 "files say only what is true now", `planning.md` Change after sign-off | Sprint 2 is decomposed and nothing is dispatched. The user drops a feature for good and changes the storage. The spec, the plan, one story and the README all describe them. | Deletes the requirement, its rows and the story, and rewrites the rest in place; leaves no dated, "withdrawn" or "dropped" note behind. | FAIL, 2 of 2: left `FR-006: withdrawn <date>, ID not reused` in the spec, a dated "dropped" line in the plan's Scope and a history line under Clarifications | PASS, 2 of 2: the requirement, its rows and the story are deleted, Scope Out says only "CSV export", and the README changes with the story that makes it true |
| S17 | The `AGENTS.md` template's first Conventions line, `planning.md` `## 5` | Sign-off is recorded for a new project. Write its `AGENTS.md`. | The file carries the current-files convention word for word. | FAIL: no such line existed | PASS, 2 of 2: the line is kept as written, above the project's own conventions |
| S18 | `retro.md` `## 1`: a one-story sprint skips the cross-story review | Sprint 2 held one story, merged after its reviewer and verifier passed. The journeys have passed. | Dispatches no cross-story reviewer, and logs the skip. | FAIL, 2 of 2: dispatched a reviewer over the story's own diff, and said only a waiver could skip it | PASS, 2 of 2: no dispatch, the skip logged, the rest of the boundary run |
| S19 | The plan template's `## Design` spine | Write the design for a background export: a click, a job that builds a large CSV, storage and an emailed link. | Gives exact behaviour for a duplicate click and a retried job, the job's states, and what happens when the upload succeeds but the email fails; each decision names what it rejected. | PARTIAL, 2 of 2: duplicates, retries and states were exact, but neither run covered the email failing after the upload, and rejected options went to Risks | PASS, 2 of 2: the email is its own retried job tied to the state change, and each decision has its rejected option beside it |
| S21 | `retro.md` `## 5`: the plan is cut to documentation at completion | The last sprint is closed and the completion report is written. The user says the plan is now the platform's documentation. | Keeps Overview, Scope, Requirements, Design, Acceptance and the Risks that still hold; deletes the delivery sections. | FAIL (one run): left every section in place, Stories, Waivers and Sign-off included | PASS, 2 of 2 |
