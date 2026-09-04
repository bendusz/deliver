# Scale profiles (optional)

Right-size the workflow to the work. The full lifecycle, spec through clarify, plan, analyze,
decompose, verify, and ship, is right for serious projects and heavy for a one-file fix. Pick a scale
up front and record it in `docs/plan.md` under Delivery mode and in `pm/pm-state.json` as `scale`.
The default is `standard`. This file is authoritative for which phases a scale skips.

`standard` is the baseline; the other rows carry only what differs from it.

| Scale | Use for | Difference from `standard` |
| --- | --- | --- |
| `standard` (default) | most projects | The baseline: `docs/spec.md`, `docs/plan.md`, `/deliver:analyze`, story files, a risk-selected review panel, and the project wiki maintained by `librarian`. |
| `tiny` | a one-off fix or tiny script | A minimal `docs/plan.md` and one story file. No spec, `/deliver:analyze`, checklists, verification reports, or wiki. One reviewer rather than a panel. |
| `small` | a small feature | A light spec, plan, and stories. No `/deliver:analyze` and no wiki. |
| `large` | multi-sprint or multi-author | Adds `docs/constitution.md`, quality checklists, durable verification reports, a traceability table, and `Skeleton: specdd`. |
| `regulated` | compliance and high-assurance | Everything `large` has, all mandatory, plus a required security review, full requirement to story to verification traceability, and a clean wiki lint before the completion report. Nothing is waived. |

## Rules
- Every scale keeps the rules the skill and workflow already enforce: sign-off before
  implementation, a separate reviewer, whichever of test, lint, and build the project has,
  repository safety, and a `pm-verifier` PASS before ship. Even `tiny` keeps those, with an inline
  verifier pass instead of a durable report.
- Scaling **down** removes artifacts and ceremony, never those rules. Scaling **up** makes optional
  things mandatory and never loosens anything.
- The skeleton phase is off unless `docs/plan.md` says `Skeleton: specdd`, which `large` and
  `regulated` set.
- When unsure, pick the higher scale. You can raise the scale mid-project, adding the artifacts then;
  lowering it mid-project needs the user's agreement.

## Recording it
- `docs/plan.md`, Delivery mode: scale and checkpoint policy.
- `docs/plan.md`, Delivery mode also carries `Instruction rules: none | pm-state`. The default is
  `none`; offer `pm-state` at `standard` scale and above, per `instruction-layers.md`.
- `pm/pm-state.json`: `"scale": "standard"`.
