# Hardening (optional)

The deliver plugin uses behavioural rules, fail-open accident guards, and each agent's allowed
tools. These controls are not a security boundary, and `codex-builder` runs with full host access and
network on every platform. This reference adds an optional, Claude Code-native layer for teams that
want mechanical enforcement. It is opt-in and lives in the project's own config, not in the plugin,
and needs no external process. The optional allowlist example does need `jq`.

## What is already enforced
Two bundled `PreToolUse` hooks guard writes. Each matches `Write`, `Edit`, and `MultiEdit` only,
fails open on any uncertainty (a missing or unparseable state file, a target outside the project
tree, or the kill switch `DELIVER_NO_ENFORCE=1`), and never sees a write made through `Bash`.

- **Approval.** `require-signoff.mjs` blocks a write while `docs/approval.json` has any status but
  `approved`, and honours a pre-0.24 `pm/pm-state.json` or `tmp/pm-state.json` `signed_off`
  field until the migration runs. `state.md` lists the exempt planning, state, and spec paths.
- **No secrets in tracked docs.** `pm-secrets-guard.mjs` blocks a write under `docs/`, or the
  legacy `pm/`, whose content matches a high-confidence secret shape. It is a tripwire for
  accidents, not a scanner, so prose about secrets never trips it.

**Ship gate.** A third `PreToolUse` hook, `require-verified.mjs`, matches `Bash`. It blocks a
`git merge` of a `pm/*` branch unless that branch's story records `verifier: PASS <sha>` for the
code at the branch head and, at `T1` and `T2`, `integrity: pass <sha>`. It reads the claim from the
integration branch, never from the working tree. It fails open on unreadable hook input, with the
kill switch set, or outside a deliver project; the hook header lists the remaining known limits.
Once a story merge is certain, whatever it cannot establish blocks. The merge's own directory,
after `cd` or `git -C`, identifies the project. Run from a directory that is in no deliver project
(for example a monorepo root), a story-like merge blocks with "run the merge from the project
directory, or with git -C <project>", unless the checked-out target is a non-base branch that no project integrates on. `implementation-loop.md` state 6
describes it.

Behind it sits a git-level gate. In a deliver project, `session-context.mjs` installs
`hooks/git-hook-install.mjs`'s shims, marked `# deliver-merge-gate v1`, as `pre-merge-commit` and
`pre-commit` in `git rev-parse --git-path hooks` (honouring `core.hooksPath`), and sets
`branch.<integration>.mergeoptions --no-ff`, so every merge into the integration branch creates a
commit. Git then runs `hooks/git-merge-gate.mjs`, which judges the merge actually happening, the
current branch and the heads being merged, with the Bash hook's own rules, and refuses the merge
commit on a deny. It never overwrites a hook without the marker; it reports it. `/deliver:doctor`
checks and repairs the install.

Both catch a PM's honest mistakes, such as a forgotten or stale verdict, a careless command chain,
or a mis-stated tier. The git-level gate judges every `git merge` that creates a commit, whatever
the shell form. Out of its reach are `--no-verify` (the Bash hook blocks it on a story merge), a
merge that creates no merge commit (`--ff-only` or `--squash`, which the Bash hook still judges),
`update-ref` and `push`, and deleting the hook. Neither is a boundary against a deliberately evasive agent with Bash; that protection is the 0.30 sandbox.

**Session context.** `session-context.mjs` reads the marker, the story files, and git, and adds
the current position to new and compacted sessions. It is a `SessionStart` hook and only reads.

**Read-only review and verify agents.** `code-integrity-reviewer`, `architecture-reviewer`,
`security-auditor`, `performance-reviewer`, `debugger`, and `codebase-analyst` carry only `Read`, `Grep`, and `Glob`, so the
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
