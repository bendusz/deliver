#!/usr/bin/env bash
# deliver secret-scan pre-push
# scan-secrets.sh <rev-range>: scan the lines `git diff <rev-range>` adds for token formats, and
# for an A..B or A...B range also each commit B has that A lacks, so history is covered too.
# scan-secrets.sh --pre-push <remote> <url>: the git pre-push hook contract, scanning each pushed
# commit. A copy of this file installed as the pre-push hook runs in this mode.
# Exit 0 clean, 1 on a hit, 2 on a usage or git error. Never prints a matched value.
set -euo pipefail
die() { printf 'scan-secrets: %s\n' "$1" >&2; exit 2; }
[ "$(basename "$0")" = pre-push ] && set -- --pre-push "$@"
names=(aws-access-key private-key github-token github-pat slack-token sk-api-key google-api-key jwt)
pats=('AKIA[0-9A-Z]{16}' '-----BEGIN [A-Z ]*PRIVATE KEY' 'gh[pousr]_[A-Za-z0-9]{30,}'
  'github_pat_[A-Za-z0-9_]{22,}' 'xox[baprs]-[A-Za-z0-9-]{10,}' 'sk-[A-Za-z0-9_-]{20,}'
  'AIza[0-9A-Za-z_-]{35}' 'eyJ[A-Za-z0-9_-]{17,}\.eyJ[A-Za-z0-9_-]{10,}')
git rev-parse --git-dir >/dev/null 2>&1 || die "not inside a git repository"
tmp=$(mktemp -d "${TMPDIR:-/tmp}/scan-secrets.XXXXXX") || die "cannot create a temp directory"
trap 'rm -rf "$tmp"' EXIT
: > "$tmp/loc"; : > "$tmp/txt"

# added <label> <diff args>: append each added line to txt, and to loc its file:line, or
# file:<label> when a label is given. --text and dropping NULs keep binary files in the scan.
added() {
  local label=$1; shift
  git diff --no-color --no-ext-diff --no-textconv --text --no-renames --submodule=short -U0 \
    --src-prefix=a/ --dst-prefix=b/ "$@" -- 2>/dev/null | tr -d '\000' > "$tmp/diff" \
    || die "bad revision or range: $*"
  awk -v label="$label" -v loc="$tmp/loc" -v txt="$tmp/txt" '
    /^diff --git /{hdr=1; next}
    hdr && /^\+\+\+ /{f=substr($0,5); sub(/^"?b\//,"",f); sub(/"$/,"",f); next}
    /^@@ /{hdr=0; split($3,a,","); n=substr(a[1],2)+0; next}
    !hdr && /^\+/{print f ":" (label=="" ? n : label) >> loc; print substr($0,2) >> txt; n++}
  ' "$tmp/diff"
}
# each <sha>...: scan each commit against its first parent, a root commit against the empty tree.
each() {
  local c p; for c in "$@"; do
    p=$(git rev-parse -q --verify "$c^1" 2>/dev/null) || p=$(git hash-object -t tree /dev/null)
    added "${c:0:12}" "$p" "$c"
  done
}

if [ "${1:-}" = --pre-push ]; then
  mode=push
  while read -r _ lsha _ rsha; do
    case $lsha in *[!0]*) ;; *) continue ;; esac  # a delete pushes no content
    case $rsha in *[!0]*) git cat-file -e "$rsha^{commit}" 2>/dev/null || rsha=0 ;; esac
    case $rsha in
      *[!0]*) commits=$(git rev-list "$rsha..$lsha") || die "cannot list $rsha..$lsha" ;;
      *) commits=$(git rev-list "$lsha" --not --remotes) || die "cannot list commits of $lsha" ;;
    esac
    each $commits
  done
elif [ "$#" -eq 1 ] && [ "${1#-}" = "$1" ]; then
  mode=merge; added "" "$1"
  case $1 in *..*) commits=$(git rev-list --right-only "$1") || die "bad range: $1"; each $commits ;; esac
else
  die "usage: scan-secrets.sh <rev-range> | --pre-push <remote> <url>"
fi

hit=0
for i in "${!pats[@]}"; do
  for n in $(LC_ALL=C grep -anE -e "${pats[$i]}" "$tmp/txt" | cut -d: -f1); do
    printf 'scan-secrets: %s %s\n' "$(sed -n "${n}p" "$tmp/loc")" "${names[$i]}" >&2; hit=1
  done
done
[ "$hit" -eq 0 ] && exit 0
printf 'scan-secrets: %s blocked. Remove the secret from history, not just the working tree, and rotate it. Only the user may bypass this, with git push --no-verify.\n' "$mode" >&2
exit 1
