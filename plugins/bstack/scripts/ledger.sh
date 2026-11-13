#!/usr/bin/env bash
# ledger.sh <story> <briefs> <reruns> <wall> <tokens> <parity>: append one row for a merged
# story to the main checkout's docs/ledger.md. Rounds and first-pass come from the story's
# pm-exec; the rest are what the PM read, never estimates:
#   briefs  blocked or partial child replies in this story, a count
#   reruns  check runs that failed and then passed, a count
#   wall    "<role>=<model>:<minutes>m ..." from each child's run times (t3_thread_read)
#   tokens  "<role>=<count> ..." when the host reports them, else n/a
#   parity  "<before>-><after>" from the plan's parity check, else n/a
# Never stages or commits.
set -euo pipefail
die() { printf 'ledger.sh: %s\n' "$1" >&2; exit 1; }
[ "$#" -eq 6 ] || die "usage: ledger.sh <story> <briefs> <reruns> <wall> <tokens|n/a> <parity|n/a>"
id=$1 briefs=$2 reruns=$3 wall=$4 tokens=$5 parity=$6
[[ $id =~ ^S[0-9]+-[0-9]+$ ]] || die "story '$id' is not S<sprint>-<n>"
[[ $briefs =~ ^[0-9]+$ ]] || die "briefs '$briefs' is not a count"
[[ $reruns =~ ^[0-9]+$ ]] || die "reruns '$reruns' is not a count"
ent='[a-z-]+=[A-Za-z0-9._/-]+:[0-9]+m'
[[ $wall =~ ^$ent( $ent)*$ ]] || die "wall '$wall' is not <role>=<model>:<minutes>m, space-separated"
[ "$tokens" = n/a ] || [[ $tokens =~ ^[a-z-]+=[0-9]+( [a-z-]+=[0-9]+)*$ ]] \
  || die "tokens '$tokens' is not <role>=<count> ...; write n/a when the host gives none"
[ "$parity" = n/a ] || [[ $parity =~ ^[A-Za-z0-9._%/-]+-\>[A-Za-z0-9._%/-]+$ ]] \
  || die "parity '$parity' is not <before>-><after> or n/a"

common=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null) || die "not inside a git repository"
top=$(git -C "$common" rev-parse --show-toplevel 2>/dev/null) || top=$(dirname "$common")
story=$(find "$top/docs/stories" -maxdepth 1 -name "$id-*.md" 2>/dev/null | head -1)
[ -n "$story" ] || die "no docs/stories/$id-*.md in $top"
rounds=$(sed -nE 's/.*pm-exec:.*"rounds": *([0-9]+).*/\1/p' "$story" | head -1)
[ -n "$rounds" ] || die "$story has no pm-exec rounds"
first=n; [ "$rounds" -eq 0 ] && first=y

f=$top/docs/ledger.md
if [ ! -f "$f" ]; then
  printf '# Ledger\n\n| story | rounds | first-pass | blocked/partial briefs | reruns | wall per role | tokens | parity |\n|---|---|---|---|---|---|---|---|\n' > "$f"
fi
printf '| %s | %s | %s | %s | %s | %s | %s | %s |\n' "$id" "$rounds" "$first" "$briefs" "$reruns" "$wall" "$tokens" "$parity" >> "$f"
