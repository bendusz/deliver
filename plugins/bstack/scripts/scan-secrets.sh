#!/usr/bin/env bash
# bstack secret-scan pre-push
# scan-secrets.sh <base>..<branch>: scan every commit in the range for token formats.
# scan-secrets.sh --pre-push <remote> <url>: the git pre-push hook contract; scans each pushed
# commit the destination lacks per ls-remote, or every reachable one if ls-remote fails. A copy
# of this file installed as the pre-push hook runs this way.
# Each commit is diffed as text against its parent (a root commit against the empty tree). A merge
# commit counts only what differs from every parent: what it brings in belongs to the commits that
# made it. Added lines, added or changed paths and the commit message are matched.
# Allowlist: .scan-secrets-allow, one "<pattern name> <path glob>" per line (* also spans /, # is
# a comment). A range scan reads it from <base>, so a story branch cannot allow its own hit; a
# push reads the work tree's. Only the user adds a line.
# Exit 0 clean, 1 on a hit, 2 on any error (which blocks too). Prints commit, file, line and
# pattern, never a value.
set -euo pipefail
export LC_ALL=C
die() { printf 'scan-secrets: %s\n' "$1" >&2; exit 2; }
[ "$(basename "$0")" = pre-push ] && set -- --pre-push "$@"
# Keep the four distinctive formats first: they match without a token-start boundary (below).
names=(aws-access-key private-key github-token github-pat slack-token sk-api-key google-api-key jwt
  stripe-key gitlab-token npm-token pypi-token sendgrid-key)
pats=('AKIA[0-9A-Z]{16}' '-----BEGIN [A-Z ]*PRIVATE KEY' 'gh[pousr]_[A-Za-z0-9]{30,}'
  'github_pat_[A-Za-z0-9_]{22,}' 'xox[baprs]-[A-Za-z0-9-]{10,}' 'sk-[A-Za-z0-9_-]{20,}'
  'AIza[0-9A-Za-z_-]{35}' 'eyJ[A-Za-z0-9_-]{17,}\.eyJ[A-Za-z0-9_-]{10,}'
  '[sr]k_live_[A-Za-z0-9]{20,}' 'glpat-[A-Za-z0-9_-]{20,}' 'npm_[A-Za-z0-9]{36}'
  'pypi-AgEIcHlwaS5vcmc[A-Za-z0-9_-]{50,}' 'SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}')
allowfile=.scan-secrets-allow
git rev-parse --git-dir >/dev/null 2>&1 || die "not inside a git repository"
empty=$(git hash-object -t tree /dev/null) || die "cannot hash the empty tree"
tmp=$(mktemp -d "${TMPDIR:-/tmp}/scan-secrets.XXXXXX") || die "cannot create a temp directory"
trap 'rm -rf "$tmp"' EXIT
: > "$tmp/lines"; : > "$tmp/hits"; : > "$tmp/allow"

# added <parent> <commit> <out>: write "<sha12>:<file>:<line><TAB><text>" per added line and
# "<sha12>:<path>:path<TAB><path>" per added or changed path. Control bytes become spaces
# (separators); a diff with NULs is also read with them dropped, joining UTF-16 text. Content git
# cannot show as text blocks.
gd=(git -c diff.relative=false -c core.quotePath=true diff --no-color --no-ext-diff --no-renames)
added() {
  local p=$1 c=$2 out=$3 j
  "${gd[@]}" --name-only -z --diff-filter=d "$p" "$c" -- 2>/dev/null | tr '\001-\037\177' ' ' \
    | tr '\000' '\n' | awk -v c="${c:0:12}" '{print c ":" $0 ":path\t" $0}' > "$out" \
    || die "cannot list the paths of commit $c"
  "${gd[@]}" --no-textconv --text --submodule=short -U0 --inter-hunk-context=0 \
    --src-prefix=a/ --dst-prefix=b/ "$p" "$c" -- > "$tmp/raw" 2>/dev/null || die "cannot diff commit $c"
  tr '\000-\010\013-\037\177' ' ' < "$tmp/raw" > "$tmp/diff" || die "cannot read the diff of $c"
  tr -d '\000' < "$tmp/raw" | tr '\001-\010\013-\037\177' ' ' > "$tmp/joined" \
    || die "cannot read the diff of $c"
  j=; cmp -s "$tmp/diff" "$tmp/joined" || j=1  # they differ only where the diff has NULs
  awk -v c="${c:0:12}" '
    /^diff --git /{hdr=1; next}
    hdr && /^(Binary files |GIT binary patch)/{exit 3}
    hdr && /^\+\+\+ "?b\//{f=substr($0,5); sub(/\t$/,"",f); sub(/^"?b\//,"",f); sub(/"$/,"",f); next}
    /^@@ /{hdr=0; split($3,a,","); n=substr(a[1],2)+0; next}
    hdr{next}
    /^\+/{print c ":" f ":" n "\t" substr($0,2); n++; next}
    /^ /{n++}
  ' "$tmp/diff" ${j:+"$tmp/joined"} >> "$out" || die "cannot inspect commit $c as text"
}

# scan <sha>...: append each commit's added lines, paths and message to $tmp/lines.
scan() {
  local c i ps
  for c in "$@"; do
    read -r -a ps <<< "$(git rev-list --parents -n 1 "$c" 2>/dev/null)"
    [ "${#ps[@]}" -ge 1 ] || die "cannot read commit $c"
    if [ "${#ps[@]}" -le 2 ]; then
      added "${ps[1]:-$empty}" "$c" "$tmp/cur"
    else
      for ((i = 1; i < ${#ps[@]}; i++)); do
        added "${ps[$i]}" "$c" "$tmp/one"
        sort -u "$tmp/one" > "$tmp/next" || die "cannot sort the diff of $c"
        if [ "$i" -gt 1 ]; then
          comm -12 "$tmp/cur" "$tmp/next" > "$tmp/both" || die "cannot compare the parents of $c"
          mv "$tmp/both" "$tmp/next"
        fi
        mv "$tmp/next" "$tmp/cur"
      done
    fi
    cat "$tmp/cur" >> "$tmp/lines" || die "cannot record commit $c"
    git show -s --format=%B "$c" 2>/dev/null | tr '\000-\010\013-\037\177' ' ' \
      | awk -v c="${c:0:12}" '{print c ":(commit message):" NR "\t" $0}' >> "$tmp/lines" \
      || die "cannot read the message of commit $c"
  done
}

if [ "${1:-}" = --pre-push ] && [ "$#" -ge 2 ]; then
  mode=push; : > "$tmp/excl"
  top=$(git rev-parse --show-toplevel 2>/dev/null) || top=
  if [ -n "$top" ] && [ -f "$top/$allowfile" ]; then
    cat "$top/$allowfile" > "$tmp/allow" || die "cannot read $allowfile"
  fi
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
    # shellcheck disable=SC2086  # one sha per word
    scan $commits
  done
elif [ "$#" -eq 1 ] && case $1 in -*) false ;; *..*) true ;; *) false ;; esac; then
  mode=merge; side=; case $1 in *...*) side=--right-only ;; esac
  commits=$(git rev-list ${side:+"$side"} "$1" -- 2>/dev/null) || die "bad range: $1"
  base=${1%%..*}
  git show "${base:-HEAD}:$allowfile" > "$tmp/allow" 2>/dev/null || : > "$tmp/allow"
  # shellcheck disable=SC2086  # one sha per word
  scan $commits
else
  die "usage: scan-secrets.sh <base>..<branch> | --pre-push <remote> <url>"
fi

# allowed <file> <pattern name>: true when an allowlist line covers the hit.
allowed() {
  local n g
  while read -r n g; do
    g=${g%$'\r'}
    case $n in ''|'#'*) continue ;; esac
    [ "$n" = "$2" ] && [ -n "$g" ] || continue
    # shellcheck disable=SC2254  # the allowlist path is a glob on purpose
    case $1 in $g) return 0 ;; esac
  done < "$tmp/allow"
  return 1
}

# The first four formats match anywhere. The broader ones must start a line or follow a character
# outside [A-Za-z0-9_-] or an escape: \n \r \t, %XX or =XX. Printed paths are redacted.
tab=$(printf '\t'); bnd='(.*([^A-Za-z0-9_-]|\\[nrt]|[%=][0-9A-Fa-f]{2}))?'; red=(); skipped=0
for p in "${pats[@]}"; do red+=(-e "s/$p/[redacted]/g"); done
for i in "${!pats[@]}"; do
  pre='.*'; [ "$i" -lt 4 ] || pre=$bnd
  st=0; grep -aE -e "^[^$tab]*$tab$pre${pats[$i]}" "$tmp/lines" > "$tmp/m" || st=$?
  [ "$st" -le 1 ] || die "matcher failed (grep exit $st)"
  cut -f1 "$tmp/m" | awk '!seen[$0]++' > "$tmp/keys" || die "cannot list hits"
  : > "$tmp/kept"
  while IFS= read -r k; do
    f=${k#*:}; f=${f%:*}
    if allowed "$f" "${names[$i]}"; then skipped=$((skipped + 1)); else printf '%s\n' "$k" >> "$tmp/kept"; fi
  done < "$tmp/keys"
  sed -E "${red[@]}" -e "s/\$/ ${names[$i]}/" "$tmp/kept" >> "$tmp/hits" || die "cannot report hits"
done
[ "$skipped" -eq 0 ] || printf 'scan-secrets: %s hit(s) allowed by %s\n' "$skipped" "$allowfile" >&2
[ -s "$tmp/hits" ] || exit 0
sed 's/^/scan-secrets: /' "$tmp/hits" >&2 || die "cannot report hits"
printf 'scan-secrets: %s blocked. Remove the secret from history, not just the working tree, and rotate it. A false positive needs the user'"'"'s line in %s: "<pattern name> <path glob>". Only the user may bypass a push, with git push --no-verify.\n' "$mode" "$allowfile" >&2
exit 1
