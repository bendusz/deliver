# Review lenses

Which reviewers a story gets. `implementation-loop.md` owns the gates, the verifier, done, and
escalation.

## The reviewer (separate agent)
- A reviewer is read-only and **never** the agent that built the story.
- Findings are graded `block` and `major`, both must fix, and `minor`, a note. Only `block` and
  `major` force a fix round.
- Each review ends with a verdict: `FAIL` for any block or major, `CONCERNS` for minors only,
  otherwise `PASS`.

## The review panel: select lenses by risk
Run only the lenses a story warrants.
- Always `code-integrity-reviewer`, the correctness and security baseline.
- Add `architecture-reviewer` for structural change: new modules, refactors, cross-cutting changes,
  new abstractions or interfaces. Skip it for trivial, localized changes.
- Add `security-auditor`, a deeper security lens, for auth or authz, crypto, secrets, untrusted
  input, file, network, or process I/O, deserialization, or dependency changes. Skip it when
  nothing is security-relevant.
- A performance lens can join when such an agent exists.

Start from the story's declared `Risk` and `Review lenses`, see `decomposition.md`. **Add** an
undeclared lens when the diff calls for it, and note the gap. `technical-writer` and `debugger` are
delivery agents, never lenses. `fix-loop.md` owns triage.
