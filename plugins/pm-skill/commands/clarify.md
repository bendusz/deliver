---
description: Resolve open [NEEDS CLARIFICATION] questions in docs/spec.md, one at a time and up to five, before planning.
---

Use the `project-manager` skill to resolve ambiguity in `docs/spec.md` before planning.

Focus: $ARGUMENTS

Rules:
- Read `docs/spec.md`. Find the highest-impact unknowns: `[NEEDS CLARIFICATION: ...]` markers first,
  then any vague requirement, acceptance criterion, or success metric.
- Ask **one** question at a time and wait for the answer before the next. Ask **at most 5** this
  session, and spend them on what most changes the build.
- For each question give the question, 2 or 3 realistic options, a recommended option, and one line
  on why it matters.
- After each answer, update `docs/spec.md` immediately: record the decision in the right section, a
  requirement, an acceptance criterion, an assumption, or the Clarifications log, and remove the
  matching `[NEEDS CLARIFICATION]` marker.
- Stop when the markers are resolved, the user is out of answers, or you have asked 5. Do **not**
  start planning, decomposition, or implementation.

End with a short summary of what was resolved and what, if anything, still blocks planning.
