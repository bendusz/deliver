#!/usr/bin/env bash
# heavy.sh <slots> <command> [args...]: run a heavy command (tests, a build) only while fewer
# than <slots> others run, across every worktree of this repository. Waits for a free slot,
# keeps the command's exit status, and reports the load on stderr before and after:
#   heavy: load <before> -> <after> on <cores> cores[, over the core count]
# Slots are flock(1) locks where flock exists, else symlinks whose target is the holder's pid,
# made in one atomic step; a dead holder's slot is reaped by one waiter at a time.
# The scaffold copies it to bstack/heavy.sh in the git common dir; the plan's `heavy:` names that copy.
set -uo pipefail
die() { printf 'heavy.sh: %s\n' "$1" >&2; exit 2; }
[ "$#" -ge 2 ] || die "usage: heavy.sh <slots> <command> [args...]"
slots=$1; shift
case $slots in ''|*[!0-9]*|0) die "slots must be a positive integer, got '$slots'" ;; esac

if common=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null); then
  dir=$common/bstack-heavy
else   # outside git: a per-user directory only this user can write
  dir=${XDG_RUNTIME_DIR:-${TMPDIR:-/tmp}}/bstack-heavy-$(id -u)
  [ -d "$dir" ] || mkdir -m 700 "$dir" 2>/dev/null
  [ -d "$dir" ] && [ ! -L "$dir" ] && [ -O "$dir" ] || die "$dir is not a directory owned by you"
  chmod 700 "$dir" || die "cannot restrict $dir"
fi
mkdir -p "$dir" || die "cannot create $dir"

cores=$(getconf _NPROCESSORS_ONLN 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 1)
load() {
  if [ -r /proc/loadavg ]; then cut -d' ' -f1 /proc/loadavg
  else uptime | sed -E 's/.*load averages?: *([0-9.]+).*/\1/'; fi
}
over() { awk -v l="$1" -v c="$cores" 'BEGIN { exit !(l > c) }'; }

run() { # run the command with the slot held, then report the load
  local before after st
  before=$(load)
  "$@" 9>&-; st=$?
  after=$(load)
  if over "$before" && over "$after"; then
    printf 'heavy: load %s -> %s on %s cores, over the core count\n' "$before" "$after" "$cores" >&2
  else
    printf 'heavy: load %s -> %s on %s cores\n' "$before" "$after" "$cores" >&2
  fi
  return "$st"
}

reap() { # reap <lock>: free a slot whose holder died, re-reading it under the reaper mutex
  local lock=$1 pid m=$dir/reaper.lnk r
  pid=$(readlink "$lock" 2>/dev/null) || return 0
  kill -0 "$pid" 2>/dev/null && return 0
  if ! ln -s "$$" "$m" 2>/dev/null; then
    r=$(readlink "$m" 2>/dev/null)   # best effort: a reaper that died holding the mutex
    if [ -n "$r" ] && ! kill -0 "$r" 2>/dev/null; then rm -f "$m"; fi
    return 0
  fi
  [ "$(readlink "$lock" 2>/dev/null)" = "$pid" ] && rm -f "$lock"
  rm -f "$m"
}

waited=0
while :; do
  i=1
  while [ "$i" -le "$slots" ]; do
    if command -v flock >/dev/null 2>&1 && [ -z "${BSTACK_HEAVY_NO_FLOCK:-}" ]; then
      [ ! -L "$dir/slot$i" ] || die "$dir/slot$i is a symlink; remove it"
      exec 9>>"$dir/slot$i"
      if flock -n 9; then run "$@"; exit $?; fi
      exec 9>&-
    else
      lock=$dir/slot$i.lnk
      if ln -s "$$" "$lock" 2>/dev/null; then
        trap 'rm -f "$lock"' EXIT
        trap 'exit 130' INT TERM
        run "$@"; exit $?
      fi
      reap "$lock"
    fi
    i=$((i + 1))
  done
  [ "$waited" -eq 1 ] || { printf 'heavy: all %s slots busy, waiting\n' "$slots" >&2; waited=1; }
  sleep 1
done
