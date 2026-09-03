# Scale Profiles (optional)

Right-size the workflow to the work. The full lifecycle (spec → clarify → plan → analyze → decompose →
verify → ship) is right for serious projects but heavy for a one-file fix. Pick a **scale** up front,
record it in `docs/plan.md` (Delivery mode) and `pm/pm-state.json` (`scale`). Default is `standard`.

| Scale | Use for | Artifacts & gates |
| --- | --- | --- |
| **tiny** | a one-off fix or tiny script | Minimal `docs/plan.md` + one story file; sign-off still recorded; gates if any; a **separate** reviewer + an **inline** verifier pass (PASS still required); skip spec / analyze / checklists / verification reports. |
| **small** | a small feature | light `docs/spec.md` + `docs/plan.md` + stories; gates + review; verifier PASS. |
| **standard** *(default)* | most projects | spec + plan + **`/pm-skill:analyze`** + stories + risk-selected review panel + verifier PASS. |
| **large** | multi-sprint / multi-author | + `docs/constitution.md`, quality **checklists**, durable **verification reports**, traceability table. |
| **regulated** | compliance / high-assurance | **all of the above mandatory** + security review required + full requirement→story→verification traceability; nothing waived. |

## Rules
- Scaling **down** removes *artifacts and ceremony*, never the **hard rules** — sign-off before
  implementation, separate reviewer, deterministic gates, repository safety, and verifier PASS before
  ship. Even `tiny` keeps those — it just uses a minimal `docs/plan.md` + one story and skips the
  heavier artifacts (spec, analyze, checklists, verification reports).
- Scaling **up** makes optional things mandatory; it never loosens anything.
- When unsure, pick the **higher** scale. You can raise scale mid-project (add the artifacts then);
  lowering mid-project needs the user's agreement.

## Recording it
- `docs/plan.md` → **Delivery mode**: scale, checkpoint policy, autonomy.
- `docs/plan.md` → **Delivery mode** also carries `Instruction rules: none | pm-state`. Default
  `none`; offer `pm-state` at `standard` scale and above (see `references/instruction-layers.md`).
- `pm/pm-state.json` → `"scale": "standard"`.
