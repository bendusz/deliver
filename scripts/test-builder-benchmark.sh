#!/usr/bin/env bash
# Quota-free validation for the builder benchmark scorer and routing corpus.
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
SCORER="$ROOT/plugins/deliver/scripts/score-builder-benchmark.mjs"
CASES="$ROOT/plugins/deliver/benchmarks/codex-builder-routing-cases.json"
tmp="$(mktemp -d)"
tmp="$(cd "$tmp" && pwd -P)"
trap 'case "$tmp" in /tmp/*|/private/tmp/*|/private/var/*) rm -rf -- "$tmp" ;; esac' EXIT

printf '%s\n' '{"schema_version":1,"benchmark_id":"fixture-1","story":"docs/stories/S1-1.md","base_commit":"1234567","runs":[{"builder":"expert-builder","status":"completed","elapsed_seconds":120,"retries":1,"gates":{"passed":2,"total":2},"first_pass_gates":false,"review_findings":{"block":0,"major":1},"changed_paths":8,"cost":null,"tokens":null},{"builder":"codex-builder","status":"completed","elapsed_seconds":60,"retries":0,"gates":{"passed":2,"total":2},"first_pass_gates":true,"review_findings":{"block":0,"major":0},"changed_paths":4,"cost":null,"tokens":null}]}' > "$tmp/results.json"

node "$SCORER" "$tmp/results.json" > "$tmp/summary.md" || { echo "test-builder-benchmark: scorer rejected a valid fixture" >&2; exit 1; }
# shellcheck disable=SC2016  # Backticks are literal expected Markdown.
grep -q 'Recommendation: `codex-builder`' "$tmp/summary.md" || { echo "test-builder-benchmark: unexpected recommendation" >&2; exit 1; }
grep -q '| codex-builder | completed | 60s |' "$tmp/summary.md" || { echo "test-builder-benchmark: missing Codex row" >&2; exit 1; }

printf '{}\n' > "$tmp/invalid.json"
if node "$SCORER" "$tmp/invalid.json" >/dev/null 2>&1; then echo "test-builder-benchmark: invalid result was accepted" >&2; exit 1; fi

jq -e '.schema_version == 1 and (.cases | length) >= 10 and ([.cases[].id] | length == (unique | length)) and ([.cases[].expected_builder] | index("codex-builder")) != null and ([.cases[].expected_builder] | index("expert-builder")) != null' "$CASES" >/dev/null || { echo "test-builder-benchmark: routing corpus is invalid" >&2; exit 1; }
echo "test-builder-benchmark: OK"
