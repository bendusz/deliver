---
description: Read-only consistency and quality analysis across the PM artifacts (spec, plan, stories, constitution, state). Never edits.
---

Use the `project-manager` skill to run a read-only cross-artifact analysis. Load
`references/artifact-consistency.md` and follow it: its inputs, detections, severities, and report
format are the whole contract.

Scope: $ARGUMENTS  (optional, narrows to a sprint, story, or requirement; default is everything)

End by stating the headline status, for example "2 CRITICAL, 3 HIGH", and recommending whether it is
safe to proceed.
