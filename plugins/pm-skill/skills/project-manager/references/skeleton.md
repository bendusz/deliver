# Skeleton (SpecDD)

The optional phase between sign-off and decomposition. It writes the sprint's `.sdd` contracts,
the shape of the code, before any code exists. `spec-architect` is the only writer.

## When it runs
Only when `docs/plan.md` Delivery mode says `Skeleton: specdd`. Once per sprint, after sign-off and
after the scaffold, before that sprint's decomposition. Sprint 1 also gets the root spec and
`.specdd/bootstrap.md`; later sprints extend the tree.

## Bootstrap and the CLI probe
Probe once per project with `npx --yes specdd@1 --version`. It needs network access, so skip it
offline and treat that as a failure. When it succeeds, run `npx --yes specdd@1 init` at the
repository root for the bootstrap and `npx --yes specdd@1 inspect` for the checkpoint. Otherwise
pass `Bootstrap: template` in the dispatch and list the tree yourself with
`find . -name '*.sdd' -o -path './.specdd/*'`.

## Dispatch
Give `spec-architect`:
- `Sprint`, the number.
- `Plan sections`, the plan's Architecture and Scope plus the Stories rows for that sprint.
- `Spec IDs`, the requirement and criterion IDs the sprint covers.
- `Bootstrap`, the path of `.specdd/bootstrap.md` or the word `template`.
- Optional: `Analyst pack` on brownfield work, `Design sketch`, `Wiki index`.

## Checkpoint, commit, log
Show the user the tree and, when the CLI ran, the `inspect` output. This is a checkpoint, not a
gate. Sign-off already happened, so report it and load `decomposition.md`. Commit the skeleton as
you commit the scaffold, and append one entry to `pm/log.md`, for example
`- 2026-09-04 14:10 pm-a1b2: skeleton written for sprint 2. 6 module specs, 1 superseded.`

## What the rest of the pipeline does with it
- A builder may edit a `.sdd` inside its own touches when the implementation forces it and must
  report the path in its return; a reviewer treats an unreported `.sdd` change as `major`.
- Stories carry a `Specs:` field, take their touches from each spec's `Owns`, and cite the
  `Done when` lines their criteria satisfy; `decomposition.md` owns that detail.
- The scaffold appends one line to the project `AGENTS.md` under Conventions: read
  `.specdd/bootstrap.md` before working on this project and treat specs as source-adjacent
  contracts.
