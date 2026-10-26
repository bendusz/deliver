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
after `cd` or `git -C`, identifies the project for a story one project claims; a story several
projects claim must be verified in each, and both gates refuse it otherwise ("two projects claim
this story; verify it in each or rename the branch"). Run from a directory that is in no deliver project
(for example a monorepo root), a story-like merge blocks with "run the merge from the project
directory, or with git -C <project>", unless the checked-out target is a non-base branch that no project integrates on. `implementation-loop.md` state 6
describes it.

Behind it sits the authoritative git-level gate. At session start in a deliver project,
`session-context.mjs` runs `hooks/git-hook-install.mjs`, which writes a POSIX sh
`reference-transaction` hook, marked `# deliver-merge-gate v2` on line 2, into
`git rev-parse --git-path hooks`. Git (2.28 or newer) runs it for every ref update. It exits at
once unless the update moves an integration branch; then `hooks/git-merge-gate.mjs` judges what
the update brings in: every `pm/*` story tip it introduces, with the Bash hook's own verdict, and
every merge built on top of a story, which must be git's automatic merge apart from the story
file. A story copied in rather than merged, by `git cherry-pick` or `git merge --squash` and a
commit, is found by `git patch-id --stable` and refused even when verified, since a copy is not the
verified merge: merge the story branch itself with `git merge --no-ff`. A deny aborts the update.
So a merge commit, a fast-forward, a pull, a rebase, a reset, an `update-ref`, a cherry-pick, a
squash merge, an amended merge, a `git push .` into the repository, and a conflicted merge finished
with `git commit` are all judged, whatever the shell form, and `--no-verify` does not skip it. An
octopus merge of a story is refused: merge one story at a time. The merged-result comparison needs
`git merge-tree --write-tree`, git 2.38 or newer; on git 2.28 to 2.37 that comparison alone is
skipped (the verdicts still apply), and session start and `--check` say "merged-tree check needs
git 2.38; merges are not compared with the verified automatic merge". On git older than 2.28 it
falls back to `pre-merge-commit` and `pre-commit` hooks, which miss fast-forwards, squash merges, and
cherry-picks (none makes a merge commit), refuse a story merged with any other head, and compare a
merge commit's staged result only where git needs no content merge (against `git read-tree -m` of the
merge base and both heads), and says so. The installer never overwrites a hook without the marker,
a symlink, or an unreadable file, and never writes a hooks directory in the working tree, one whose
real path (symlinks resolved) leaves the git directory, or one set by global or system
`core.hooksPath`; it reports each, with the lines to add right after the existing hook's `#!` line
(session start names the command that prints them, and never cuts a note). They stop with status 1
only on a refusal, do nothing once deliver's copy is gone, and, for `reference-transaction`, hand
the same stdin records to the rest of the hook; `--uninstall` says to remove them. A hook whose
interpreter is not sh (Python, Node, ..., or unknown, such as a symlink whose target cannot be
read) gets an sh wrapper to install instead: rename the hook to `<hook>.local` and write the
printed wrapper as `<hook>`; it skips a missing `<hook>.local` rather than block updates. A
symlinked hook always gets the wrapper, so its shared target is never edited. Only the gate's own
refusal blocks an update (the gate exits 86, which the shim turns into exit 1); a gate or node that
fails to run warns and lets it through. A hook that runs deliver's lines, in any hooks directory,
is `chained` once it is executable and its lines work as chained; otherwise the installer, at
session start and with `--check` alike, reports `chained-inactive` (not executable),
`chained-crlf` (CRLF line endings sh cannot run), or `chained-stale` (an earlier form of the lines
that no longer works), and `--check` also `copy-missing` or `copy-stale` (the private copy it
calls). `/deliver:doctor` checks and repairs the install.
`node "${CLAUDE_PLUGIN_ROOT}/hooks/git-hook-install.mjs" --uninstall <project>` removes it and sets
`git config deliver.mergeGate off` in the repository's local config, so session start does not
reinstall it and `--check` reports it disabled; running the same command without a flag installs
it again and clears the setting. After a refusal, git's own message says how to recover: `git merge
--abort`, `git rebase --abort`, or `git cherry-pick --abort` for an operation in progress, else
`git reset --merge` only when the index is exactly the refused commit's tree. Copies are compared
on code alone, story files and handoff notes left out, so a squash whose story record conflicted is
still found; a commit merged from a non-story branch that a story only cherry-picked is not a copy.
Rewriting shipped story history (amending or rebasing over a commit that recorded a verifier) must
keep the code diff byte for byte, apart from line numbers: "rewriting shipped story history changes
code; ship the change as a story". An amend must keep the code tree exactly; a rebase must equal
the rebased result. `git pull --rebase=merges` over an unpushed story merge passes, the story's
commits recreated under the merge included; a linear `git pull --rebase` that drops the merge is
refused with "a rebase is replaying a shipped story merge; use git pull --rebase=merges (or git
pull --no-rebase)".

Both catch a PM's honest mistakes, such as a forgotten or stale verdict, a careless command chain,
or a mis-stated tier. Out of the git-level gate's reach are deleting the hook, overriding `core.hooksPath`, `DELIVER_NO_ENFORCE=1`, a fast-forward on git older than 2.28, the merged-result comparison on git older than 2.38 (the verdicts still apply), and pushing straight to the remote. Neither is a
boundary against a deliberately evasive agent with Bash; that protection is the 0.30 sandbox.

**Session context.** `session-context.mjs` reads the marker, the story files, and git, and adds
the current position to new and compacted sessions. It is a `SessionStart` hook. In a deliver
project, unless `deliver.mergeGate` is `off`, it installs or refreshes the git-level merge gate
above, and writes only that: the shims in the hooks directory (`reference-transaction`, or below
git 2.28 `pre-merge-commit` and `pre-commit`), their private copies in `<git-common-dir>/deliver/`,
the removal of an earlier install's shims, and the unsetting of the `branch.<integration>.mergeoptions
--no-ff` the v1 install set. It reports what it could not install or check: a foreign hook, a hooks
directory it may not write, a deliver shim it could not remove (such as a v1 shim in an in-tree
`core.hooksPath`), the gate disabled, and git older than 2.28 or 2.38.

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
