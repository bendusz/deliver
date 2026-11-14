# Why one reviewer by default

One calibration result stands behind the default. Measured on 2026-10-25 against a review corpus
that is now only in git, at both the 10% and the 5% miss targets the best choice was a single
Codex generalist lens, with a 4.44% upper bound on the miss rate and 0 false positives. The Claude
specialist lenses (security, performance, architecture) added no measured coverage over it. Hence
one opposite-family generalist reviewer, plus an optional `focus:` reviewer.

That lens was Codex's built-in `codex exec review` prompt. A T3 child running the reviewer soul is
a different, uncalibrated reviewer: weigh its verdict as one reviewer's, which the gates and the
verifier back up.
