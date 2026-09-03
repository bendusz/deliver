# Scale profiles (optional)

Right-size the workflow to the work. The full lifecycle, spec through clarify, plan, analyze,
decompose, verify, and ship, is right for serious projects and heavy for a one-file fix. Pick a scale
up front and record it in `docs/plan.md` under Delivery mode and in `pm/pm-state.json` as `scale`.
The default is `standard`.

| Scale | Use for | Artifacts and gates |
| --- | --- | --- |
| `tiny` | a one-off fix or tiny script | Minimal `docs/plan.md` plus one story file; sign-off still recorded; gates if any; a separate reviewer and an inline verifier pass, with PASS still required; skip spec, analyze, checklists, and verification reports. |
| `small` | a small feature | Light `docs/spec.md`, `docs/plan.md`, and stories; gates and review; verifier PASS. |
| `standard` (default) | most projects | Spec, plan, `/pm-skill:analyze`, stories, a risk-selected review panel, verifier PASS. |
| `large` | multi-sprint or multi-author | The above plus `docs/constitution.md`, quality checklists, durable verification reports, and a traceability table. |
| `regulated` | compliance and high-assurance | All of the above mandatory, plus a required security review and full requirement to story to verification traceability. Nothing is waived. |

## Rules
- Scaling **down** removes artifacts and ceremony, never the hard rules: sign-off before
  implementation, a separate reviewer, deterministic gates, repository safety, and verifier PASS
  before ship. Even `tiny` keeps those.
- Scaling **up** makes optional things mandatory. It never loosens anything.
- When unsure, pick the higher scale. You can raise the scale mid-project, adding the artifacts then;
  lowering it mid-project needs the user's agreement.

## Recording it
- `docs/plan.md`, Delivery mode: scale, checkpoint policy, autonomy.
- `docs/plan.md`, Delivery mode also carries `Instruction rules: none | pm-state`. The default is
  `none`; offer `pm-state` at `standard` scale and above, per `references/instruction-layers.md`.
- `pm/pm-state.json`: `"scale": "standard"`.
