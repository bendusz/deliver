# Design exploration (optional)

Load this when a plan's Architecture section or a story naming `architecture-reviewer` has more than
one viable shape, and a design-exploration skill is installed, `poteto:architect` for example, which
sketches types, signatures, and module boundaries across competing candidates before any code.

Design only. Invoke it with a checkpoint (`/poteto:architect with checkpoint`) and stop at the
synthesized sketch. Its implementation phases never run before sign-off, per hard rule 3, and the PM
never runs them at all, because code is the story builder's job.

- **Planning.** Run it for the plan's Architecture section on greenfield work. Fold the sketch and
  its rationale into Architecture and list the rejected alternatives under Risks.
- **Decomposition.** Run it before marking such a story build-ready, and put the type and module
  sketch into the story's Context so the builder implements against a settled shape.
