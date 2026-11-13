# Why one reviewer by default

Moved from `references/loop.md` in 1.2.0. The PM does not need it to run a story, and every story
paid for it.

bstack's design keeps one calibration result (`docs/specs/2026-11-07-v1.0-bstack-redesign.md` §9),
measured on 2026-10-25 against a review corpus since removed: at both the 10% and the 5% miss
targets, the best measured choice was a single Codex generalist lens, with a 4.44% upper bound on
the miss rate and 0 false positives. The Claude specialist lenses (security, performance,
architecture) added no measured coverage over it. Hence the default: one opposite-family
generalist reviewer, plus an optional `focus:` reviewer. That lens was Codex's built-in
`codex exec review` prompt. A T3 child running the reviewer soul is a different, uncalibrated
reviewer: weigh its verdict as one reviewer's, which the gates and the verifier back up.
