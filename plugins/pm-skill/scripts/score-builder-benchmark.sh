#!/usr/bin/env bash
# Validate and score one isolated expert-builder versus codex-builder benchmark.
set -u

usage() { echo "usage: score-builder-benchmark.sh <results.json>" >&2; }
[ "$#" = 1 ] || { usage; exit 64; }
input="$1"
command -v jq >/dev/null 2>&1 || { echo "score-builder-benchmark: jq is required" >&2; exit 69; }
[ -f "$input" ] || { echo "score-builder-benchmark: result file not found: $input" >&2; exit 66; }

if ! jq -e '
  type == "object" and ((keys - ["schema_version","benchmark_id","story","base_commit","runs"]) | length == 0) and
  .schema_version == 1 and (.benchmark_id | type) == "string" and (.benchmark_id | length) > 0 and
  (.story | type) == "string" and (.story | length) > 0 and (.base_commit | type) == "string" and (.base_commit | length) >= 7 and
  (.runs | type) == "array" and (.runs | length) == 2 and
  ([.runs[].builder] | sort) == ["codex-builder","expert-builder"] and
  all(.runs[];
    ((keys - ["builder","status","elapsed_seconds","retries","gates","first_pass_gates","review_findings","changed_paths","notes","cost","tokens"]) | length == 0) and
    (.status == "completed" or .status == "blocked" or .status == "failed") and
    (.elapsed_seconds | type) == "number" and .elapsed_seconds >= 0 and
    (.retries | type) == "number" and .retries >= 0 and (.retries | floor) == .retries and
    (.gates | type) == "object" and (.gates.passed | type) == "number" and (.gates.total | type) == "number" and
    .gates.total >= 1 and .gates.passed >= 0 and .gates.passed <= .gates.total and
    (.first_pass_gates | type) == "boolean" and
    (.review_findings.block | type) == "number" and .review_findings.block >= 0 and
    (.review_findings.major | type) == "number" and .review_findings.major >= 0 and
    (.changed_paths | type) == "number" and .changed_paths >= 0)
' "$input" >/dev/null 2>&1; then
  echo "score-builder-benchmark: invalid benchmark result" >&2
  exit 65
fi

scored="$(jq -c '
  def quality: ([20 - (.review_findings.block * 10) - (.review_findings.major * 4), 0] | max);
  ([.runs[] | select(.status == "completed") | .elapsed_seconds] | min // 0) as $fastest |
  .runs | map(. + {score: (if .status != "completed" then 0 else
    20 + (30 * .gates.passed / .gates.total) +
    (if .first_pass_gates then 20 else 0 end) + quality +
    (5 / (1 + .retries)) +
    (if .elapsed_seconds == 0 or $fastest == 0 then 5 else 5 * $fastest / .elapsed_seconds end)
  end)}) | sort_by(-.score)
' "$input")"

benchmark_id="$(jq -r '.benchmark_id' "$input")"
story="$(jq -r '.story' "$input")"
winner="$(printf '%s' "$scored" | jq -r '.[0].builder')"
winner_score="$(printf '%s' "$scored" | jq -r '.[0].score | (. * 10 | round) / 10')"

printf '# Builder benchmark: %s\n\n' "$benchmark_id"
# shellcheck disable=SC2016  # Backticks are Markdown delimiters.
printf 'Story: `%s`\n\n' "$story"
printf '| Builder | Status | Time | First-pass gates | Gates | Block | Major | Retries | Paths | Score |\n'
printf '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n'
printf '%s' "$scored" | jq -r '.[] | "| \(.builder) | \(.status) | \(.elapsed_seconds)s | \(.first_pass_gates) | \(.gates.passed)/\(.gates.total) | \(.review_findings.block) | \(.review_findings.major) | \(.retries) | \(.changed_paths) | \((.score * 10 | round) / 10) |"'
# shellcheck disable=SC2016  # Backticks are Markdown delimiters.
printf '\nRecommendation: `%s` scored %s. Treat one run as evidence for routing, not a permanent model verdict.\n' "$winner" "$winner_score"
