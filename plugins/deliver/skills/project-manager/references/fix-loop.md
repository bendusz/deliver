# Fix loop

Load this when a gate fails, the integrity gate included, when a reviewer leaves a `block` or
`major` finding open, or when the verifier returns `FAIL`. Each fix returns to
`implementation-loop.md` state 2, which re-runs the gates and then the review.

## Triage: you are the lead reviewer, not an aggregator
Sort every finding into one of four buckets and show the user all four. The Dismissed list is how
they override you.
- **Act on.** Real correctness, security, or maintainability problems, given the story's actual goal.
  These are the `block` and `major` items that go to the fix round.
- **Consider.** The finding is real, but its fix may not justify the cost now. Show it to the user.
- **Noted.** Valid but not actionable: context-dependent, premature, or low impact.
- **Dismissed.** Wrong, nitpicky, or missing context, each with a one-line reason.

Filtering rules. Verify every finding against the code, even when two lenses report it. A
hypothetical, "what if this is null", counts only if the call path can produce it, so trace it. "I
would have done it differently" is not a finding. A reviewer flagging code the story did not touch,
or a pattern consistent with the rest of the codebase, is missing context. Be slower to dismiss
security and correctness findings than style ones.

Optional lens: for a small diff into shared code, a blast-radius skill finds what the change breaks
beyond the diff and proves, by running code, the one fact it is safe because of. With poteto
installed, ask the user to run `/poteto:blast-radius`, since it is user-invoked. Its confirmed
risks enter triage like any other finding.

## Route the fix
A localized fix with known paths and a reproducer goes to `codex-builder`, even where
`expert-builder` built the story. Write the fix brief to `tmp/codex-builder/<story-id>-round-<n>.md`,
then dispatch `Mode: fix` and that path. Architectural, cross-cutting, or ambiguous findings go to
`expert-builder`, as does any fix Codex calls broader than its brief. Without Codex it takes the fix
too; an unavailable run earns no extra retries and resets neither counter.

**Escalate effort, not just rounds.** Round 1 dispatches `expert-builder` at its frontmatter
effort. From round 2 on, pass `effort: high` on the dispatch: the cheaper attempt has already
failed once. Claude Code older than `v2.1.292` has no per-dispatch effort, so pass none there.

**The fix brief** is runtime-only. It carries the accepted findings or the failing command, the
relevant output, the implicated paths, the exclusions, and the story's verification command. It
lists the `protected` paths as untouchable and never mentions a holdout check. An integrity
failure's brief names each finding to undo.

**A bug fix lands with its regression test.** For a failing gate, or a correctness or security
finding, the brief also names the behaviour to pin and the test file that holds it, inside
`pm-meta.touches`. The builder writes that test first, runs it to see it fail for the stated
reason, then fixes, and reports both results. Before the gates re-run, confirm the test is in the
round's diff; a round without it is not closed. A finding with no behaviour to test, such as a
name, dead code, or a comment, is exempt, and the brief says so.

## Debug before you retry
When a *gate* fails, or a builder repeats a failure with no progress, dispatch the read-only
`debugger` first with the story path, the failing output, the diff, and the implicated paths. Its
plan goes into the Codex brief for a localized fix, or to `expert-builder` for a broad one, never
into a blind retry. A builder applies it.

**Reproduce first.** Give the debugger a command that shows the failure in seconds, narrowed from
the gate where you can: one test file, not the suite. It has no shell, so when it returns
`NEED: <command>`, run that command yourself and dispatch it again with the output. That exchange
spends neither a round nor a retry.

## The round cap
Each round re-runs the gates and regenerates the cumulative diff for re-review by the story's tier
panel plus the lenses its risk triggers add, exactly as `implementation-loop.md` state 3 runs
them, per `review-gates.md`, **up to 3 rounds**.
Increment `rounds` in the story's Execution block and commit it before the round's dispatch; that
**cap** counts earlier sessions' rounds. Still failing, **escalate** to the user.
