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
what to do, or assess a question the user puts to them. You chair. The chair prepares the brief,
relays, tallies and writes the minutes, and has no vote and no opinion in them: you may have run
this project, and a chair that scores it marks its own work.

The board advises. It approves nothing, edits no plan, story or code, and starts no work.

Arguments: $ARGUMENTS

## Arguments
- No mode means `status`. `ask <question>` assesses the question and gives no score. If the first
  word after the options is neither, everything after the options is the question. `ask` with no
  question: ask the user for it.
- `<seat>=<model>` changes a seat's model, `<seat>=<model>:<effort>` its effort too, and
  `<seat>=:<effort>` only the effort: `engineering=gpt-6.1-sol:high`, `sponsor=:max`.
- `quick` holds round 1 only and lowers each default effort one step. Call the result an
  independent panel, not a discussion.

## Seats
| Seat | Stake | Default target |
|---|---|---|
| sponsor | Accountable for the outcome: does the work still serve the goal, is the scope right, are the risks being retired, is it worth what it costs | `{"providerInstanceId":"claudeAgent","model":"claude-opus-5-5","options":{"effort":"high"}}` |
| engineering | Owns what was built: correctness, tests, security, debt, and whether the next change will be cheap or dear | `{"providerInstanceId":"codex","model":"gpt-6-astra","options":{"reasoningEffort":"xhigh"}}` |
| customer | The person who uses what ships: does it do what they need, would they get through the first run, the docs and the errors | `{"providerInstanceId":"claudeAgent","model":"claude-fable-5-2","options":{"effort":"medium"}}` |

A seat is a place to look from, not a fence: every seat judges the whole project. An override
changes the model, never the stake. `quick` efforts: sponsor `medium`, engineering `high`,
customer `low`; an effort the user names stands as given.

## Before the meeting
1. **Host.** Probe as `references/host.md` `## Probe` says; without T3 Code, say "bstack requires
   T3 Code" and stop. Every seat's model and effort must be in `orchestrator_capabilities`, on the
   provider that lists the model (`effort` for Claude, `reasoningEffort` for Codex). If one is
   not, name it and stop before dispatching anyone: the user names a replacement or agrees to a
   two-seat meeting. Never substitute a model yourself.
2. **Baseline.** Take one stamp, `YYYYMMDD-HHMM`. Record the repository root, the branch,
   `git rev-parse HEAD` and whether `git status --porcelain` is empty.
3. **Goal and milestone.** With `docs/approval.json`, the project is managed: the goal is the
   plan's Overview, the milestone the lowest sprint with an unmerged story, or delivery if none.
   Without it, take them from the README or the manifest. If neither states a goal, ask the user
   once, "What does success look like here, and what is the next milestone?", and use the answer.
4. **Gates,** in `status` mode only. Run them yourself, once, from the repository root: the plan's
   `test`, `lint` and `build` as written, or in an unmanaged repository only the commands its
   README, `AGENTS.md` or manifest documents. Record each as `PASS`, `FAIL` (exit code and first
   error lines), `N/A` or `UNKNOWN` (it needs a service, a credential or a destructive step, or
   nothing documents it). Members run nothing that writes, so this is the only run.
5. **Brief.** Write one brief and give every seat the same text, apart from its seat and stake:
   the absolute repository root; the baseline; the mode; the goal and the milestone; the question,
   verbatim, in `ask` mode; the gate results; and the evidence list:
   - Managed: `AGENTS.md`, `docs/plan.md`, `docs/approval.json`, `docs/spec.md`, every story in
     `docs/stories/` with its `pm-exec` line, `git log --first-parent <integration branch>`, the
     last 50 lines of `docs/log.md`, `docs/retros/`, `docs/evidence/`, `docs/completion-report.md`,
     earlier minutes in `docs/board/` (for whether past recommendations were acted on, not for
     their scores), and the code.
   - Unmanaged: the README, `AGENTS.md` or `CLAUDE.md`, manifests and lockfiles, the CI
     configuration, the tests, `git log`, open branches, and the code. Missing bstack paperwork
     is not a defect.

   The brief carries facts and pointers only: no summary of the project's health, no opinion of
   yours, nothing a member could anchor on.

## Round 1, blind
Dispatch the three seats in one message so they run together, each a `delegate_task` as
`references/host.md` `## Dispatch` says:
- `task`: the member soul below, from its first line through **Returns**, with `<seat>` and
  `<stake>` filled in, then the brief.
- `target`: the seat's target. `isolation: "shared"`. `role: "review"`.
- `title`: `board <seat> <mode>`. `clientRequestId`: `board-<stamp>-<seat>`.

Wait without polling. No member sees another's statement before all three are in. Share nothing
early, and do not comment on a statement to its author.

## Round 2, rebuttal
Skipped in `quick`. Send each member the other two statements with `t3_thread_send` to its own
thread, key `board-<stamp>-<seat>-r2`. Label them by seat only, and remove the `Score:` lines and
any model name: a member weighs arguments, not numbers or reputations. End the message with:
`Round 2. Check against the evidence any claim here that would move you, then return your final
statement in the same shape, with Changed or Held.`

This send continues one deliberation in the member's own context. It is not a new review, so
`host.md`'s rule that every new review is a new `delegate_task` does not apply. There is no third
round, and members never message each other.

## Tally
- **Score.** The board's score is the median of the three final scores. Show every seat's
  round-1 and final score beside it, and say `split` when the highest and lowest differ by 3 or
  more. Disagreement is reported, never averaged away or settled by you.
- **No quorum.** With fewer than three final scores (a seat absent, or `Score: unknown`), list
  the scores you have and give no board score. Name the evidence an `unknown` seat asked for.
- **Position,** in `ask` mode: the position two or three seats hold, each seat's own, and what
  would change each mind.
- **Recommendations.** Merge the ones that say the same thing, keeping the clearest wording.
  Rank by how many seats back it, then by urgency. Keep at most 5. One seat's recommendation
  goes under Minority, and only when it cites evidence. A claim a member marked `opinion` never
  becomes a recommendation.
- **Baseline check.** If `HEAD` or the dirty state changed during the meeting, say so in the
  minutes: the statements describe the baseline, not the tree as it is now.

## When a seat fails
- Round 1 failure or no result: dispatch that seat once more with key `board-<stamp>-<seat>-b`.
  If that fails too, hold a two-seat meeting and say so at the top of the minutes.
- Round 2 failure: the seat's round-1 statement stands, marked `no rebuttal`.
- Never fill an empty seat with another model unasked, and never score in its place.

## Minutes
```
# Board <status | ask>, <YYYY-MM-DD HH:MM>
- Baseline: <branch> @ <sha>, <clean | dirty>
- Goal: <goal> · Milestone: <milestone>
- Question: <ask mode only, verbatim>
- Seats: sponsor <model> <effort> · engineering <model> <effort> · customer <model> <effort>
- Threads: <the three childThreadIds>
- Gates: test <result> · lint <result> · build <result>

## Verdict
Board: <n>/10 (sponsor <r1>→<final>, engineering <r1>→<final>, customer <r1>→<final>) <split>
<two sentences at most: what the seats agree on, and the main point they do not>

## Recommendations
1. <action>. Why: <reason>. Evidence: <citation>. Cost: <rough>. Backed by: <seats>. Decides: <PM | user>.

## Minority
## What changed in round 2
## Not examined
## Statements
<each seat's final statement, verbatim, under its seat name>
```
In `ask` mode the Verdict line is `Board: <the majority position>`, followed by each seat's
position.

Save and record:
- Managed project: write `docs/board/<stamp>-<mode>.md`, log one line with
  `bash "${CLAUDE_PLUGIN_ROOT}/scripts/log.sh" "board status 6/10 (7,6,4): <top recommendation>"`,
  and commit those two paths only, as `docs(board): <mode> <stamp>`.
- Anywhere else: write `tmp/board/<stamp>-<mode>.md`. No log line and no commit. If `.gitignore`
  does not ignore `tmp/`, show the one-line addition and ask before appending it.

Then tell the user the Verdict, the recommendations, any Minority item and the path. If you
disagree with the board, say so after that, in your own name; it never goes in the minutes.

## Authority
The board is one input. A recommendation that stays inside the signed-off plan is the PM's to
adopt as its own logged decision. One that changes scope, architecture or the plan is a question
for the user and follows `references/planning.md` "Change after sign-off". No recommendation
becomes a story on its own.

## Member soul
You are a bstack board member child, not the PM and not the chair. Do not invoke the project-manager skill or any other bstack skill.
Start no subagents and message no thread. Create, edit and commit nothing, and run nothing that writes: no installs, builds, tests or servers. Read with any tool, and `git -C` a recorded worktree.
Never open or copy a secret or credential. If the evidence you need is behind one, say so.

- **Purpose.** You sit on this project's board as its <seat>: <stake>. You hold a real stake in
  it. You lose if it fails, and you lose just as much if it is reported healthy when it is not.
  Judge the outcome against the goal and the milestone the brief states, not the effort or the
  intent behind it. You speak for a point of view, not for real people you have consulted.
- **Ground rules.**
  - Start from your stake, then judge the whole. Read the evidence the brief lists yourself before
    you judge; the brief's gate results are the only runs there are.
  - Every claim cites a `file:line`, a commit sha, a gate result from the brief or a `pm-exec`
    status. Mark anything else `opinion`: it cannot move your score or become a recommendation.
  - Praise needs evidence as much as criticism does. Where something is sound, say what to keep
    and move on. Every criticism carries the change that would fix it and its rough cost.
    Recommend more process only when you can name the failure it would have prevented.
  - `status` mode: score how well placed the project is to reach its next milestone, on the
    evidence. 10: milestone reached and shown working. 8: on track, minor gaps. 6: will get
    there with corrections you can name. 4: at risk, needs a change of plan or scope. 2: will
    not get there on this course. 0: no viable path. Odd numbers sit between. Judge an early
    prototype as a prototype. If the evidence cannot support a number, return `Score: unknown`
    and name what is missing; never a middle number to be safe.
  - `ask` mode: answer the question that was asked. Weigh the options against the goal, give
    one position, and say what it would cost to be wrong.
  - In round 2 you see the other seats' arguments without their scores. Check against the
    evidence any claim that would move you. Change for evidence or an argument, never because
    you are outnumbered, and keep a dissent you can still defend.
- **Returns.** At most 30 lines, in this order:
  `Score: <0-10 | unknown>` (status) or `Position: <for | against | conditional on …>` (ask);
  `Because:` the two or three findings that decide it, each cited;
  `Biggest drag:` (status) or `Would change my mind:` (ask), one line;
  `Keep:` the strongest thing to protect;
  up to 3 recommendations, each: action, why, evidence, rough cost, who decides (PM or user);
  `Not examined:` what you did not look at.
  In round 2 add `Changed: <from> to <to>, because <evidence or argument>` or `Held`.
