#!/usr/bin/env bash
# deliver secret-scan pre-push
# scan-secrets.sh <base>..<branch>: scan every commit in the range for token formats.
# scan-secrets.sh --pre-push <remote> <url>: the git pre-push hook contract; scans every pushed
# commit not already on <remote>. A copy of this file installed as the pre-push hook runs this way.
# Each commit is diffed as text against its first parent (a root commit against the empty tree),
# and only added lines and paths are matched. Exit 0 clean, 1 on a hit, 2 on any usage, git or
# matcher error, so an error blocks too. Prints commit, file, line and pattern, never a value.
set -euo pipefail
export LC_ALL=C
die() { printf 'scan-secrets: %s\n' "$1" >&2; exit 2; }
[ "$(basename "$0")" = pre-push ] && set -- --pre-push "$@"
names=(aws-access-key private-key github-token github-pat slack-token sk-api-key google-api-key jwt)
pats=('AKIA[0-9A-Z]{16}' '-----BEGIN [A-Z ]*PRIVATE KEY' 'gh[pousr]_[A-Za-z0-9]{30,}'
  'github_pat_[A-Za-z0-9_]{22,}' 'xox[baprs]-[A-Za-z0-9-]{10,}' 'sk-[A-Za-z0-9_-]{20,}'
  'AIza[0-9A-Za-z_-]{35}' 'eyJ[A-Za-z0-9_-]{17,}\.eyJ[A-Za-z0-9_-]{10,}')
git rev-parse --git-dir >/dev/null 2>&1 || die "not inside a git repository"
empty=$(git hash-object -t tree /dev/null) || die "cannot hash the empty tree"
tmp=$(mktemp -d "${TMPDIR:-/tmp}/scan-secrets.XXXXXX") || die "cannot create a temp directory"
trap 'rm -rf "$tmp"' EXIT
: > "$tmp/lines"; : > "$tmp/hits"

# scan <sha>...: for each commit, append "<sha12>:<file>:<line><TAB><added text>" per added line,
# and "<sha12>:<file>:path<TAB><file>" per changed file. Content git will not show as text blocks.
scan() {
  local c p
  for c in "$@"; do
    p=$(git rev-parse -q --verify "$c^1" 2>/dev/null) || p=$empty
    git -c diff.relative=false -c core.quotePath=true diff --no-color --no-ext-diff \
      --no-textconv --text --no-renames --submodule=short -U0 --inter-hunk-context=0 \
      --src-prefix=a/ --dst-prefix=b/ "$p" "$c" -- 2>/dev/null | tr -d '\000' > "$tmp/diff" \
      || die "cannot diff commit $c"
    awk -v c="${c:0:12}" '
      /^diff --git /{hdr=1; next}
      hdr && /^(Binary files |GIT binary patch)/{exit 3}
      hdr && /^\+\+\+ "?b\//{f=substr($0,5); sub(/\t$/,"",f); sub(/^"?b\//,"",f); sub(/"$/,"",f)
        print c ":" f ":path\t" f; next}
      /^@@ /{hdr=0; split($3,a,","); n=substr(a[1],2)+0; next}
      hdr{next}
      /^\+/{print c ":" f ":" n "\t" substr($0,2); n++; next}
      /^ /{n++}
    ' "$tmp/diff" >> "$tmp/lines" || die "cannot inspect commit $c as text"
  done
}

if [ "${1:-}" = --pre-push ] && [ "$#" -ge 2 ]; then
  mode=push; remote=$2
  while read -r _ lsha _ rsha; do
    case $lsha in *[!0]*) ;; *) continue ;; esac  # a delete pushes no content
    known=; case $rsha in *[!0]*) git cat-file -e "$rsha^{commit}" 2>/dev/null && known=$rsha ;; esac
    # Exclude only history already on the destination; with none known, scan all of it.
    commits=$(git rev-list "$lsha" --not ${known:+"$known"} --remotes="$remote" --) \
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

# A token starts a line or follows a character outside [A-Za-z0-9_-], or an escape: \n \r \t,
# %XX (URL) or =XX (quoted-printable). Paths are redacted in what is printed.
tab=$(printf '\t'); bnd='(.*([^A-Za-z0-9_-]|\\[nrt]|[%=][0-9A-Fa-f]{2}))?'; red=()
for p in "${pats[@]}"; do red+=(-e "s/$p/[redacted]/g"); done
for i in "${!pats[@]}"; do
  st=0; grep -aE -e "^[^$tab]*$tab$bnd${pats[$i]}" "$tmp/lines" > "$tmp/m" || st=$?
  [ "$st" -le 1 ] || die "matcher failed (grep exit $st)"
  cut -f1 "$tmp/m" | sed -E "${red[@]}" -e "s/\$/ ${names[$i]}/" >> "$tmp/hits" \
    || die "cannot report hits"
done
[ -s "$tmp/hits" ] || exit 0
sed 's/^/scan-secrets: /' "$tmp/hits" >&2
printf 'scan-secrets: %s blocked. Remove the secret from history, not just the working tree, and rotate it. Only the user may bypass this, with git push --no-verify.\n' "$mode" >&2
exit 1
