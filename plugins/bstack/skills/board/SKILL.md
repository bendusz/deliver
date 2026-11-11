---
name: board
description: Use when the user invokes /bstack:board or asks for a board meeting, a stakeholder review, a 0-10 score of the project's status, or several models' joint judgement on a question about the project. User-invoked, advisory and costly under T3 Code; never start it on your own.
argument-hint: "[quick] [<seat>=<model>[:<effort>] …] [status | ask <question>]"
---

If you were dispatched as a child agent (your task begins 'You are a bstack … child'), do not use this skill.

`references/…` below means `${CLAUDE_PLUGIN_ROOT}/skills/project-manager/references/…`, and
`<plugin>` in any reference means `${CLAUDE_PLUGIN_ROOT}`. Neither is a shell variable: write the
path out in every command.

# The board

Three stakeholders meet about this project: a sponsor, an engineering lead and a customer. Each is
a T3 child on its own model. They either score the project's status from 0 to 10 and recommend
what to do, or assess a question the user puts to them. A fourth child chairs: it runs the gates,
writes the brief, relays, tallies and writes the minutes, with no vote and no opinion.

You convene the meeting and receive the verdict. Nothing else of it enters your context, and
nothing of yours enters the meeting: you may have run this project, and a brief you wrote or a
tally you made would be marking your own work.

The board advises. It approves nothing, edits no plan, story or code, and starts no work.

Arguments: $ARGUMENTS

## Arguments
- No mode means `status`. `ask <question>` assesses the question and gives no score. If the first
  word after the options is neither, everything after the options is the question. `ask` with no
  question: ask the user for it.
- `<seat>=<model>` changes a seat's model, `<seat>=<model>:<effort>` its effort too, and
  `<seat>=:<effort>` only the effort: `engineering=gpt-6.1-sol:high`, `sponsor=:max`,
  `chair=:high`.
- `quick` holds round 1 only and lowers each member's default effort one step. Call the result an
  independent panel, not a discussion.

## Seats
| Seat | Stake | Default target |
|---|---|---|
| sponsor | Accountable for the outcome: does the work still serve the goal, is the scope right, are the risks being retired, is it worth what it costs | `{"providerInstanceId":"claudeAgent","model":"claude-opus-5-5","options":{"effort":"high"}}` |
| engineering | Owns what was built: correctness, tests, security, debt, and whether the next change will be cheap or dear | `{"providerInstanceId":"codex","model":"gpt-6-astra","options":{"reasoningEffort":"xhigh"}}` |
| customer | The person who uses what ships: does it do what they need, would they get through the first run, the docs and the errors | `{"providerInstanceId":"claudeAgent","model":"claude-fable-5-2","options":{"effort":"medium"}}` |
| chair | None, and no vote | `{"providerInstanceId":"claudeAgent","model":"claude-opus-5-5","options":{"effort":"medium"}}` |

A seat is a place to look from, not a fence: every member judges the whole project. An override
changes the model, never the stake. `quick` efforts: sponsor `medium`, engineering `high`,
customer `low`; an effort the user names stands as given.

## Convene
1. **Host.** Probe as `references/host.md` `## Probe` says; without T3 Code, say "bstack requires
   T3 Code" and stop. All four models and efforts must be in `orchestrator_capabilities`, on the
   provider that lists the model (`effort` for Claude, `reasoningEffort` for Codex). If one is
   not, name it and stop before dispatching anyone: the user names a replacement or agrees to a
   two-seat meeting. Never substitute a model yourself.
2. **Baseline.** Take one stamp, `YYYYMMDD-HHMMSS`: it is the meeting's id in every key and
   path, reused only to retry this meeting. If a minutes file with that stamp exists in
   `docs/board/` or `tmp/board/`, take a new one. Record the absolute repository root, the
   branch, `git rev-parse HEAD` and whether `git status --porcelain` is empty.
3. **Goal.** With `docs/approval.json` the project is managed, and the chair takes the goal and
   the milestone from the plan: pass none. Otherwise check that the README or a manifest says
   what the project is for. If nothing does, ask the user once, "What does success look like
   here, and what is the next milestone?", and pass the answer verbatim.
4. **Dispatch the chair,** one `delegate_task` as `references/host.md` `## Dispatch` says:
   - `task`: these lines, then the meeting block. The chair reads its soul itself, so the souls
     never enter your context; do not read `souls.md`.
     ```
     You are a bstack board chair child, not the PM and not a member. Do not invoke the project-manager skill or any other bstack skill.
     Read ${CLAUDE_PLUGIN_ROOT}/skills/board/souls.md now, in full. Its "Chair soul" is your instructions; its "Member soul" is what you paste to each seat. Then hold this meeting. If you cannot read that file, return `Board: failed, cannot read souls.md` and stop.

     Meeting
     - Stamp: <stamp> · Mode: <status | ask> · Rounds: <2 | 1 for quick>
     - Question: <verbatim, ask mode only>
     - Repository: <absolute root> · Branch: <branch> · Baseline: <sha>, <clean | dirty>
     - Managed: <yes, integration branch <name> | no>
     - Goal and milestone: <from the plan | the user's answer, verbatim | from <file>>
     - Minutes: <absolute path>
     - sponsor: <target JSON>
     - engineering: <target JSON>
     - customer: <target JSON>
     ```
     Leave out a seat the user agreed to do without. Add nothing else: no summary of the
     project, no view of its health, no hint of what you expect.
   - `target`: the chair's. `isolation: "shared"`. `role: "general"`. `title`:
     `board chair <mode>`. `clientRequestId`: `board-<stamp>-chair`.
   - Minutes path: `docs/board/<stamp>-<mode>.md` in a managed project, else
     `tmp/board/<stamp>-<mode>.md`.
5. **Wait** without polling. Until the verdict is back, merge nothing and leave the checked-out
   branch where it is: the members read this tree. Builders already in their worktrees carry on.
   Do not read the chair's or a member's thread while they work.

## Verdict
The chair's last message begins `Board:`. Anything else is not a verdict; see below.
- Confirm the minutes file exists at the path. Do not read it, or any member's thread, unless
  the user asks or a recommendation you are about to act on needs its evidence: keeping them out
  of your context is why the chair exists.
- Managed project: log the chair's `Log:` line as written with
  `bash "${CLAUDE_PLUGIN_ROOT}/scripts/log.sh" "<line>"`, and commit the minutes and `docs/log.md`
  only, as `docs(board): <mode> <stamp>`. If `log.sh` rejects the line as too long, shorten only
  the recommendation after the colon until it fits, keep the mode and the scores, and log that.
- Anywhere else: no log line and no commit. If `.gitignore` does not ignore `tmp/`, show the
  one-line addition and ask before appending it.
- Tell the user the verdict as the chair returned it, the minutes path and the chair's thread.
  If you disagree with the board, say so after that, in your own name.

## When the chair fails
- You are woken while the chair's last line is `waiting: round <n>`: it is between rounds. Keep
  waiting; that is not a result.
- A chair that fails, or settles on anything else that is not a verdict, gets one replacement:
  the same task with key `board-<stamp>-chair-b`. It starts the meeting again, because a new
  chair cannot reach the first one's members. If that fails too, or the chair returns
  `Board: failed`, tell the user the meeting failed, why, and name the chair threads.
- Never chair it yourself, and never tally from what a failed chair left behind.

## Authority
The board is one input. A recommendation that stays inside the signed-off plan is the PM's to
adopt as its own logged decision. One that changes scope, architecture or the plan is a question
for the user and follows `references/planning.md` "Change after sign-off". No recommendation
becomes a story on its own.

