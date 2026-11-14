# Skeleton (SpecDD, optional)

Off by default. It runs only when `docs/plan.md` says `Skeleton: specdd`: once per sprint, after
sign-off and the scaffold, before that sprint's decomposition (`planning.md` step 6). It writes
the sprint's `.sdd` contracts, the shape of the code, before any code exists. Sprint 1 also gets
the root spec and `.specdd/bootstrap.md`; later sprints extend the tree. `/bstack:skeleton` runs
it on demand.

## Bootstrap
Probe once per project with `npx --yes specdd@1.1.1 --version`. It needs the network, so offline
counts as a failure. On success, run `npx --yes specdd@1.1.1 init` at the repository root on
sprint 1, and `npx --yes specdd@1.1.1 inspect` at the checkpoint. On failure, the brief says
`Bootstrap: template` and the child writes the bootstrap from the template.

## Dispatch
Dispatch the `roles.md` `## spec-architect` soul per `host.md` `## Dispatch`, with
`isolation: "shared"` in the main checkout: the soul does not commit, so its files must land
where you commit them. `clientRequestId` is `S<sprint>-spec-architect-<round>`. The brief gives:
- `Sprint`: the number.
- `Plan sections`: Design, Scope, and the Stories rows for that sprint.
- `Spec IDs`: the `FR-` and `AC-` IDs the sprint covers.
- `Bootstrap`: the path of `.specdd/bootstrap.md`, or `template`.
- `Templates`: the absolute paths of `<plugin>/templates/sdd-root.template`,
  `sdd-module.template` and `specdd-bootstrap.md.template`, with `<plugin>` written out: the
  child cannot resolve it.
- Optional: the brownfield Explore summary and the design sketch from planning.

## Checkpoint and commit
- See what changed: `git status --porcelain --untracked-files=all`. Commit the `.sdd` files and
  `.specdd/` bootstrap files; ask the user about anything else that changed.
- Show the user the tree and, when the CLI ran, the `inspect` output. This is a checkpoint, not a
  gate: sign-off already happened. A decision the child could not encode goes back to the user;
  a material one follows `planning.md` "Change after sign-off".
- You commit the skeleton on the integration branch, with `docs/log.md` staged and a message
  naming the sprint and the spec count, such as
  `chore(skeleton): sprint 2, 6 module specs, 1 superseded`. Then decompose.

## What the rest of the flow does with it
- A story's Context names the `.sdd` files it implements instead of restating interfaces. Its
  `touches` are the paths those specs `Own`, and each criterion cites the `Done when` line it
  satisfies.
- A builder may edit a `.sdd` inside its `touches` when the implementation forces it, and names
  the path in `notes`. Tell the reviewer that a `.sdd` change the story does not name is `major`.
- The reviewer treats a `Must`, `Must not` or `Exposes` breach as `major`; the verifier fails a
  missed `Done when` line a covered criterion cites (`roles.md`).
- The scaffold's SpecDD line in `AGENTS.md` tells every child to read `.specdd/bootstrap.md` first.
