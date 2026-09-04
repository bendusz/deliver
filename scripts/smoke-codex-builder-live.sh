#!/usr/bin/env bash
# Thin wrapper kept for muscle memory; the smoke test itself is Node.
ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
exec node "$ROOT/plugins/deliver/scripts/codex/smoke-live.mjs" "$@"
