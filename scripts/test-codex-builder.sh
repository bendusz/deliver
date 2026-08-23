#!/usr/bin/env bash
# Quota-free behavioral tests for the write-capable Codex bridge.
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
RUNNER="$ROOT/plugins/pm-skill/scripts/codex-builder-run.sh"
pass=0
fail=0
cleanup_dirs=()
trap 'for d in "${cleanup_dirs[@]:-}"; do [ -n "$d" ] && rm -rf "$d"; done' EXIT

ok() { pass=$((pass+1)); }
bad() { fail=$((fail+1)); echo "FAIL: $1"; }

new_project() { # new_project <signed-off>
  local signed="$1" d
  d="$(mktemp -d)"
  d="$(cd "$d" && pwd -P)"
  mkdir -p "$d/docs/stories" "$d/tmp/codex-builder" "$d/pm" "$d/src"
  printf 'tmp/\n' > "$d/.gitignore"
  printf '{"signed_off":%s,"phase":"implementation"}\n' "$signed" > "$d/pm/pm-state.json"
  # shellcheck disable=SC2016  # backticks are literal fixture content
  printf '# S1-1 — focused fix\n<!-- pm-meta: {"builder":"codex-builder","touches":["src"]} -->\nSprint: 1 · Priority: high · Covers: AC-1 · Depends on: none · Parallel-safe: yes · Touches: src\nRisk: low · Review lenses: code-integrity-reviewer · Security-sensitive: no · Architecture-sensitive: no\nBuilder: codex-builder\n\n## Acceptance criteria (testable)\n- [ ] fixed\n\n## Verification\n- Prove done with: `true`\n' > "$d/docs/stories/S1-1-fix.md"
  # shellcheck disable=SC2016  # backticks are literal fixture content
  printf '# Evidence\nRun `true`; fix src/fix.txt.\n' > "$d/tmp/codex-builder/S1-1-round-1.md"
  printf '#!/usr/bin/env sh\nexit 0\n' > "$d/src/script.sh"
  git -C "$d" init -q
  git -C "$d" config user.email "builder-tests@example.com"
  git -C "$d" config user.name "Builder Tests"
  git -C "$d" add .gitignore docs/stories/S1-1-fix.md pm/pm-state.json src/script.sh
  git -C "$d" commit -qm "fixture"
  printf '%s' "$d"
}

new_stub() { # echoes directory containing a fake codex binary
  local d
  d="$(mktemp -d)"
  d="$(cd "$d" && pwd -P)"
  mkdir -p "$d/bin"
  cat > "$d/bin/codex" <<'STUB'
#!/usr/bin/env bash
set -u
printf '%s\n' "$*" >> "${STUB_ACTIONS:?}"
if [ "${1:-}" = "--version" ]; then
  echo "codex-cli 9.9.9-stub"
  exit 0
fi
if [ "${1:-}" = "login" ] && [ "${2:-}" = "status" ]; then
  exit "${STUB_LOGIN_EXIT:-0}"
fi
if [ "${1:-}" = "exec" ] && [ "${2:-}" = "--help" ]; then
  cat <<'HELP'
--cd
--sandbox
--ephemeral
--ignore-user-config
--ignore-rules
--strict-config
--output-schema
--output-last-message
HELP
  exit 0
fi
if [ "${1:-}" != "exec" ]; then
  echo "unexpected stub command" >&2
  exit 2
fi
shift
out=""
worktree=""
: > "${STUB_ARGS:?}"
while [ "$#" -gt 0 ]; do
  printf '%s\n' "$1" >> "$STUB_ARGS"
  case "$1" in
    -o|--output-last-message)
      out="$2"; printf '%s\n' "$2" >> "$STUB_ARGS"; shift 2 ;;
    -C|--cd)
      worktree="$2"; printf '%s\n' "$2" >> "$STUB_ARGS"; shift 2 ;;
    -m|--model|-c|--config|--sandbox|--color|--output-schema)
      printf '%s\n' "$2" >> "$STUB_ARGS"; shift 2 ;;
    -)
      cat > "${STUB_PROMPT:?}"; shift ;;
    *) shift ;;
  esac
done
if [ "${STUB_STAGE_GIT:-0}" = "1" ]; then
  printf 'staged by stub\n' > "$worktree/src/staged.txt"
  git -C "$worktree" add src/staged.txt
fi
if [ "${STUB_CREATE_REF:-0}" = "1" ]; then
  git -C "$worktree" branch codex-mutated-ref
fi
write_path="${STUB_WRITE_PATH:-}"
if [ -n "$write_path" ]; then
  mkdir -p "$(dirname "$worktree/$write_path")"
  printf 'fixed by stub\n' > "$worktree/$write_path"
fi
if [ -n "${STUB_CHMOD_PATH:-}" ]; then
  chmod +x "$worktree/$STUB_CHMOD_PATH"
  write_path="$STUB_CHMOD_PATH"
fi
if [ "${STUB_SLEEP:-0}" = "1" ]; then
  sleep 60 &
  sleeping_child=$!
  printf '%s\n' "$sleeping_child" > "${STUB_CHILD_PID:?}"
  wait "$sleeping_child"
fi
if [ "${STUB_EXEC_EXIT:-0}" != "0" ]; then
  echo "stub codex failure" >&2
  exit "$STUB_EXEC_EXIT"
fi
if [ "${STUB_BAD_RESULT:-0}" = "1" ]; then
  printf '{"status":"done"}\n' > "$out"
elif [ "${STUB_BLOCKED_RESULT:-0}" = "1" ]; then
  cat > "$out" <<'RESULT'
{
  "status": "blocked",
  "root_cause": "The bounded fix could not be completed.",
  "files_changed": [],
  "summary": ["Stopped without changing files."],
  "tests": [{"command":"true","status":"not-run","summary":"blocked before verification"}],
  "out_of_scope_changes": [],
  "risks": []
}
RESULT
else
  if [ "${STUB_OMIT_REPORT:-0}" = "1" ]; then report_path=""; else report_path="${STUB_REPORT_PATH:-$write_path}"; fi
  if [ -n "$report_path" ]; then
    if [ "${STUB_DUPLICATE_REPORT:-0}" = "1" ]; then report_json="[\"$report_path\",\"$report_path\"]"; else report_json="[\"$report_path\"]"; fi
  else
    report_json='[]'
  fi
  cat > "$out" <<'RESULT'
{
  "status": "done",
  "root_cause": null,
  "files_changed": REPORT_PATHS,
  "summary": ["Applied the focused fix."],
  "tests": [{"command":"true","status":"passed","summary":"verification passed"}],
  "out_of_scope_changes": [],
  "risks": []
}
RESULT
  sed "s|REPORT_PATHS|$report_json|" "$out" > "$out.tmp"
  mv "$out.tmp" "$out"
fi
echo "stub complete"
STUB
  chmod +x "$d/bin/codex"
  printf '%s' "$d"
}

run_with_stub() { # run_with_stub <project> [runner args...]
  local project="$1" stub="$2"; shift 2
  mkdir -p "$stub/tmp"
  STUB_ACTIONS="$stub/actions.log" \
  STUB_ARGS="$stub/args.log" \
  STUB_PROMPT="$stub/prompt.md" \
  STUB_CHILD_PID="$stub/child.pid" \
  TMPDIR="$stub/tmp" \
  PATH="$stub/bin:$PATH" \
    "$RUNNER" --worktree "$project" --story docs/stories/S1-1-fix.md "$@"
}

# 1. Missing CLI is a clean unavailable result and never consumes quota.
P="$(new_project true)"; cleanup_dirs+=("$P")
MIN="$(mktemp -d)"; cleanup_dirs+=("$MIN")
for tool in bash dirname jq git grep sed head wc tr; do ln -s "$(command -v "$tool")" "$MIN/$tool"; done
OUT="$(PATH="$MIN" "$RUNNER" --worktree "$P" --story docs/stories/S1-1-fix.md 2>/dev/null)"; RC=$?
if [ "$RC" = 69 ] && printf '%s' "$OUT" | jq -e '.runner_status == "unavailable" and (.reason | contains("codex CLI not found"))' >/dev/null; then ok; else bad "missing CLI"; fi

# 2. Failed auth stops before help or execution.
P="$(new_project true)"; cleanup_dirs+=("$P")
S="$(new_stub)"; cleanup_dirs+=("$S")
OUT="$(STUB_LOGIN_EXIT=1 run_with_stub "$P" "$S" 2>/dev/null)"; RC=$?
if [ "$RC" = 69 ] && printf '%s' "$OUT" | jq -e '.runner_status == "unavailable" and (.reason | contains("not authenticated"))' >/dev/null && ! grep -q '^exec' "$S/actions.log"; then ok; else bad "auth failure preflight"; fi

# 3. PM sign-off false stops before Codex is invoked.
P="$(new_project false)"; cleanup_dirs+=("$P")
S="$(new_stub)"; cleanup_dirs+=("$S")
OUT="$(run_with_stub "$P" "$S" 2>/dev/null)"; RC=$?
if [ "$RC" = 66 ] && printf '%s' "$OUT" | jq -e '.runner_status == "blocked" and (.reason | contains("not signed off"))' >/dev/null && [ ! -s "$S/actions.log" ]; then ok; else bad "sign-off false"; fi

# 4. Non-zero codex exit preserves diagnostics and reports the exact exit.
P="$(new_project true)"; cleanup_dirs+=("$P")
S="$(new_stub)"; cleanup_dirs+=("$S")
OUT="$(STUB_EXEC_EXIT=7 run_with_stub "$P" "$S" 2>/dev/null)"; RC=$?
if [ "$RC" = 70 ] && printf '%s' "$OUT" | jq -e '.runner_status == "failed" and .codex_exit == "7" and (.scratch_dir | length > 0)' >/dev/null; then ok; else bad "non-zero codex exit"; fi

# 5. Structured success uses the fixed safe invocation and reports actual status.
P="$(new_project true)"; cleanup_dirs+=("$P")
S="$(new_stub)"; cleanup_dirs+=("$S")
OUT="$(STUB_WRITE_PATH=src/fix.txt run_with_stub "$P" "$S" 2>/dev/null)"; RC=$?
safe_args=1
for arg in '--ignore-user-config' '--ignore-rules' '--strict-config' '--sandbox' 'workspace-write' '--ephemeral' '--color' 'never' '-C' "$P" 'gpt-5.6-sol' 'model_reasoning_effort=high' 'sandbox_workspace_write.network_access=false' 'sandbox_workspace_write.exclude_slash_tmp=true' 'sandbox_workspace_write.exclude_tmpdir_env_var=true' 'shell_environment_policy.inherit="core"' 'shell_environment_policy.ignore_default_excludes=false' 'shell_environment_policy.experimental_use_profile=false' 'allow_login_shell=false' 'agents.enabled=false' 'web_search="disabled"' 'mcp_servers={}' 'features.hooks=false' '--output-schema' '-o' '-'; do
  grep -Fxq -- "$arg" "$S/args.log" || safe_args=0
done
for forbidden in '--dangerously-bypass-approvals-and-sandbox' '--full-auto' '--yolo' '--add-dir'; do
  grep -Fxq -- "$forbidden" "$S/args.log" && safe_args=0
done
runtime_arg="$(grep '^shell_environment_policy.set.TMPDIR=' "$S/args.log" | head -n 1)"
if [ "$RC" = 0 ] && [ "$safe_args" = 1 ] && printf '%s' "$runtime_arg" | grep -q "^shell_environment_policy.set.TMPDIR=\"$P/tmp/codex-runtime/" && printf '%s' "$OUT" | jq -e '.runner_status == "completed" and .result.status == "done" and .actual_files_changed == ["src/fix.txt"] and .diagnostics_retained == false and (.git_status_short | contains("src/fix.txt"))' >/dev/null && grep -q 'Do not run git commands that mutate' "$S/prompt.md" && ! find "$S/tmp" -mindepth 1 -print -quit | grep -q . && ! find "$P/tmp/codex-runtime" -mindepth 1 -print -quit 2>/dev/null | grep -q .; then ok; else bad "structured success, isolated environment, and safe flags"; fi

# 6. Fix mode accepts only a contained evidence brief and passes it to Codex.
P="$(new_project true)"; cleanup_dirs+=("$P")
S="$(new_stub)"; cleanup_dirs+=("$S")
OUT="$(STUB_WRITE_PATH=src/fix.txt run_with_stub "$P" "$S" --mode fix --evidence tmp/codex-builder/S1-1-round-1.md 2>/dev/null)"; RC=$?
if [ "$RC" = 0 ] && printf '%s' "$OUT" | jq -e '.mode == "fix"' >/dev/null && grep -q 'Fix evidence: tmp/codex-builder/S1-1-round-1.md' "$S/prompt.md"; then ok; else bad "fix evidence handoff"; fi

# 7. An unsafe flag is rejected instead of being forwarded.
P="$(new_project true)"; cleanup_dirs+=("$P")
S="$(new_stub)"; cleanup_dirs+=("$S")
run_with_stub "$P" "$S" --dangerously-bypass-approvals-and-sandbox >/dev/null 2>&1; RC=$?
if [ "$RC" = 64 ] && [ ! -s "$S/actions.log" ]; then ok; else bad "unsafe flag rejection"; fi

# 8. Absolute roots are mandatory and story symlinks cannot escape the worktree.
P="$(new_project true)"; cleanup_dirs+=("$P")
S="$(new_stub)"; cleanup_dirs+=("$S")
OUTSIDE="$(mktemp -d)"; cleanup_dirs+=("$OUTSIDE")
printf '# outside\n' > "$OUTSIDE/story.md"
ln -s "$OUTSIDE/story.md" "$P/docs/stories/escape.md"
STUB_ACTIONS="$S/actions.log" STUB_ARGS="$S/args.log" STUB_PROMPT="$S/prompt.md" PATH="$S/bin:$PATH" \
  "$RUNNER" --worktree "$P" --story docs/stories/escape.md >/dev/null 2>&1; RC1=$?
(cd "$(dirname "$P")" && STUB_ACTIONS="$S/actions.log" STUB_ARGS="$S/args.log" STUB_PROMPT="$S/prompt.md" PATH="$S/bin:$PATH" \
  "$RUNNER" --worktree "$(basename "$P")" --story docs/stories/S1-1-fix.md >/dev/null 2>&1); RC2=$?
if [ "$RC1" = 65 ] && [ "$RC2" = 65 ] && [ ! -s "$S/actions.log" ]; then ok; else bad "path containment"; fi

# 9. Invalid structured output fails closed.
P="$(new_project true)"; cleanup_dirs+=("$P")
S="$(new_stub)"; cleanup_dirs+=("$S")
OUT="$(STUB_BAD_RESULT=1 run_with_stub "$P" "$S" 2>/dev/null)"; RC=$?
if [ "$RC" = 70 ] && printf '%s' "$OUT" | jq -e '.runner_status == "failed" and (.reason | contains("result contract"))' >/dev/null; then ok; else bad "invalid structured result"; fi

# 10. Any git metadata mutation is surfaced as a safety violation.
P="$(new_project true)"; cleanup_dirs+=("$P")
S="$(new_stub)"; cleanup_dirs+=("$S")
OUT="$(STUB_STAGE_GIT=1 run_with_stub "$P" "$S" 2>/dev/null)"; RC=$?
if [ "$RC" = 74 ] && printf '%s' "$OUT" | jq -e '.runner_status == "safety-violation"' >/dev/null; then ok; else bad "git metadata mutation detection"; fi

# 11. Missing and symlinked PM state both fail closed before Codex starts.
P="$(new_project true)"; cleanup_dirs+=("$P")
S="$(new_stub)"; cleanup_dirs+=("$S")
rm -f "$P/pm/pm-state.json"
OUT1="$(run_with_stub "$P" "$S" 2>/dev/null)"; RC1=$?
OUTSIDE_STATE="$(mktemp)"; cleanup_dirs+=("$OUTSIDE_STATE")
printf '{"signed_off":true}\n' > "$OUTSIDE_STATE"
ln -s "$OUTSIDE_STATE" "$P/pm/pm-state.json"
OUT2="$(run_with_stub "$P" "$S" 2>/dev/null)"; RC2=$?
if [ "$RC1" = 66 ] && [ "$RC2" = 66 ] && printf '%s' "$OUT1" | jq -e '(.reason | contains("missing"))' >/dev/null && printf '%s' "$OUT2" | jq -e '(.reason | contains("symlink"))' >/dev/null && [ ! -s "$S/actions.log" ]; then ok; else bad "missing or symlinked PM state"; fi

# 12. A protected PM artifact edit is preserved and rejected.
P="$(new_project true)"; cleanup_dirs+=("$P")
S="$(new_stub)"; cleanup_dirs+=("$S")
OUT="$(STUB_WRITE_PATH=pm/pm-state.json STUB_REPORT_PATH=pm/pm-state.json run_with_stub "$P" "$S" 2>/dev/null)"; RC=$?
if [ "$RC" = 74 ] && printf '%s' "$OUT" | jq -e '.runner_status == "safety-violation" and (.reason | contains("protected PM artifact")) and (.actual_files_changed | index("pm/pm-state.json"))' >/dev/null; then ok; else bad "protected PM artifact edit"; fi

# 13. An omitted files_changed entry cannot conceal an actual edit.
P="$(new_project true)"; cleanup_dirs+=("$P")
S="$(new_stub)"; cleanup_dirs+=("$S")
OUT="$(STUB_WRITE_PATH=src/fix.txt STUB_OMIT_REPORT=1 run_with_stub "$P" "$S" 2>/dev/null)"; RC=$?
if [ "$RC" = 74 ] && printf '%s' "$OUT" | jq -e '.runner_status == "safety-violation" and (.reason | contains("authoritative")) and .actual_files_changed == ["src/fix.txt"]' >/dev/null; then ok; else bad "omitted files_changed entry"; fi

# 14. Touches is a mechanical allowlist, not prompt-only guidance.
P="$(new_project true)"; cleanup_dirs+=("$P")
S="$(new_stub)"; cleanup_dirs+=("$S")
OUT="$(STUB_WRITE_PATH=README.md STUB_REPORT_PATH=README.md run_with_stub "$P" "$S" 2>/dev/null)"; RC=$?
if [ "$RC" = 74 ] && printf '%s' "$OUT" | jq -e '.runner_status == "safety-violation" and (.reason | contains("outside the story"))' >/dev/null; then ok; else bad "Touches allowlist"; fi

# 15. Hostile project config is overridden for safety-sensitive capabilities.
P="$(new_project true)"; cleanup_dirs+=("$P")
S="$(new_stub)"; cleanup_dirs+=("$S")
mkdir -p "$P/.codex"
printf 'web_search = "live"\n[mcp_servers.hostile]\ncommand = "false"\n[features]\nhooks = true\n[sandbox_workspace_write]\nnetwork_access = true\n' > "$P/.codex/config.toml"
OUT="$(STUB_WRITE_PATH=src/fix.txt run_with_stub "$P" "$S" 2>/dev/null)"; RC=$?
config_safe=1
for arg in '--ignore-user-config' '--ignore-rules' '--strict-config' 'sandbox_workspace_write.network_access=false' 'web_search="disabled"' 'mcp_servers={}' 'features.hooks=false'; do grep -Fxq -- "$arg" "$S/args.log" || config_safe=0; done
if [ "$RC" = 0 ] && [ "$config_safe" = 1 ] && printf '%s' "$OUT" | jq -e '.actual_files_changed == ["src/fix.txt"]' >/dev/null; then ok; else bad "project config safety overrides"; fi

# 16. A structured blocked result is valid when it makes no unreported edits.
P="$(new_project true)"; cleanup_dirs+=("$P")
S="$(new_stub)"; cleanup_dirs+=("$S")
OUT="$(STUB_BLOCKED_RESULT=1 run_with_stub "$P" "$S" 2>/dev/null)"; RC=$?
if [ "$RC" = 0 ] && printf '%s' "$OUT" | jq -e '.runner_status == "completed" and .result.status == "blocked" and .actual_files_changed == []' >/dev/null; then ok; else bad "structured blocked result"; fi

# 17. Timeout terminates the Codex process tree and preserves diagnostics.
P="$(new_project true)"; cleanup_dirs+=("$P")
S="$(new_stub)"; cleanup_dirs+=("$S")
OUT="$(STUB_SLEEP=1 run_with_stub "$P" "$S" --timeout-seconds 1 2>/dev/null)"; RC=$?
CHILD="$(sed -n '1p' "$S/child.pid" 2>/dev/null)"
child_dead=1
[ -n "$CHILD" ] && kill -0 "$CHILD" 2>/dev/null && child_dead=0
if [ "$RC" = 124 ] && [ "$child_dead" = 1 ] && printf '%s' "$OUT" | jq -e '.runner_status == "timed-out" and .diagnostics_retained == true' >/dev/null; then ok; else bad "timeout and descendant cleanup"; fi

# 18. Mutating a non-current ref is detected too.
P="$(new_project true)"; cleanup_dirs+=("$P")
S="$(new_stub)"; cleanup_dirs+=("$S")
OUT="$(STUB_CREATE_REF=1 run_with_stub "$P" "$S" 2>/dev/null)"; RC=$?
if [ "$RC" = 74 ] && printf '%s' "$OUT" | jq -e '.runner_status == "safety-violation" and (.reason | contains("protected git state"))' >/dev/null; then ok; else bad "other ref mutation"; fi

# 19. A dirty baseline is isolated from the changes made by this run.
P="$(new_project true)"; cleanup_dirs+=("$P")
S="$(new_stub)"; cleanup_dirs+=("$S")
printf 'user-owned dirty file\n' > "$P/src/preexisting.txt"
OUT="$(STUB_WRITE_PATH=src/fix.txt run_with_stub "$P" "$S" 2>/dev/null)"; RC=$?
if [ "$RC" = 0 ] && printf '%s' "$OUT" | jq -e '.actual_files_changed == ["src/fix.txt"] and (.git_status_short | contains("src/preexisting.txt"))' >/dev/null; then ok; else bad "dirty baseline isolation"; fi

# 20. Unsupported effort aliases and invalid machine scope fail before quota use.
P="$(new_project true)"; cleanup_dirs+=("$P")
S="$(new_stub)"; cleanup_dirs+=("$S")
run_with_stub "$P" "$S" --effort ultra >/dev/null 2>&1; RC1=$?
sed 's/"touches":\["src"\]/"touches":[]/' "$P/docs/stories/S1-1-fix.md" > "$P/docs/stories/S1-1-fix.md.tmp"
mv "$P/docs/stories/S1-1-fix.md.tmp" "$P/docs/stories/S1-1-fix.md"
OUT="$(run_with_stub "$P" "$S" 2>/dev/null)"; RC2=$?
if [ "$RC1" = 64 ] && [ "$RC2" = 66 ] && printf '%s' "$OUT" | jq -e '(.reason | contains("pm-meta"))' >/dev/null && ! grep -q '^exec --ignore-user-config' "$S/actions.log" 2>/dev/null; then ok; else bad "effort and machine scope validation"; fi

# 21. Executable-bit changes are part of the authoritative delta.
P="$(new_project true)"; cleanup_dirs+=("$P")
S="$(new_stub)"; cleanup_dirs+=("$S")
OUT="$(STUB_CHMOD_PATH=src/script.sh run_with_stub "$P" "$S" 2>/dev/null)"; RC=$?
if [ "$RC" = 0 ] && [ -x "$P/src/script.sh" ] && printf '%s' "$OUT" | jq -e '.actual_files_changed == ["src/script.sh"]' >/dev/null; then ok; else bad "file mode change detection"; fi

# 22. Ignore rules cannot hide a protected PM edit from the snapshot.
P="$(new_project true)"; cleanup_dirs+=("$P")
S="$(new_stub)"; cleanup_dirs+=("$S")
printf 'pm/hidden.md\n' >> "$P/.gitignore"
OUT="$(STUB_WRITE_PATH=pm/hidden.md STUB_REPORT_PATH=pm/hidden.md run_with_stub "$P" "$S" 2>/dev/null)"; RC=$?
if [ "$RC" = 74 ] && printf '%s' "$OUT" | jq -e '.runner_status == "safety-violation" and (.actual_files_changed | index("pm/hidden.md"))' >/dev/null; then ok; else bad "ignored protected PM edit"; fi

# 23. Preflight checks readiness and story scope without starting a model task.
P="$(new_project true)"; cleanup_dirs+=("$P")
S="$(new_stub)"; cleanup_dirs+=("$S")
OUT="$(STUB_ACTIONS="$S/actions.log" STUB_ARGS="$S/args.log" STUB_PROMPT="$S/prompt.md" PATH="$S/bin:$PATH" "$RUNNER" --preflight --worktree "$P" --story docs/stories/S1-1-fix.md 2>/dev/null)"; RC=$?
if [ "$RC" = 0 ] && printf '%s' "$OUT" | jq -e '.runner_status == "ready" and .preflight == true and .story_scope_checked == true and .allowed_paths == ["src"] and .quota_consumed == false and .policy.host_tmp_writable == false' >/dev/null && ! grep -q '^exec --ignore-user-config' "$S/actions.log" && [ ! -d "$P/tmp/codex-runtime" ]; then ok; else bad "quota-free preflight"; fi

# 24. Human and machine builder fields cannot drift apart.
P="$(new_project true)"; cleanup_dirs+=("$P")
S="$(new_stub)"; cleanup_dirs+=("$S")
sed 's/Builder: codex-builder/Builder: expert-builder/' "$P/docs/stories/S1-1-fix.md" > "$P/docs/stories/S1-1-fix.md.tmp"
mv "$P/docs/stories/S1-1-fix.md.tmp" "$P/docs/stories/S1-1-fix.md"
OUT="$(run_with_stub "$P" "$S" 2>/dev/null)"; RC=$?
if [ "$RC" = 66 ] && printf '%s' "$OUT" | jq -e '(.reason | contains("does not match"))' >/dev/null && [ ! -s "$S/actions.log" ]; then ok; else bad "story builder metadata drift"; fi

# 25. Human Touches cannot drift from the machine allowlist.
P="$(new_project true)"; cleanup_dirs+=("$P")
S="$(new_stub)"; cleanup_dirs+=("$S")
sed 's/Touches: src/Touches: lib/' "$P/docs/stories/S1-1-fix.md" > "$P/docs/stories/S1-1-fix.md.tmp"
mv "$P/docs/stories/S1-1-fix.md.tmp" "$P/docs/stories/S1-1-fix.md"
OUT="$(run_with_stub "$P" "$S" 2>/dev/null)"; RC=$?
if [ "$RC" = 66 ] && printf '%s' "$OUT" | jq -e '(.reason | contains("visible Touches"))' >/dev/null && [ ! -s "$S/actions.log" ]; then ok; else bad "story touch metadata drift"; fi

# 26. Duplicate model-reported paths are rejected outside the API schema subset.
P="$(new_project true)"; cleanup_dirs+=("$P")
S="$(new_stub)"; cleanup_dirs+=("$S")
OUT="$(STUB_WRITE_PATH=src/fix.txt STUB_DUPLICATE_REPORT=1 run_with_stub "$P" "$S" 2>/dev/null)"; RC=$?
if [ "$RC" = 70 ] && printf '%s' "$OUT" | jq -e '.runner_status == "failed" and (.reason | contains("result contract"))' >/dev/null; then ok; else bad "duplicate reported path validation"; fi

echo "test-codex-builder: $pass passed, $fail failed"
[ "$fail" = 0 ] || { echo "test-codex-builder: FAILED"; exit 1; }
echo "test-codex-builder: OK"
