#!/usr/bin/env bash
# Opt-in, quota-consuming end-to-end smoke test for the real Codex CLI.
set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
RUNNER="$SCRIPT_DIR/codex-builder-run.sh"
[ "${PM_CODEX_LIVE:-0}" = 1 ] || { echo "smoke-codex-builder-live: set PM_CODEX_LIVE=1 to acknowledge one real Codex run" >&2; exit 64; }
command -v jq >/dev/null 2>&1 || { echo "smoke-codex-builder-live: jq is required" >&2; exit 69; }
command -v codex >/dev/null 2>&1 || { echo "smoke-codex-builder-live: codex CLI is required" >&2; exit 69; }

project="$(mktemp -d)"
project="$(cd "$project" && pwd -P)"
probe="/tmp/pm-codex-live-smoke-${project##*.}"
cleanup() {
  rm -f -- "$probe"
  case "$project" in /tmp/*|/private/tmp/*|/private/var/*) rm -rf -- "$project" ;; esac
}
trap cleanup EXIT

mkdir -p "$project/docs/stories" "$project/pm" "$project/src"
printf 'tmp/\n' > "$project/.gitignore"
printf '{"signed_off":true,"phase":"implementation"}\n' > "$project/pm/pm-state.json"
# shellcheck disable=SC2016  # Backticks and command substitutions are literal story content.
printf '# S1-1 - live Codex isolation smoke\n<!-- pm-meta: {"builder":"codex-builder","touches":["src"]} -->\nSprint: 1 · Priority: low · Covers: AC-1 · Depends on: none · Parallel-safe: no · Touches: src\nRisk: low · Review lenses: code-integrity-reviewer · Security-sensitive: no · Architecture-sensitive: no\nBuilder: codex-builder\n\n## Goal\nProve the real runner can make a bounded change with its isolated tool environment.\n\n## Acceptance criteria (testable)\n- [ ] Create `src/result.txt` containing exactly `codex-builder-live-smoke`.\n- [ ] Confirm `PM_CODEX_SECRET_SENTINEL` is absent from the tool shell.\n- [ ] Confirm `TMPDIR` starts with the worktree path followed by `/tmp/codex-runtime/`.\n- [ ] Confirm a shell write to `%s` is denied.\n- [ ] After those checks pass, create `src/env-check.txt` containing exactly `env-clean`.\n\n## Out of scope\n- Any other file.\n\n## Verification\n- Prove done with: `test "$(cat src/result.txt)" = codex-builder-live-smoke && test "$(cat src/env-check.txt)" = env-clean`\n' "$probe" > "$project/docs/stories/S1-1-live-smoke.md"
git -C "$project" init -q
git -C "$project" config user.email "codex-smoke@example.com"
git -C "$project" config user.name "Codex Smoke"
git -C "$project" add .gitignore docs/stories/S1-1-live-smoke.md pm/pm-state.json
git -C "$project" commit -qm "live smoke fixture"

output="$project/runner-output.json"
PM_CODEX_SECRET_SENTINEL=must-not-reach-tools "$RUNNER" \
  --worktree "$project" --story docs/stories/S1-1-live-smoke.md \
  --model "${PM_CODEX_SMOKE_MODEL:-gpt-5.6-sol}" --effort "${PM_CODEX_SMOKE_EFFORT:-low}" \
  --timeout-seconds "${PM_CODEX_SMOKE_TIMEOUT:-300}" > "$output"

jq -e '.runner_status == "completed" and .result.status == "done" and .actual_files_changed == ["src/env-check.txt","src/result.txt"] and .diagnostics_retained == false' "$output" >/dev/null || { echo "smoke-codex-builder-live: runner result failed validation" >&2; jq . "$output" >&2; exit 1; }
[ "$(sed -n '1p' "$project/src/result.txt")" = codex-builder-live-smoke ] || { echo "smoke-codex-builder-live: implementation output mismatch" >&2; exit 1; }
[ "$(sed -n '1p' "$project/src/env-check.txt")" = env-clean ] || { echo "smoke-codex-builder-live: environment check mismatch" >&2; exit 1; }
[ ! -e "$probe" ] || { echo "smoke-codex-builder-live: host /tmp was writable" >&2; exit 1; }
if find "$project/tmp/codex-runtime" -mindepth 1 -print -quit 2>/dev/null | grep -q .; then echo "smoke-codex-builder-live: runtime temp was not cleaned" >&2; exit 1; fi
echo "smoke-codex-builder-live: OK"
