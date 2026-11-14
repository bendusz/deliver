# bstack

The words this repository uses with one meaning, for anyone changing the plugin or reading a
project it manages.

## Language

**Legacy**:
Text that nothing reads to decide what happens next: no script, no step in a skill, and no
decision a person still has to make. Wanting to look back does not make text current; git serves
that.
_Avoid_: old, outdated, historical, superseded

**Current file**:
A file that says only what is true now. Every tracked file is one unless it is a chronological
file.
_Avoid_: living document, source of truth

**Chronological file**:
A file that grows by dated entries and is never the source for what is current.
_Avoid_: history, journal, record

**PM record**:
A file the PM writes to run a project, as opposed to a story's code.
_Avoid_: state file

**State**:
Where a project stands, as git and each story's execution line say it. A PM record can be wrong
about state; git cannot.
_Avoid_: status, progress

**Plan**:
What a project builds and how it behaves. Until the project ships it is the agreed target;
after that, what shipped. What is built so far is state, which the plan does not hold.
_Avoid_: source of truth, design doc

**Design**:
The part of the plan that fixes behaviour: decisions with the option each rejected, contracts,
invariants and flows.
_Avoid_: architecture

**Sprint boundary**:
Everything between a sprint's last merge and the next sprint's first story: the journey gate, the
cross-story review, the retro, the record and the demo.
_Avoid_: sprint close, sprint end

**Retro**:
The part of the sprint boundary that asks what the sprint taught: its three questions and the
proposed `AGENTS.md` diff.
_Avoid_: retro for the whole sprint boundary
