#!/usr/bin/env bash
# ledger.sh <story> <status> <review-rounds> <briefs> <reruns> <wall> <parity>: append one row
# for a reviewed story to the main checkout's docs/ledger.md, whatever became of it. The PM gives
# what it read, never estimates:
#   status         merged, blocked, replaced or abandoned
#   review-rounds  fix rounds a review or the verifier drove (not tests-stage corrections)
#   briefs         blocked or partial child replies in this story, a count
#   reruns         check runs that failed and then passed, a count
#   wall           "<role>=<model>:<minutes>m ..." from each child's run times (t3_thread_read)
#   parity         "<before>-><after>" from the plan's parity check, else n/a
# From the story file: all fix rounds (pm-exec) and the lineage, the root of its `Replaces:`
# chain. First-pass is y only for a merged story with no review-driven round. Never commits.
set -euo pipefail
die() { printf 'ledger.sh: %s\n' "$1" >&2; exit 1; }
[ "$#" -eq 7 ] || die "usage: ledger.sh <story> <status> <review-rounds> <briefs> <reruns> <wall> <parity|n/a>"
id=$1 status=$2 rr=$3 briefs=$4 reruns=$5 wall=$6 parity=$7
[[ $id =~ ^S[0-9]+-[0-9]+$ ]] || die "story '$id' is not S<sprint>-<n>"
case $status in merged|blocked|replaced|abandoned) ;; *) die "status '$status' is not merged, blocked, replaced or abandoned" ;; esac
for v in "$rr" "$briefs" "$reruns"; do [[ $v =~ ^[0-9]+$ ]] || die "'$v' is not a count"; done
ent='[a-z-]+=[A-Za-z0-9._/-]+:[0-9]+m'
[[ $wall =~ ^$ent( $ent)*$ ]] || die "wall '$wall' is not <role>=<model>:<minutes>m, space-separated"
[ "$parity" = n/a ] || [[ $parity =~ ^[A-Za-z0-9._%/-]+-\>[A-Za-z0-9._%/-]+$ ]] \
  || die "parity '$parity' is not <before>-><after> or n/a"

common=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null) || die "not inside a git repository"
top=$(git -C "$common" rev-parse --show-toplevel 2>/dev/null) || top=$(dirname "$common")
file() { find "$top/docs/stories" -maxdepth 1 -name "$1-*.md" 2>/dev/null | head -1; }
story=$(file "$id")
[ -n "$story" ] || die "no docs/stories/$id-*.md in $top"
rounds=$(sed -nE 's/.*pm-exec:.*"rounds": *([0-9]+).*/\1/p' "$story" | head -1)
[ -n "$rounds" ] || die "$story has no pm-exec rounds"
[ "$rr" -le "$rounds" ] || die "review-rounds $rr is more than the story's $rounds fix rounds"
first=n; [ "$status" = merged ] && [ "$rr" -eq 0 ] && first=y

root=$id seen=" $id "   # follow Replaces: back to the first story of the lineage
while :; do
  prev=$(sed -nE 's/^Replaces: *(S[0-9]+-[0-9]+).*/\1/p' "$(file "$root")" 2>/dev/null | head -1)
  [ -n "$prev" ] && [ -n "$(file "$prev")" ] || break
  case $seen in *" $prev "*) die "Replaces: loops back to $prev" ;; esac
  root=$prev seen="$seen$prev "
done

f=$top/docs/ledger.md
if [ ! -f "$f" ]; then
  printf '# Ledger\n\n| story | status | lineage | rounds | review rounds | first-pass | blocked/partial briefs | reruns | wall per role | parity |\n|---|---|---|---|---|---|---|---|---|---|\n' > "$f"
fi
printf '| %s | %s | %s | %s | %s | %s | %s | %s | %s | %s |\n' \
  "$id" "$status" "$root" "$rounds" "$rr" "$first" "$briefs" "$reruns" "$wall" "$parity" >> "$f"
