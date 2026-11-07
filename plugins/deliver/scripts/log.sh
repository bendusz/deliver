#!/usr/bin/env bash
# log.sh "<message>": append "YYYY-MM-DD HH:MM  <message>" to the main checkout's docs/log.md.
# Rejects an empty, multi-line or over-100-character message. Never stages or commits.
set -euo pipefail
die() { printf 'log.sh: %s\n' "$1" >&2; exit 1; }
[ "$#" -eq 1 ] || die "expected exactly one argument, the message (got $#)"
msg=$1
[ -n "$msg" ] || die "message is empty"
case $msg in *$'\n'*) die "message contains a newline" ;; esac

# Count characters, not bytes: use the first UTF-8 locale under which a 2-byte probe is one
# character. If none works, the inherited locale's count stands (bytes at worst, so stricter).
len=${#msg}
for loc in C.UTF-8 en_US.UTF-8; do
  n=$( { LC_ALL=$loc; p=$'\303\251'; [ "${#p}" -eq 1 ] && printf '%s' "${#msg}"; } 2>/dev/null ) \
    && { len=$n; break; }
done
[ "$len" -le 100 ] || die "message is $len characters, the limit is 100"

common=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null) \
  || die "not inside a git repository"
log="$(dirname "$common")/docs/log.md"
mkdir -p "$(dirname "$log")"
[ -f "$log" ] || printf '# Decision log\n' > "$log"
printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M')" "$msg" >> "$log"
