#!/usr/bin/env bash
# deliver secret-scan pre-push
# scan-secrets.sh <base>..<branch>: scan every commit in the range for token formats.
# scan-secrets.sh --pre-push <remote> <url>: the git pre-push hook contract; scans each pushed
# commit the destination lacks per ls-remote, or every reachable one if ls-remote fails. A copy
# of this file installed as the pre-push hook runs this way.
# Each commit is diffed as text against its first parent (a root commit against the empty tree),
# and only added lines and paths are matched. Exit 0 clean, 1 on a hit, 2 on any usage, git or
# matcher error, so an error blocks too. Prints commit, file, line and pattern, never a value.
set -euo pipefail
export LC_ALL=C
die() { printf 'scan-secrets: %s\n' "$1" >&2; exit 2; }
[ "$(basename "$0")" = pre-push ] && set -- --pre-push "$@"
# Keep the four distinctive formats first: they match without a token-start boundary (below).
names=(aws-access-key private-key github-token github-pat slack-token sk-api-key google-api-key jwt)
pats=('AKIA[0-9A-Z]{16}' '-----BEGIN [A-Z ]*PRIVATE KEY' 'gh[pousr]_[A-Za-z0-9]{30,}'
  'github_pat_[A-Za-z0-9_]{22,}' 'xox[baprs]-[A-Za-z0-9-]{10,}' 'sk-[A-Za-z0-9_-]{20,}'
  'AIza[0-9A-Za-z_-]{35}' 'eyJ[A-Za-z0-9_-]{17,}\.eyJ[A-Za-z0-9_-]{10,}')
git rev-parse --git-dir >/dev/null 2>&1 || die "not inside a git repository"
empty=$(git hash-object -t tree /dev/null) || die "cannot hash the empty tree"
tmp=$(mktemp -d "${TMPDIR:-/tmp}/scan-secrets.XXXXXX") || die "cannot create a temp directory"
trap 'rm -rf "$tmp"' EXIT
: > "$tmp/lines"; : > "$tmp/hits"

# scan <sha>...: append "<sha12>:<file>:<line><TAB><text>" per added line, and "<sha12>:<path>:path
# <TAB><path>" per added or changed path (empty files too). Control bytes but tab and newline become
# spaces, so they still separate. Content git will not show as text blocks.
gd=(git -c diff.relative=false -c core.quotePath=true diff --no-color --no-ext-diff --no-renames)
scan() {
  local c p
  for c in "$@"; do
    p=$(git rev-parse -q --verify "$c^1" 2>/dev/null) || p=$empty
    "${gd[@]}" --name-only -z --diff-filter=d "$p" "$c" -- 2>/dev/null | tr '\001-\037\177' ' ' \
      | tr '\000' '\n' | awk -v c="${c:0:12}" '{print c ":" $0 ":path\t" $0}' >> "$tmp/lines" \
      || die "cannot list the paths of commit $c"
    "${gd[@]}" --no-textconv --text --submodule=short -U0 --inter-hunk-context=0 \
      --src-prefix=a/ --dst-prefix=b/ "$p" "$c" -- 2>/dev/null \
      | tr '\000-\010\013-\037\177' ' ' > "$tmp/diff" || die "cannot diff commit $c"
    awk -v c="${c:0:12}" '
      /^diff --git /{hdr=1; next}
      hdr && /^(Binary files |GIT binary patch)/{exit 3}
      hdr && /^\+\+\+ "?b\//{f=substr($0,5); sub(/\t$/,"",f); sub(/^"?b\//,"",f); sub(/"$/,"",f); next}
      /^@@ /{hdr=0; split($3,a,","); n=substr(a[1],2)+0; next}
      hdr{next}
      /^\+/{print c ":" f ":" n "\t" substr($0,2); n++; next}
      /^ /{n++}
    ' "$tmp/diff" >> "$tmp/lines" || die "cannot inspect commit $c as text"
  done
}

if [ "${1:-}" = --pre-push ] && [ "$#" -ge 2 ]; then
  mode=push; : > "$tmp/excl"
  # Exclude only what the destination really has: the shas it advertises that exist here. If it
  # cannot be listed, exclude nothing (fail closed on safety, not on availability).
  if git ls-remote "${3:-$2}" < /dev/null > "$tmp/remote" 2>/dev/null; then
    cut -f1 "$tmp/remote" | sort -u | sed 's/$/^{commit}/' \
      | git cat-file --batch-check='%(objectname)' | awk '/^[0-9a-f]+$/{print "^" $0}' \
      > "$tmp/excl" || die "cannot check the destination's refs"
  fi
  while read -r _ lsha _ _; do
    case $lsha in *[!0]*) ;; *) continue ;; esac  # a delete pushes no content
    commits=$( { echo "$lsha"; cat "$tmp/excl"; } | git rev-list --stdin) \
      || die "cannot list the commits of $lsha"
    scan $commits
  done
elif [ "$#" -eq 1 ] && case $1 in -*) false ;; *..*) true ;; *) false ;; esac; then
  mode=merge; side=; case $1 in *...*) side=--right-only ;; esac
  commits=$(git rev-list ${side:+"$side"} "$1" -- 2>/dev/null) || die "bad range: $1"
  scan $commits
else
  die "usage: scan-secrets.sh <base>..<branch> | --pre-push <remote> <url>"
fi

# The first four formats are distinctive enough to match anywhere. The broader ones must start a
# line or follow a character outside [A-Za-z0-9_-], or an escape: \n \r \t, %XX (URL) or =XX
# (quoted-printable). Paths are redacted in what is printed.
tab=$(printf '\t'); bnd='(.*([^A-Za-z0-9_-]|\\[nrt]|[%=][0-9A-Fa-f]{2}))?'; red=()
for p in "${pats[@]}"; do red+=(-e "s/$p/[redacted]/g"); done
for i in "${!pats[@]}"; do
  pre='.*'; [ "$i" -lt 4 ] || pre=$bnd
  st=0; grep -aE -e "^[^$tab]*$tab$pre${pats[$i]}" "$tmp/lines" > "$tmp/m" || st=$?
  [ "$st" -le 1 ] || die "matcher failed (grep exit $st)"
  cut -f1 "$tmp/m" | sed -E "${red[@]}" -e "s/\$/ ${names[$i]}/" >> "$tmp/hits" \
    || die "cannot report hits"
done
[ -s "$tmp/hits" ] || exit 0
sed 's/^/scan-secrets: /' "$tmp/hits" >&2
printf 'scan-secrets: %s blocked. Remove the secret from history, not just the working tree, and rotate it. Only the user may bypass this, with git push --no-verify.\n' "$mode" >&2
exit 1
