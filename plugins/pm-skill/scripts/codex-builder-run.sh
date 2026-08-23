#!/usr/bin/env bash
# Safe, foreground bridge from Claude Code's codex-builder agent to `codex exec`.
set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd -P)"
# shellcheck disable=SC1091
. "$PLUGIN_ROOT/hooks/lib.sh"

usage() {
  echo "usage: codex-builder-run.sh --worktree <absolute-git-root> [--story <docs/stories/file.md>] [--preflight] [--mode build|fix --evidence <tmp/codex-builder/file.md>] [--model <id>] [--effort <level>] [--timeout-seconds <n>]" >&2
}

emit_error() { # <status> <reason> [scratch] [version] [exit]
  local status="$1" reason="$2" scratch_dir="${3:-}" version="${4:-}" codex_exit="${5:-}"
  jq -n --arg runner_status "$status" --arg reason "$reason" --arg scratch_dir "$scratch_dir" \
    --arg codex_version "$version" --arg codex_exit "$codex_exit" \
    '{runner_status:$runner_status,reason:$reason,scratch_dir:$scratch_dir,codex_version:$codex_version,codex_exit:$codex_exit,diagnostics_retained:($scratch_dir != "")}'
}

emit_error_with_paths() { # <status> <reason> <scratch> <version> <exit> <paths-file>
  local status="$1" reason="$2" scratch_dir="$3" version="$4" codex_exit="$5" paths_file="$6"
  jq -n --arg runner_status "$status" --arg reason "$reason" --arg scratch_dir "$scratch_dir" \
    --arg codex_version "$version" --arg codex_exit "$codex_exit" --rawfile paths "$paths_file" \
    '{runner_status:$runner_status,reason:$reason,scratch_dir:$scratch_dir,codex_version:$codex_version,codex_exit:$codex_exit,diagnostics_retained:true,actual_files_changed:($paths | split("\n") | map(select(length > 0)))}'
}

snapshot_path() { # <worktree> <relative-path> <raw-manifest>
  local root="$1" rel="$2" out="$3" absolute="$1/$2" fingerprint target file_mode
  printf '%s' "$rel" | LC_ALL=C grep -q '[[:cntrl:]]' && return 1
  if [ -L "$absolute" ]; then
    target="$(readlink "$absolute")" || return 1
    fingerprint="symlink:$(printf '%s' "$target" | git hash-object --stdin 2>/dev/null)" || return 1
  elif [ -f "$absolute" ]; then
    if [ -x "$absolute" ]; then file_mode="100755"; else file_mode="100644"; fi
    fingerprint="file:$file_mode:$(git hash-object --no-filters -- "$absolute" 2>/dev/null)" || return 1
  elif [ -d "$absolute" ] && git -C "$absolute" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    fingerprint="gitlink:$(git -C "$absolute" rev-parse --verify HEAD 2>/dev/null || printf '%s' UNBORN)"
  elif [ ! -e "$absolute" ]; then
    fingerprint="missing"
  else
    return 1
  fi
  printf '%s\t%s\n' "$rel" "$fingerprint" >> "$out"
}

snapshot_worktree() { # <worktree> <manifest>
  local root="$1" out="$2" raw="$2.raw" rel protected
  : > "$raw"
  while IFS= read -r -d '' rel; do
    snapshot_path "$root" "$rel" "$raw" || return 1
  done < <(git -C "$root" ls-files -z)
  while IFS= read -r -d '' rel; do
    snapshot_path "$root" "$rel" "$raw" || return 1
  done < <(git -C "$root" ls-files --others --exclude-standard -z)
  # Protected PM paths are included even if a hostile ignore rule hides them.
  while IFS= read -r -d '' protected; do
    rel="${protected#"$root"/}"
    snapshot_path "$root" "$rel" "$raw" || return 1
  done < <(find "$root/pm" "$root/docs/stories" \( -type f -o -type l \) -print0 2>/dev/null)
  for rel in docs/spec.md docs/plan.md docs/constitution.md; do
    snapshot_path "$root" "$rel" "$raw" || return 1
  done
  LC_ALL=C sort "$raw" > "$out" || return 1
  rm -f -- "$raw"
}

changed_paths() { # <before-manifest> <after-manifest> <output>
  awk -F '\t' '
    NR == FNR { before[$1] = $2; next }
    { after[$1] = $2; seen[$1] = 1; if (!($1 in before) || before[$1] != $2) print $1 }
    END { for (path in before) if (!(path in seen)) print path }
  ' "$1" "$2" | LC_ALL=C sort -u > "$3"
}

git_metadata_fingerprint() { # <worktree>
  local root="$1" head ref index refs config worktrees
  head="$(git -C "$root" rev-parse --verify HEAD 2>/dev/null || printf '%s' UNBORN)"
  ref="$(git -C "$root" symbolic-ref -q HEAD 2>/dev/null || printf '%s' DETACHED)"
  index="$(git -C "$root" diff --cached --binary --no-ext-diff 2>/dev/null | cksum)"
  refs="$(git -C "$root" for-each-ref --format='%(refname)%09%(objectname)' 2>/dev/null | LC_ALL=C sort | cksum)"
  config="$(git -C "$root" config --local --null --list 2>/dev/null | cksum)"
  worktrees="$(git -C "$root" worktree list --porcelain 2>/dev/null | cksum)"
  printf '%s\n%s\n%s\n%s\n%s\n%s\n' "$head" "$ref" "$index" "$refs" "$config" "$worktrees"
}

path_is_allowed() { # <relative-path> <scopes-file>
  local candidate="$1" scopes_file="$2" scope
  while IFS= read -r scope; do
    [ -n "$scope" ] || continue
    case "$candidate" in "$scope"|"$scope"/*) return 0 ;; esac
  done < "$scopes_file"
  return 1
}

process_tree_pids() { # <pid>; children first, then parent
  local pid="$1" child children=""
  if command -v pgrep >/dev/null 2>&1; then
    children="$(pgrep -P "$pid" 2>/dev/null || true)"
    for child in $children; do process_tree_pids "$child"; done
  fi
  printf '%s\n' "$pid"
}

signal_pid_list() { # <signal> <newline-or-space-separated-pids>
  local signal="$1" pids="$2" pid
  for pid in $pids; do kill -"$signal" "$pid" 2>/dev/null || true; done
}

worktree_arg=""; story_arg=""; mode="build"; evidence_arg=""; preflight=0
model="gpt-5.6-sol"; effort="high"; timeout_seconds="600"
scratch=""; scratch_base=""; runtime_tmp=""; codex_pid=""; watchdog_pid=""; interrupt_marker=""

cleanup_runtime_tmp() {
  [ -n "$runtime_tmp" ] || return 0
  case "$runtime_tmp" in "$worktree"/tmp/codex-runtime/*) rm -rf -- "$runtime_tmp" ;; esac
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --worktree) [ "$#" -ge 2 ] || { usage; exit 64; }; worktree_arg="$2"; shift 2 ;;
    --story) [ "$#" -ge 2 ] || { usage; exit 64; }; story_arg="$2"; shift 2 ;;
    --preflight) preflight=1; shift ;;
    --mode) [ "$#" -ge 2 ] || { usage; exit 64; }; mode="$2"; shift 2 ;;
    --evidence) [ "$#" -ge 2 ] || { usage; exit 64; }; evidence_arg="$2"; shift 2 ;;
    --model) [ "$#" -ge 2 ] || { usage; exit 64; }; model="$2"; shift 2 ;;
    --effort) [ "$#" -ge 2 ] || { usage; exit 64; }; effort="$2"; shift 2 ;;
    --timeout-seconds) [ "$#" -ge 2 ] || { usage; exit 64; }; timeout_seconds="$2"; shift 2 ;;
    *) echo "codex-builder: unsupported argument: $1" >&2; usage; exit 64 ;;
  esac
done

[ -n "$worktree_arg" ] || { usage; exit 64; }
[ "$preflight" = 1 ] || [ -n "$story_arg" ] || { usage; exit 64; }
case "$mode" in build|fix) ;; *) echo "codex-builder: mode must be build or fix" >&2; exit 64 ;; esac
case "$effort" in none|low|medium|high|xhigh|max) ;; *) echo "codex-builder: unsupported effort: $effort" >&2; exit 64 ;; esac
printf '%s' "$model" | grep -Eq '^[A-Za-z0-9][A-Za-z0-9._-]*$' || { echo "codex-builder: unsafe model id" >&2; exit 64; }
printf '%s' "$timeout_seconds" | grep -Eq '^[1-9][0-9]*$' || { echo "codex-builder: timeout must be a positive number of seconds" >&2; exit 64; }
[ "$timeout_seconds" -le 7200 ] || { echo "codex-builder: timeout may not exceed 7200 seconds" >&2; exit 64; }
if [ "$mode" = "fix" ] && [ -z "$evidence_arg" ]; then echo "codex-builder: fix mode requires --evidence" >&2; exit 64; fi
if [ "$mode" = "build" ] && [ -n "$evidence_arg" ]; then echo "codex-builder: --evidence is only valid in fix mode" >&2; exit 64; fi
if [ "$preflight" = 1 ] && { [ "$mode" != "build" ] || [ -n "$evidence_arg" ]; }; then echo "codex-builder: --preflight does not accept fix-mode options" >&2; exit 64; fi

command -v jq >/dev/null 2>&1 || { echo "codex-builder: jq is required" >&2; exit 69; }
command -v git >/dev/null 2>&1 || { emit_error unavailable "git is required"; exit 69; }
case "$worktree_arg" in /*) ;; *) emit_error rejected "worktree must be an absolute path"; exit 65 ;; esac
[ -d "$worktree_arg" ] || { emit_error rejected "worktree does not exist"; exit 65; }
worktree="$(cd "$worktree_arg" 2>/dev/null && pwd -P)" || { emit_error rejected "cannot resolve worktree"; exit 65; }
git_root="$(git -C "$worktree" rev-parse --show-toplevel 2>/dev/null)" || { emit_error rejected "worktree is not a git repository"; exit 65; }
git_root="$(cd "$git_root" 2>/dev/null && pwd -P)" || { emit_error rejected "cannot resolve git root"; exit 65; }
[ "$worktree" = "$git_root" ] || { emit_error rejected "--worktree must name the git worktree root exactly"; exit 65; }

story_rel=""; scopes_json='[]'; story_builder=""
if [ -n "$story_arg" ]; then
  story_rel="$(pm_relpath "$worktree" "$story_arg")" || { emit_error rejected "story path escapes the worktree or cannot be resolved"; exit 65; }
  case "$story_rel" in docs/stories/*.md) ;; *) emit_error rejected "story must be a Markdown file under docs/stories/"; exit 65 ;; esac
  [ -f "$worktree/$story_rel" ] || { emit_error rejected "story file does not exist"; exit 65; }
  git -C "$worktree" ls-files --error-unmatch -- "$story_rel" >/dev/null 2>&1 || { emit_error blocked "story must be tracked before codex-builder can write"; exit 66; }

  metadata_lines="$(sed -n '1,12p' "$worktree/$story_rel" | sed -n 's/^[[:space:]]*<!--[[:space:]]*pm-meta:[[:space:]]*\(.*\)[[:space:]]*-->[[:space:]]*$/\1/p')"
  metadata_count="$(printf '%s\n' "$metadata_lines" | sed '/^$/d' | wc -l | tr -d '[:space:]')"
  [ "$metadata_count" = 1 ] || { emit_error blocked "story needs exactly one pm-meta JSON comment in its first 12 lines"; exit 66; }
  metadata="$(printf '%s\n' "$metadata_lines" | head -n 1)"
  [ -n "$metadata" ] || { emit_error blocked "story needs a pm-meta JSON comment in its first 12 lines"; exit 66; }
  if ! printf '%s' "$metadata" | jq -e '
    type == "object" and ((keys | sort) == ["builder","touches"]) and
    (.builder == "expert-builder" or .builder == "codex-builder" or .builder == "auto") and
    ((.touches | type) == "array" and (.touches | length) > 0 and
      (.touches | length) == (.touches | unique | length) and
      all(.touches[]; type == "string" and length > 0 and (explode | all(. >= 32 and . != 127))))
  ' >/dev/null 2>&1; then
    emit_error blocked "story pm-meta must contain only a valid builder and non-empty unique touches array"; exit 66
  fi
  story_builder="$(printf '%s' "$metadata" | jq -r '.builder')"
  visible_builder="$(sed -n '1,12p' "$worktree/$story_rel" | sed -n 's/^Builder:[[:space:]]*//p' | head -n 1 | sed 's/[[:space:]]*$//')"
  [ "$visible_builder" = "$story_builder" ] || { emit_error blocked "story pm-meta builder does not match the visible Builder field"; exit 66; }

  normalized_scopes='[]'
  while IFS= read -r item; do
    case "$item" in /*|*'*'*|*'?'*|*'['*|*']'*|*'<'*|*'>'*) emit_error blocked "story pm-meta touches must use repo-relative paths without globs or placeholders"; exit 66 ;; esac
    case "/$item/" in */../*|*/./*) emit_error blocked "story pm-meta touches must not contain traversal segments"; exit 66 ;; esac
    scope="$(pm_relpath "$worktree" "${item%/}")" || { emit_error blocked "story pm-meta touches contains a path outside the worktree"; exit 66; }
    [ "$scope" != "." ] || { emit_error blocked "story pm-meta touches may not grant the whole worktree"; exit 66; }
    normalized_scopes="$(printf '%s' "$normalized_scopes" | jq -c --arg scope "$scope" '. + [$scope]')"
  done < <(printf '%s' "$metadata" | jq -r '.touches[]')
  scopes_json="$(printf '%s' "$normalized_scopes" | jq -c 'sort | unique')"

  visible_touches="$(sed -n '1,12p' "$worktree/$story_rel" | sed -n 's/^.*Touches:[[:space:]]*//p' | head -n 1)"
  visible_touches="$(printf '%s' "$visible_touches" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
  case "$visible_touches" in ""|"—"|"-"|*'<'*|*'>'*) emit_error blocked "visible Touches must match bounded story pm-meta touches"; exit 66 ;; esac
  visible_scopes='[]'; old_ifs="$IFS"; IFS=','; read -r -a visible_items <<< "$visible_touches"; IFS="$old_ifs"
  for item in "${visible_items[@]}"; do
    item="$(printf '%s' "$item" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//;s:/*$::')"
    [ -n "$item" ] || { emit_error blocked "visible Touches contains an empty path"; exit 66; }
    scope="$(pm_relpath "$worktree" "$item")" || { emit_error blocked "visible Touches contains an invalid path"; exit 66; }
    visible_scopes="$(printf '%s' "$visible_scopes" | jq -c --arg scope "$scope" '. + [$scope]')"
  done
  visible_scopes="$(printf '%s' "$visible_scopes" | jq -c 'sort | unique')"
  [ "$visible_scopes" = "$scopes_json" ] || { emit_error blocked "story pm-meta touches does not match the visible Touches field"; exit 66; }
fi

evidence_rel=""
if [ "$mode" = "fix" ]; then
  evidence_rel="$(pm_relpath "$worktree" "$evidence_arg")" || { emit_error rejected "evidence path escapes the worktree or cannot be resolved"; exit 65; }
  case "$evidence_rel" in tmp/codex-builder/*.md) ;; *) emit_error rejected "fix evidence must be a Markdown file under tmp/codex-builder/"; exit 65 ;; esac
  [ -f "$worktree/$evidence_rel" ] || { emit_error rejected "fix evidence file does not exist"; exit 65; }
fi

state="$worktree/pm/pm-state.json"
[ -e "$state" ] || { emit_error blocked "pm/pm-state.json is missing; refusing a write-capable run"; exit 66; }
[ ! -L "$state" ] || { emit_error blocked "pm/pm-state.json must not be a symlink"; exit 66; }
state_rel="$(pm_relpath "$worktree" "$state")" || { emit_error blocked "pm/pm-state.json escapes the worktree"; exit 66; }
[ "$state_rel" = "pm/pm-state.json" ] || { emit_error blocked "pm/pm-state.json must be a regular in-worktree state file"; exit 66; }
[ -f "$state" ] || { emit_error blocked "pm/pm-state.json is not a regular file"; exit 66; }
git -C "$worktree" ls-files --error-unmatch -- pm/pm-state.json >/dev/null 2>&1 || { emit_error blocked "pm/pm-state.json must be tracked before codex-builder can write"; exit 66; }
jq empty "$state" >/dev/null 2>&1 || { emit_error blocked "pm/pm-state.json is malformed; refusing a write-capable run"; exit 66; }
jq -e '.signed_off == true' "$state" >/dev/null 2>&1 || { emit_error blocked "the PM plan is not signed off; codex-builder may not write implementation files"; exit 66; }

command -v codex >/dev/null 2>&1 || { emit_error unavailable "codex CLI not found; install @openai/codex or use expert-builder"; exit 69; }
codex_version="$(codex --version 2>/dev/null)" || codex_version="unknown"
if ! codex login status >/dev/null 2>&1; then emit_error unavailable "Codex is not authenticated; run codex login or use expert-builder" "" "$codex_version"; exit 69; fi
exec_help="$(codex exec --help 2>/dev/null)" || { emit_error unavailable "codex exec --help failed" "" "$codex_version"; exit 69; }
for required_flag in '--cd' '--sandbox' '--ephemeral' '--ignore-user-config' '--ignore-rules' '--strict-config' '--output-schema' '--output-last-message'; do
  printf '%s\n' "$exec_help" | grep -q -- "$required_flag" || { emit_error unavailable "installed Codex CLI lacks required flag $required_flag; update @openai/codex" "" "$codex_version"; exit 69; }
done

schema="$PLUGIN_ROOT/schemas/codex-builder-result.schema.json"
[ -f "$schema" ] || { emit_error failed "bundled result schema is missing" "" "$codex_version"; exit 70; }
git -C "$worktree" check-ignore -q -- tmp/codex-runtime/probe || { emit_error blocked "tmp/ must be ignored before codex-builder can create an isolated runtime directory" "" "$codex_version"; exit 66; }

if [ "$preflight" = 1 ]; then
  jq -n --arg runner_status ready --arg codex_version "$codex_version" --arg worktree "$worktree" \
    --arg story "$story_rel" --arg builder "$story_builder" --argjson scopes "$scopes_json" \
    '{runner_status:$runner_status,preflight:true,codex_version:$codex_version,worktree:$worktree,story:(if $story == "" then null else $story end),story_builder:(if $builder == "" then null else $builder end),story_scope_checked:($story != ""),allowed_paths:$scopes,quota_consumed:false,policy:{sandbox:"workspace-write",network_access:false,web_search:"disabled",mcp_servers:false,hooks:false,subagents:false,login_shell:false,environment:"core-with-secret-filtering",host_tmp_writable:false}}'
  exit 0
fi

scratch_base="$(cd "${TMPDIR:-/tmp}" 2>/dev/null && pwd -P)" || { emit_error failed "temporary directory is unavailable" "" "$codex_version"; exit 70; }
case "$scratch_base" in
  "$worktree"|"$worktree"/*)
    scratch_base="$(cd /tmp 2>/dev/null && pwd -P)" || { emit_error failed "safe external temporary directory is unavailable" "" "$codex_version"; exit 70; }
    ;;
esac
scratch="$(mktemp -d "$scratch_base/pm-codex-builder.XXXXXX")" || { emit_error failed "could not create scratch directory" "" "$codex_version"; exit 70; }
chmod 700 "$scratch"
run_id="${scratch##*.}"
runtime_tmp="$worktree/tmp/codex-runtime/$run_id"
mkdir -p "$runtime_tmp" || { emit_error failed "could not create the isolated in-worktree runtime directory" "$scratch" "$codex_version"; exit 70; }
chmod 700 "$runtime_tmp"
trap cleanup_runtime_tmp EXIT
prompt="$scratch/prompt.md"; result="$scratch/result.json"; stdout_log="$scratch/stdout.log"; stderr_log="$scratch/stderr.log"
scopes="$scratch/scopes.txt"; before_manifest="$scratch/worktree-before.tsv"; after_manifest="$scratch/worktree-after.tsv"
actual_changes="$scratch/actual-files-changed.txt"; claimed_changes="$scratch/claimed-files-changed.txt"
timeout_marker="$scratch/timed-out"; interrupt_marker="$scratch/interrupted"

printf '%s' "$scopes_json" | jq -r '.[]' > "$scopes"

{
  echo "You are the implementation worker for one build-ready PM story."
  echo "Worktree root: $worktree"
  echo "Story: $story_rel"
  echo "Allowed implementation paths from story pm-meta:"
  sed 's/^/- /' "$scopes"
  echo "Mode: $mode"
  [ -n "$evidence_rel" ] && echo "Fix evidence: $evidence_rel"
  echo
  echo "Read the story first, then read CLAUDE.md and repository AGENTS.md files when present. Implement only that story."
  if [ "$mode" = "fix" ]; then echo "Read the fix evidence and make the smallest change that resolves its accepted findings or failing gate."; else echo "Prefer a focused implementation. If the story needs broad architectural work or lacks enough context, return blocked instead of widening scope."; fi
  echo "Follow the story's Touches, Out of scope, acceptance criteria, and verification sections."
  echo "Run the story verification command and the relevant project tests before reporting done."
  echo "Do not use the network. Do not edit pm/, any story, docs/spec.md, docs/plan.md, or docs/constitution.md."
  echo "Your shell environment is reduced and secret-like variables are removed. TMPDIR is an isolated directory inside this worktree."
  echo "Do not edit any path outside the allowed implementation paths listed above."
  echo "Do not run git commands that mutate repository state, including add, commit, restore, checkout, switch, reset, rebase, merge, branch, tag, stash, clean, config, worktree, or push. Read-only git inspection is allowed."
  echo "Do not create branches, commits, pull requests, or files outside this worktree."
  echo "Return only JSON matching the supplied schema. List every changed path in files_changed. Use status blocked when tests fail, scope is wider than this brief, or required evidence is missing."
} > "$prompt"

snapshot_worktree "$worktree" "$before_manifest" || { emit_error blocked "the worktree contains an unsupported path type or a tab/newline filename; refusing an ambiguous baseline" "$scratch" "$codex_version"; exit 66; }
before_git_metadata="$(git_metadata_fingerprint "$worktree")"

on_interrupt() {
  [ -f "$interrupt_marker" ] && return
  printf '%s\n' "$1" > "$interrupt_marker"
  if [ -n "$codex_pid" ]; then
    interrupted_pids="$(process_tree_pids "$codex_pid")"
    signal_pid_list TERM "$interrupted_pids"
    sleep 2
    signal_pid_list KILL "$interrupted_pids"
  fi
}
trap 'on_interrupt INT' INT; trap 'on_interrupt TERM' TERM; trap 'on_interrupt HUP' HUP

runtime_tmp_toml="$(jq -Rn --arg value "$runtime_tmp" '$value')"
codex exec --ignore-user-config --ignore-rules --strict-config -C "$worktree" --sandbox workspace-write --ephemeral --color never \
  -m "$model" -c model_reasoning_effort="$effort" -c 'sandbox_workspace_write.network_access=false' \
  -c 'sandbox_workspace_write.exclude_slash_tmp=true' -c 'sandbox_workspace_write.exclude_tmpdir_env_var=true' \
  -c 'shell_environment_policy.inherit="core"' -c 'shell_environment_policy.ignore_default_excludes=false' \
  -c 'shell_environment_policy.experimental_use_profile=false' -c "shell_environment_policy.set.TMPDIR=$runtime_tmp_toml" \
  -c 'allow_login_shell=false' -c 'agents.enabled=false' -c 'web_search="disabled"' \
  -c 'mcp_servers={}' -c 'features.hooks=false' \
  --output-schema "$schema" -o "$result" - < "$prompt" > "$stdout_log" 2> "$stderr_log" &
codex_pid=$!
(
  timer_pid=""
  trap '[ -n "$timer_pid" ] && kill "$timer_pid" 2>/dev/null; exit 0' INT TERM HUP
  sleep "$timeout_seconds" &
  timer_pid=$!
  wait "$timer_pid" || exit 0
  printf '%s\n' "$timeout_seconds" > "$timeout_marker"
  timed_out_pids="$(process_tree_pids "$codex_pid")"
  signal_pid_list TERM "$timed_out_pids"
  sleep 5
  signal_pid_list KILL "$timed_out_pids"
) > /dev/null 2>&1 &
watchdog_pid=$!
codex_exit=0; wait "$codex_pid" || codex_exit=$?
if [ -f "$timeout_marker" ]; then
  wait "$watchdog_pid" 2>/dev/null || true
else
  kill "$watchdog_pid" 2>/dev/null || true
  wait "$watchdog_pid" 2>/dev/null || true
fi
trap - INT TERM HUP

snapshot_worktree "$worktree" "$after_manifest" || { emit_error failed "could not take the post-run worktree snapshot" "$scratch" "$codex_version" "$codex_exit"; exit 70; }
changed_paths "$before_manifest" "$after_manifest" "$actual_changes"
after_git_metadata="$(git_metadata_fingerprint "$worktree")"
git_status="$(git -C "$worktree" status --short --untracked-files=all 2>/dev/null)"

if [ "$before_git_metadata" != "$after_git_metadata" ]; then emit_error_with_paths safety-violation "Codex changed protected git state (HEAD, refs, index contents, local config, or worktree registrations); preserve the worktree and inspect it before continuing" "$scratch" "$codex_version" "$codex_exit" "$actual_changes"; exit 74; fi
protected_change=""; outside_scope=""
while IFS= read -r changed; do
  [ -n "$changed" ] || continue
  case "$changed" in pm/*|docs/spec.md|docs/plan.md|docs/constitution.md|docs/stories/*) protected_change="$changed"; break ;; esac
  path_is_allowed "$changed" "$scopes" || { outside_scope="$changed"; break; }
done < "$actual_changes"
if [ -n "$protected_change" ]; then emit_error_with_paths safety-violation "Codex changed a protected PM artifact: $protected_change" "$scratch" "$codex_version" "$codex_exit" "$actual_changes"; exit 74; fi
if [ -n "$outside_scope" ]; then emit_error_with_paths safety-violation "Codex changed a path outside the story's pm-meta.touches: $outside_scope" "$scratch" "$codex_version" "$codex_exit" "$actual_changes"; exit 74; fi
if [ -f "$timeout_marker" ]; then emit_error_with_paths timed-out "codex exec exceeded the ${timeout_seconds}s timeout; descendants were terminated and partial changes were preserved" "$scratch" "$codex_version" "$codex_exit" "$actual_changes"; exit 124; fi
if [ -f "$interrupt_marker" ]; then signal_name="$(sed -n '1p' "$interrupt_marker")"; emit_error_with_paths interrupted "codex-builder was interrupted by $signal_name; descendants were terminated and partial changes were preserved" "$scratch" "$codex_version" "$codex_exit" "$actual_changes"; exit 130; fi
if [ "$codex_exit" -ne 0 ]; then emit_error_with_paths failed "codex exec exited non-zero; inspect stderr.log" "$scratch" "$codex_version" "$codex_exit" "$actual_changes"; exit 70; fi
if [ ! -s "$result" ]; then emit_error_with_paths failed "codex exec returned no structured result" "$scratch" "$codex_version" "$codex_exit" "$actual_changes"; exit 70; fi
if ! jq -e '
  type == "object" and ((keys | sort) == ["files_changed","out_of_scope_changes","risks","root_cause","status","summary","tests"]) and
  (.status == "done" or .status == "blocked") and ((.root_cause | type) == "string" or .root_cause == null) and
  ((.files_changed | type) == "array" and (.files_changed | length) == (.files_changed | unique | length) and all(.files_changed[]; type == "string" and (explode | all(. >= 32 and . != 127)))) and
  ((.summary | type) == "array" and (.summary | length) > 0 and all(.summary[]; type == "string")) and
  ((.tests | type) == "array" and (.tests | length) > 0 and all(.tests[]; type == "object" and (.command | type) == "string" and (.status == "passed" or .status == "failed" or .status == "not-run") and (.summary | type) == "string")) and
  ((.out_of_scope_changes | type) == "array" and all(.out_of_scope_changes[]; type == "string")) and
  ((.risks | type) == "array" and all(.risks[]; type == "string")) and (.status != "done" or all(.tests[]; .status == "passed"))
' "$result" >/dev/null 2>&1; then emit_error_with_paths failed "Codex result did not satisfy the builder result contract" "$scratch" "$codex_version" "$codex_exit" "$actual_changes"; exit 70; fi

: > "$claimed_changes"
while IFS= read -r claimed; do
  normalized="$(pm_relpath "$worktree" "$claimed")" || { emit_error_with_paths safety-violation "Codex reported a changed path outside the worktree" "$scratch" "$codex_version" "$codex_exit" "$actual_changes"; exit 74; }
  printf '%s\n' "$normalized" >> "$claimed_changes"
done < <(jq -r '.files_changed[]' "$result")
LC_ALL=C sort -u "$claimed_changes" -o "$claimed_changes"
if ! cmp -s "$claimed_changes" "$actual_changes"; then emit_error_with_paths safety-violation "Codex files_changed does not match the authoritative before/after worktree delta" "$scratch" "$codex_version" "$codex_exit" "$actual_changes"; exit 74; fi

response="$scratch/response.json"
jq -n --arg runner_status completed --arg codex_version "$codex_version" --arg model "$model" --arg effort "$effort" \
  --arg worktree "$worktree" --arg story "$story_rel" --arg mode "$mode" --argjson timeout_seconds "$timeout_seconds" \
  --arg git_status "$git_status" --rawfile actual "$actual_changes" --slurpfile result "$result" \
  '{runner_status:$runner_status,codex_version:$codex_version,model:$model,effort:$effort,worktree:$worktree,story:$story,mode:$mode,timeout_seconds:$timeout_seconds,diagnostics_retained:false,actual_files_changed:($actual | split("\n") | map(select(length > 0))),git_status_short:$git_status,result:$result[0]}' > "$response"
cat "$response"
case "$scratch" in "$scratch_base"/pm-codex-builder.*) rm -rf -- "$scratch" ;; esac
