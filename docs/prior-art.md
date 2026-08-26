# Prior Art & References

The design of pm-skill was validated against the work below. See the design spec
(`docs/specs/2026-06-02-project-manager-skill-design.md`) for how each influenced decisions.

## Foundations (Anthropic)
- **Building Effective Agents** — the orchestrator-workers and evaluator-optimizer patterns the
  per-story build/review/fix loop is built on.
  https://www.anthropic.com/engineering/building-effective-agents
- **Multi-Agent Research System** — a lead agent that orchestrates and delegates to subagents which
  compress context; basis for "PM never codes" and "protect context".
  https://www.anthropic.com/engineering/multi-agent-research-system
- **Claude Code documentation** — skills, plugins, subagents, plugin marketplaces, and project
  memory (`CLAUDE.md`). https://code.claude.com/docs

## Systems studied
- **ccpm** (automazeio) — PRD → epic → story pipeline; markdown as source of truth; "conductor
  never codes". https://github.com/automazeio/ccpm
- **BMAD-Method** — self-contained story files and PASS/CONCERNS/FAIL readiness gates.
  https://github.com/bmad-code-org/BMAD-METHOD
- **GitHub Spec Kit** — a clarify-before-plan gate (`[NEEDS CLARIFICATION]`) and `[P]` parallel
  markers. https://github.com/github/spec-kit
- **Roo Code (Boomerang / Orchestrator)** — pass context down, return only a summary up.
  https://docs.roocode.com/features/boomerang-tasks
- **Task Master AI** — dependency-aware next-task selection. https://github.com/eyaltoledano/claude-task-master
- **superpowers** (obra) — mandatory human sign-off gates and a two-stage review loop.
  https://github.com/obra/superpowers
- **pstack** (Lauren Tan / poteto, Cursor) — engineering principles as named skills, multi-model
  adversarial review with lead-reviewer triage, design-before-code (`architect` / `arena`), and
  app-driving verification skills. Bundled as the optional `poteto` companion plugin (MIT).
  https://github.com/cursor/plugins/tree/main/pstack
- **deanpeters/Product-Manager-Skills** — PM discovery interview flows and INVEST stories.
  https://github.com/deanpeters/Product-Manager-Skills

## Independent review
- The design spec was hardened by an independent **Codex (gpt-5.5)** audit, which corrected
  skill-loading semantics, namespaced invocation, repository-safety rules, `gh` gating,
  project-specific gate discovery, per-agent handoff contracts, and exact loop caps.
