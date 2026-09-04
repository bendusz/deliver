# Fix loop

Load this when a gate fails, or when a reviewer leaves a `block` or `major` finding open. Each fix
returns to `implementation-loop.md` state 2, which re-runs the gates and then the review.

## Triage: you are the lead reviewer, not an aggregator
Sort every finding into one of four buckets and show the user all four. The Dismissed list is how
they override you.
- **Act on.** Real correctness, security, or maintainability problems, given the story's actual goal.
  These are the `block` and `major` items that go to the fix round. More than about 5 means you are
  not filtering hard enough.
- **Consider.** The finding is real, but its fix may not justify the cost now. Show it to the user.
- **Noted.** Valid but not actionable: context-dependent, premature, or low impact.
- **Dismissed.** Wrong, nitpicky, or missing context, each with a one-line reason.

Filtering rules. Verify every finding against the code, even when two lenses report it. A
hypothetical, "what if this is null", counts only if the call path can produce it, so trace it. "I
would have done it differently" is not a finding. A reviewer flagging code the story did not touch,
or a pattern consistent with the rest of the codebase, is missing context. Be slower to dismiss
security and correctness findings than style ones.

Optional lens: for a small diff into shared code, a blast-radius skill such as `poteto:blast-radius`
finds what the change breaks beyond the diff and proves, by running code, the one fact it is safe
because of. Its confirmed risks enter triage like any other finding.

## Route the fix
A localized fix with known paths and a reproducer goes to `codex-builder`, even where
`expert-builder` built the story. Write the fix brief to `tmp/codex-builder/<story-id>-round-<n>.md`,
then dispatch `Mode: fix` and that path. Architectural, cross-cutting, or ambiguous findings go to
`expert-builder`, as does any fix Codex calls broader than its brief. Without Codex it takes the fix
too; an unavailable run earns no extra retries and resets neither counter.

**The fix brief** is runtime-only. It carries the accepted findings or the failing command, the
relevant output, the implicated paths, the exclusions, and the story's verification command.

## Debug before you retry
When a *gate* fails, or a builder repeats a failure with no progress, dispatch the read-only
`debugger` first with the story path, the failing output, the diff, and the implicated paths. Its
plan goes into the Codex brief for a localized fix, or to `expert-builder` for a broad one, never
into a blind retry. A builder applies it.

## The round cap
Each round re-runs the gates and regenerates the cumulative diff for re-review, **up to 3 rounds**.
Increment `current_story_rounds` as each starts; that **cap** counts earlier sessions' rounds. Still
failing, **escalate** to the user.
