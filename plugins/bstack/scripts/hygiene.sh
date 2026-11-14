#!/usr/bin/env bash
# hygiene.sh [--max-ahead <n>] [--main <branch>]: /bstack:doctor's machine checks, run from the
# project's main checkout. Prints `ok   <check>` or `WARN <check>: <detail>` per check and
# exits 1 when anything warns. Reads only; changes nothing.
#   size      AGENTS.md is at most 32 KiB.
#   drift     the integration branch is at most <n> (200) commits and 14 days ahead of main.
#   tags      every tag is on main and on the integration branch.
#   leftovers no branch or worktree of a merged story survives.
#   scripts   no untracked or ignored script lies about: PM scripts live tracked in ops/pm/.
#   legacy    docs/plan.md, docs/spec.md and AGENTS.md hold no struck-through text and no
#             "superseded", "withdrawn", "formerly" or "no longer": git keeps what was.
set -uo pipefail
max=200 main=
usage() { printf 'usage: hygiene.sh [--max-ahead <n>] [--main <branch>]\n' >&2; exit 2; }
while [ "$#" -gt 0 ]; do
  case $1 in
    --max-ahead|--main) [ "$#" -ge 2 ] || usage
      if [ "$1" = --main ]; then main=$2; else max=$2; fi; shift 2 ;;
    *) usage ;;
  esac
done
case $max in ''|*[!0-9]*) usage ;; esac
top=$(git rev-parse --show-toplevel 2>/dev/null) || { echo "hygiene.sh: not inside a git repository" >&2; exit 2; }
cd "$top" || exit 2
warns=0
ok() { printf 'ok   %s\n' "$1"; }
warn() { warns=$((warns + 1)); printf 'WARN %s: %s\n' "$1" "$2"; }
has() { git rev-parse -q --verify "refs/heads/$1^{commit}" >/dev/null; }

# size
if [ -f AGENTS.md ]; then
  b=$(wc -c < AGENTS.md | tr -d ' ')
  if [ "$b" -gt 32768 ]; then warn size "AGENTS.md is $b bytes, over 32 KiB; every child pays for it"; else ok "size: AGENTS.md is $b bytes"; fi
else ok "size: no AGENTS.md"; fi

# drift
[ -n "$main" ] || { main=main; has main || main=master; }
# shellcheck disable=SC2016  # the backticks are literal Markdown
int=$(sed -nE 's/^- Integration branch: *`?([^` ]+)`?.*/\1/p' docs/plan.md 2>/dev/null | head -1)
[ -n "$int" ] || int=$main
if [ "$int" = "$main" ] || ! has "$int" || ! has "$main"; then
  ok "drift: integration branch is $int"
else
  ahead=$(git rev-list --count "$main..$int")
  oldest=$(git log --format=%ct "$main..$int" | tail -1)
  days=0; [ -n "$oldest" ] && days=$(( ($(date +%s) - oldest) / 86400 ))
  if [ "$ahead" -gt "$max" ] || [ "$days" -gt 14 ]; then
    warn drift "$int is $ahead commits ahead of $main, oldest $days days; merge it to $main"
  else ok "drift: $int is $ahead commits, $days days ahead of $main"; fi
fi

# tags
off=
for t in $(git tag); do
  for br in "$main" "$int"; do
    has "$br" || continue
    git merge-base --is-ancestor "refs/tags/$t" "$br" 2>/dev/null || off="$off $t(not on $br)"
  done
done
if [ -n "$off" ]; then warn tags "${off# }"; else ok "tags: every tag is on $main and $int"; fi

# leftovers
left=
wts=$(git worktree list --porcelain | sed -n 's/^worktree //p')
for s in docs/stories/*.md; do
  [ -f "$s" ] || continue
  line=$(grep -m1 'pm-exec:' "$s") || continue
  printf '%s' "$line" | grep -q '"status": *"merged"' || continue
  br=$(printf '%s' "$line" | sed -nE 's/.*"branch": *"([^"]+)".*/\1/p')
  wt=$(printf '%s' "$line" | sed -nE 's/.*"worktree": *"([^"]+)".*/\1/p')
  [ -n "$br" ] && has "$br" && left="$left branch:$br"
  [ -n "$wt" ] && printf '%s\n' "$wts" | grep -qxF "$wt" && left="$left worktree:$wt"
done
if [ -n "$left" ]; then warn leftovers "merged stories still have${left}; clean up per host.md ## Worktrees"
else ok "leftovers: none"; fi

# scripts
ext='\.(sh|bash|py|mjs|cjs|js|ts|ps1|rb)$'
deps='(^|/)(node_modules|\.venv|venv|vendor|dist|build|target|coverage|\.next|\.cache|__pycache__|\.tox|bin|obj)/$'
outside() { # every untracked file, and every file in an ignored directory that is not dependencies
  git ls-files -o --exclude-standard
  git ls-files -o -i --exclude-standard --directory | while IFS= read -r p; do
    case $p in
      */) printf '%s\n' "$p" | grep -qE "$deps" || find "$p" -maxdepth 3 -type f 2>/dev/null ;;
      *) printf '%s\n' "$p" ;;
    esac
  done
}
loose=$(outside | grep -E "$ext" | sort -u | head -5 | tr '\n' ' ')
if [ -n "$loose" ]; then warn scripts "untracked or ignored scripts: ${loose% }; keep PM scripts tracked in ops/pm/"
else ok "scripts: none outside git"; fi

# legacy
old=
for f in docs/plan.md docs/spec.md AGENTS.md; do
  [ -f "$f" ] || continue
  hits=$(grep -nEi '~~[^~]+~~|superseded|withdrawn|formerly|no longer' "$f" | head -3 | cut -d: -f1 | tr '\n' ',')
  [ -z "$hits" ] || old="$old $f:${hits%,}"
done
if [ -n "$old" ]; then warn legacy "old text at${old}; rewrite or delete it, git keeps what was"
else ok "legacy: none in the plan, spec or AGENTS.md"; fi

[ "$warns" -eq 0 ]
