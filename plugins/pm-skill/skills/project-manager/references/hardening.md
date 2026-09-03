# Hardening (optional)

pm-skill is safe by default through behavioural rules and each agent's tool surface. This reference
adds an optional, Claude Code-native layer for teams that want mechanical enforcement. It is entirely
opt-in and lives in the project's own config, not in the plugin, and needs no external process. The
optional allowlist example does need `jq`.

## What is already enforced
- **Sign-off.** The bundled `PreToolUse` hook `hooks/require-signoff.mjs` matches `Write`, `Edit`,
  and `MultiEdit` only. It blocks a write when `pm/pm-state.json`, or the legacy
  `tmp/pm-state.json`, has `signed_off: false`. It exempts everything under `docs/`, `pm/`, `tmp/`,
  `.git/`, and `.claude/rules/`, plus the root files `CLAUDE.md`, `AGENTS.md`, `.gitignore`, and
  `.gitattributes`. It fails open on any uncertainty: a missing or unparseable state file, a target
  outside the project tree, or the kill switch `PM_SKILL_NO_ENFORCE=1`. Writes made through `Bash`
  are not covered.
- **No secrets in `pm/`.** The bundled `PreToolUse` hook `hooks/pm-secrets-guard.mjs` blocks writes
  into the git-tracked `pm/` directory whose content matches high-confidence secret shapes: AWS,
  GitHub, Slack, and API tokens, PEM private keys, JWTs, and quoted credential assignments. It is a
  tripwire for accidents, not a scanner, so prose about secrets never trips it. Same fail-open design
  and kill switch.
- **Actor isolation.** The bundled `PreToolUse` hook `hooks/actor-guard.mjs` blocks a write to
  another actor's `pm/actors/<id>.json` or `<id>.HANDOFF.md`. Same fail-open design and kill switch.
- **Session re-grounding.** The bundled `SessionStart` hook `hooks/session-context.mjs` reads `pm/`
  and injects a short position pointer into new and freshly-compacted sessions. It only reads.
- **Read-only review and verify agents.** `code-integrity-reviewer`, `architecture-reviewer`,
  `security-auditor`, `debugger`, and `codebase-analyst` carry only `Read`, `Grep`, and `Glob`, so
  the tool surface itself blocks writes. `pm-verifier` also has `Bash`, because it must run the
  gates; see below.

## The Bash gap
A subagent's `tools:` list is all-or-nothing for `Bash`: granting it allows any shell command, so
`pm-verifier`'s read-only Bash is a behavioural rule, not a sandbox. Plugin-provided subagents also
ignore `hooks` and `permissionMode` frontmatter, so the plugin cannot ship the policy itself.

A project-level hook can make it mechanical, scoped to the verifier. A `PreToolUse` hook's input
carries `agent_type`, which for a custom subagent is its frontmatter `name`, here `pm-verifier`, and
`agent_id` whenever the call comes from a subagent. The matcher only matches by tool, `Bash`, but the
hook script can branch on `agent_type` and restrict only the verifier, leaving the PM's own git
operations untouched.

## Optional: a verifier-scoped read-only allowlist
1. Merge `${CLAUDE_PLUGIN_ROOT}/templates/claude-settings-hardening.json.template` into the project's
   `.claude/settings.json`.
2. Add the script it points to, `.claude/hooks/pm-bash-allowlist.sh`. It is default-deny for
   `pm-verifier` and imposes no restriction on anything else.

   ```bash
   #!/usr/bin/env bash
   # Read-only Bash for the pm-verifier subagent only; other agents are unaffected. Requires jq.
   command -v jq >/dev/null 2>&1 || { echo "pm-skill hardening: jq is required" >&2; exit 2; }
   input="$(cat)"
   [ "$(printf '%s' "$input" | jq -r '.agent_type // empty')" = "pm-verifier" ] || exit 0
   cmd="$(printf '%s' "$input" | jq -r '.tool_input.command // empty')"
   # Block chaining / redirection / substitution / output-writing options outright.
   case "$cmd" in
     *';'*|*'&'*|*'|'*|*'>'*|*'<'*|*'`'*|*'$('*|*$'\n'*|*' --output'*)
       echo "pm-skill hardening: chained/redirected/output-writing commands are not allowed" >&2; exit 2 ;;
   esac
   case "$cmd" in
     "git status"*|"git diff"*|"git log"*|"git show"*|"ls "*|"cat "*|"grep "*|"rg "*|"head "*|"tail "*|"wc "*) exit 0 ;;
     # the project's gates: EDIT to match docs/plan.md and AGENTS.md
     "npm test"*|"npm run lint"*|"npm run build"*|"pytest"*|"ruff check"*|"make test"*) exit 0 ;;
   esac
   echo "pm-skill hardening: pm-verifier may run only read-only inspection and the project gates" >&2
   exit 2
   ```

   It is default-deny for the verifier. List your real gate commands above; anything else, including
   shell chaining, redirection, substitution, and output-writing options, is blocked with `exit 2`,
   which takes precedence over allow rules. It requires `jq` and fails closed without it. Other
   agents, the PM and the builder, fall through to `exit 0`, so commits and merges still work.
   Allowlisting a shell is inherently imperfect, because `git`, `find`, and the gate commands all
   have mutating forms, so treat this as a reviewed starting point rather than a guaranteed sandbox.
   Keep the allowed set minimal and tighten it for your stack.

## Notes
- `agent_type` is present only for subagent calls; main-thread calls fall through to `exit 0`.
- This is plain Claude Code configuration with no external process. The bundled hooks are Node ESM
  and need no `jq` at all; only the allowlist example above requires it, and that example fails
  closed without it. Keep the policy in version control so it is visible and reviewable.
