# Hardening (optional)

The deliver plugin uses behavioural rules, fail-open accident guards, and each agent's allowed
tools. These controls are not a security boundary, and on Windows `codex-builder` runs with full
host access and network. This reference adds an optional, Claude Code-native layer for teams that
want mechanical enforcement. It is opt-in and lives in the project's own config, not in the plugin,
and needs no external process. The optional allowlist example does need `jq`.

## What is already enforced
Three bundled `PreToolUse` hooks guard writes. Each matches `Write`, `Edit`, and `MultiEdit` only,
fails open on any uncertainty (a missing or unparseable state file, a target outside the project
tree, or the kill switch `DELIVER_NO_ENFORCE=1`), and never sees a write made through `Bash`.
The pre-0.21 name `PM_SKILL_NO_ENFORCE` stopped working in 0.22.

- **Sign-off.** `require-signoff.mjs` blocks a write while `pm/pm-state.json`, or the legacy
  `tmp/pm-state.json`, has `signed_off: false`. `logging-and-state.md` lists the exempt planning,
  state, and spec paths.
- **No secrets in tracked state.** `pm-secrets-guard.mjs` blocks a write into `pm/` or `docs/wiki/`
  whose content matches a high-confidence secret shape. It is a tripwire for accidents, not a
  scanner, so prose about secrets never trips it.
- **Actor isolation.** `actor-guard.mjs` blocks a write to another actor's `pm/actors/<id>.json` or
  `<id>.HANDOFF.md`.

**Session context.** `session-context.mjs` reads `pm/` and adds the current position to new and
compacted sessions. It is a `SessionStart` hook and only reads.

**Read-only review and verify agents.** `code-integrity-reviewer`, `architecture-reviewer`,
`security-auditor`, `debugger`, and `codebase-analyst` carry only `Read`, `Grep`, and `Glob`, so the
allowed-tool list blocks writes. `pm-verifier` also has `Bash`, because it runs the gates; see below.

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
   command -v jq >/dev/null 2>&1 || { echo "deliver: hardening guard, jq is required" >&2; exit 2; }
   input="$(cat)"
   [ "$(printf '%s' "$input" | jq -r '.agent_type // empty')" = "pm-verifier" ] || exit 0
   cmd="$(printf '%s' "$input" | jq -r '.tool_input.command // empty')"
   # Block chaining / redirection / substitution / output-writing options outright.
   case "$cmd" in
     *';'*|*'&'*|*'|'*|*'>'*|*'<'*|*'`'*|*'$('*|*$'\n'*|*' --output'*)
       echo "deliver: hardening guard, chained/redirected/output-writing commands are not allowed" >&2; exit 2 ;;
   esac
   case "$cmd" in
     "git status"*|"git diff"*|"git log"*|"git show"*|"ls "*|"cat "*|"grep "*|"rg "*|"head "*|"tail "*|"wc "*) exit 0 ;;
     # the project's gates and the stories' verification commands: EDIT to match docs/plan.md and AGENTS.md
     "npm test"*|"npm run lint"*|"npm run build"*|"pytest"*|"ruff check"*|"make test"*) exit 0 ;;
     "node scripts/check.mjs"*) exit 0 ;;
   esac
   echo "deliver: hardening guard, pm-verifier may run only read-only inspection and the project gates" >&2
   exit 2
   ```

   It is default-deny for the verifier. List your real gate commands and the non-mutating
   verification commands your stories use above, so the verifier can run the command a PASS needs.
   Anything it rejects, the verifier reports from the PM's captured evidence, or as UNKNOWN when
   that evidence is insufficient. Anything else, including
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
