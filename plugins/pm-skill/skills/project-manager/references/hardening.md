# Hardening (optional)

pm-skill is safe by default through **behavioural rules** and each agent's **tool surface**. This
reference adds an optional, Claude Code-native layer for teams that want **mechanical** enforcement. It
is entirely opt-in and lives in the *project's* own config, not in the plugin — no external process
(the optional allowlist example needs `jq`).

## What's already enforced
- **Sign-off:** the bundled `PreToolUse` hook (`hooks/require-signoff.mjs`) blocks implementation writes
  until `pm/pm-state.json` has `signed_off: true`. Fail-open; kill switch `PM_SKILL_NO_ENFORCE=1`.
- **No secrets in `pm/`:** the bundled `PreToolUse` hook (`hooks/pm-secrets-guard.mjs`) blocks writes
  into the git-tracked `pm/` directory whose content matches high-confidence secret shapes (AWS/GitHub/
  Slack/API tokens, PEM private keys, JWTs, quoted credential assignments). A tripwire for accidents,
  not a scanner — prose about secrets never trips it. Same fail-open design and kill switch.
- **Read-only review/verify agents:** `code-integrity-reviewer`, `architecture-reviewer`,
  `security-auditor`, `debugger`, and `codebase-analyst` are granted only `Read`/`Grep`/`Glob`, so the
  tool surface itself blocks writes. `pm-verifier` also has `Bash` (it must run the gates) — see below.

## The Bash gap
A subagent's `tools:` list is all-or-nothing for `Bash`: granting it allows any shell command, so
`pm-verifier`'s "read-only Bash" is a **behavioural rule, not a sandbox**. Plugin-provided subagents
also **ignore** `hooks` / `permissionMode` frontmatter, so the plugin can't ship the policy itself.

A project-level hook **can** make it mechanical, and **scoped to the verifier**: a `PreToolUse` hook's
input carries `agent_type` (for a custom subagent, its frontmatter `name` — here `pm-verifier`) and
`agent_id` whenever the call comes from a subagent. The *matcher* only matches by tool (`Bash`), but
the hook *script* can branch on `agent_type` and restrict **only** the verifier — leaving the PM's own
git operations untouched.

## Optional: a verifier-scoped read-only allowlist
1. Merge `${CLAUDE_PLUGIN_ROOT}/templates/claude-settings-hardening.json.template` into the project's
   `.claude/settings.json`.
2. Add the script it points to, `.claude/hooks/pm-bash-allowlist.sh` — **default-deny for
   `pm-verifier`**, no restriction for anything else:

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
     # the project's gates — EDIT to match docs/plan.md / CLAUDE.md:
     "npm test"*|"npm run lint"*|"npm run build"*|"pytest"*|"ruff check"*|"make test"*) exit 0 ;;
   esac
   echo "pm-skill hardening: pm-verifier may run only read-only inspection and the project gates" >&2
   exit 2
   ```

   It is **default-deny** for the verifier: list your real gate commands above; anything else — including
   shell chaining/redirection/substitution and output-writing options — is blocked (`exit 2`, which
   takes precedence over allow rules). It **requires `jq`** and fails closed without it. Other agents
   (the PM, the builder) fall through to `exit 0`, so commits/merges still work. **Allowlisting a shell
   is inherently imperfect** — `git`, `find`, and the gate commands all have mutating forms — so treat
   this as a *reviewed starting point, not a guaranteed sandbox*: keep the allowed set minimal and
   tighten it for your stack.

## Notes
- `agent_type` is present only for subagent calls; main-thread calls fall through to `exit 0`.
- Plain Claude Code configuration — no external process. The allowlist example **requires `jq`** and
  fails closed without it (the bundled sign-off hook, by contrast, uses `jq` only opportunistically and
  fail-opens). Keep the policy in version control so it's visible and reviewable.
