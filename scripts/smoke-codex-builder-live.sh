#!/usr/bin/env bash
# Repository wrapper for the plugin's opt-in live smoke test.
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
exec "$ROOT/plugins/pm-skill/scripts/smoke-codex-builder-live.sh" "$@"
