#!/usr/bin/env bash
# merge-guard.sh: Claude Code PreToolUse hook on Bash (hooks/hooks.json). In a bstack project
# (docs/approval.json at HEAD) it refuses `git merge … pm/<story>` into a non-story branch unless,
# for every story operand:
#   - its pm-exec records `gates: PASS <sha>` and `verifier: PASS <sha>` (or exactly `WAIVED`
#     with a verifier row in the plan's ## Waivers), each a full commit id on the branch, and no
#     commit after it (merges compared with their first parent) touches anything but PM records;
#   - it records `review: PASS <sha>` on the branch, and every commit after it touches only PM
#     records or is a clean merge (no change of its own) of a commit already on the target branch;
#   - it is the only story in the call: stories integrate one at a time, each gated on the tip;
#   - the target branch holds nothing outside PM records that the story branch has not merged;
#   - docs/gate.txt, the integration gate, is not FAIL, unless pm-meta's tags hold fixes-gate.
# Refused outright, so the check cannot be misread: a story merge whose operand or repository it
# cannot read (a variable, a substitution in the branch, `cd` or `-C`), a story merge after a
# command that moves HEAD in the same call, and, where a bstack project may be involved, a story
# name passed through eval, xargs, a shell's -c, `git pull` or a git alias.
# It guards against mistakes, not an adversary with a shell.
# Exit 0 allows, exit 2 blocks with the reason on stderr. Bash 3.2 compatible.
# Only the user switches it off, by starting Claude Code with BSTACK_NO_ENFORCE=1.
set -uo pipefail
# PM records, as references/state.md lists them: never a story's code.
RECORD_RE='^docs/(stories/|evidence/|retros/|(log|ledger|plan|handoff|go-no-go|acceptance-differences)\.md$|(approval|acceptance)\.json$|gate\.txt$)'
SEP=$'\x1f'

block() { printf 'bstack merge guard: %s\n' "$1" >&2; exit 2; }
oneline() { tr '\n' ' ' | sed 's/ $//'; }
input=$(cat)
# Cheap exit on the raw input: nothing that could decode to a merge or a story name goes past it.
case $input in *merge*|*pm/S*|*'pm\/S'*|*'\u'*) ;; *) exit 0 ;; esac

field() { # field <key>...: a string at that path in the hook input, else empty
  if command -v jq >/dev/null 2>&1; then
    local p; p=$(printf '.%s' "$@"); printf '%s' "$input" | jq -r "$p // empty | strings"
  elif command -v python3 >/dev/null 2>&1; then
    printf '%s' "$input" | python3 -c 'import json,sys
d=json.load(sys.stdin)
for k in sys.argv[1:]: d=d.get(k) if isinstance(d,dict) else None
print(d if isinstance(d,str) else "")' "$@"
  elif command -v node >/dev/null 2>&1; then
    printf '%s' "$input" | node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{
let d=JSON.parse(s);for(const k of process.argv.slice(1))d=d&&typeof d==="object"?d[k]:undefined;
process.stdout.write(typeof d==="string"?d:"")})' "$@"
  else return 9; fi
}
cmd=$(field tool_input command) || block "cannot read the hook input: install jq, python3 or node"
case $cmd in *merge*|*pm/S*) ;; *) exit 0 ;; esac   # cheap exit, on the decoded command
case $cmd in *BSTACK_NO_ENFORCE*) block "BSTACK_NO_ENFORCE is the user's switch; never set it in a command" ;; esac
[ "${BSTACK_NO_ENFORCE:-}" = 1 ] && exit 0
cwd=$(field cwd); [ -n "$cwd" ] || cwd=$PWD

# Split the command into words as the shell would quote them, with SEP between simple commands.
words=()
tokenize() {
  local s=$1 n=${#1} i=0 c q='' cur='' have=0
  while [ "$i" -lt "$n" ]; do
    c=${s:i:1}
    if [ -n "$q" ]; then
      if [ "$c" = "$q" ]; then q=''
      elif [ "$q" = '"' ] && [ "$c" = "\\" ]; then i=$((i + 1)); cur+=${s:i:1}
      else cur+=$c; fi
    else
      case $c in
        \'|\") q=$c; have=1 ;;
        \\) i=$((i + 1)); cur+=${s:i:1}; have=1 ;;
        ' '|$'\t') [ "$have" = 1 ] && words+=("$cur"); cur=''; have=0 ;;
        $'\n'|';'|'&'|'|'|'('|')') [ "$have" = 1 ] && words+=("$cur"); cur=''; have=0; words+=("$SEP") ;;
        *) cur+=$c; have=1 ;;
      esac
    fi
    i=$((i + 1))
  done
  [ "$have" = 1 ] && words+=("$cur")
  words+=("$SEP")
}
resolve() { # resolve <dir> <path>; "?" when either cannot be read (expansions, globs, ~name)
  case $1 in "?"*) printf '?'; return ;; esac
  case $2 in *[\$\`*?[\{]*|"~"[!/]*) printf '?'; return ;; esac
  case $2 in /*) printf '%s' "$2" ;; "~"*) printf '%s' "$HOME${2#\~}" ;; *) printf '%s' "$1/$2" ;; esac
}
bstack() { [ "$1" = "?" ] || git -C "$1" cat-file -e HEAD:docs/approval.json 2>/dev/null; }

# For each `git … merge …`: print "<repo dir>\t<operand>" for every operand that names a story
# branch, or "?<operand>" for one it cannot read.
scan() {
  local dir=$cwd w k g sub op moved=0
  local c=()
  for w in "${words[@]}"; do
    if [ "$w" != "$SEP" ]; then c+=("$w"); continue; fi
    k=0
    while [ "$k" -lt "${#c[@]}" ]; do   # prefixes: keywords, assignments, command, env and the like
      case ${c[k]} in
        if|then|else|elif|do|while|until|'!'|'{'|command|exec|time|nohup|env|-*) k=$((k + 1)) ;;
        *=*) if [[ ${c[k]} =~ ^[A-Za-z_][A-Za-z0-9_]*= ]]; then k=$((k + 1)); else break; fi ;;
        *) break ;;
      esac
    done
    if [ "${c[k]:-}" = cd ] && [ -n "${c[k+1]:-}" ]; then dir=$(resolve "$dir" "${c[k+1]}")
    elif [ "${c[k]:-}" = git ] || [[ ${c[k]:-} == */git ]]; then
      g=$dir; k=$((k + 1))
      while [[ ${c[k]:-} == -* ]]; do
        case ${c[k]} in
          -C) g=$(resolve "$dir" "${c[k+1]:-}"); k=$((k + 2)) ;;
          -c|--git-dir|--work-tree|--namespace) k=$((k + 2)) ;;
          *) k=$((k + 1)) ;;
        esac
      done
      sub=${c[k]:-}; k=$((k + 1)); op=0
      case $sub in switch|checkout|reset|rebase|worktree|stash|bisect|update-ref|symbolic-ref) moved=1 ;; esac
      while [ "$sub" = merge ] && [ "$k" -lt "${#c[@]}" ]; do
        w=${c[k]}; k=$((k + 1))
        if [ "$op" = 0 ]; then
          case $w in
            --) op=1; continue ;;
            -m|-F|-s|-X|--message|--file|--strategy|--strategy-option|--into-name) k=$((k + 1)); continue ;;
            -*) continue ;;
            [0-9]\>*|[0-9]\<*|\>*|\<*) if [[ $w == *[\<\>] ]]; then k=$((k + 1)); fi; continue ;;
          esac
        fi
        case $w in
          *'$'*|*'`'*) printf '%s\t?%s\t%s\n' "$g" "$w" "$moved" ;;
          pm/*|refs/heads/pm/*) printf '%s\t%s\t%s\n' "$g" "${w#refs/heads/}" "$moved" ;;
        esac
      done
    fi
    c=()
  done
}
tokenize "$cmd"
indirect='(^|[^A-Za-z0-9_])(eval|xargs|pull|(sh|bash|zsh|dash|ksh)[[:space:]]+-[A-Za-z]*c)([^A-Za-z0-9_]|$)|alias\.'
# Allowed only when the cwd is not a bstack project and nothing in the text, quoted payloads
# included, could point git elsewhere.
elsewhere='(^|[^A-Za-z0-9_-])(cd|pushd|-C|--git-dir|--work-tree|GIT_DIR|GIT_WORK_TREE)([^A-Za-z0-9_-]|$)'
if [[ $cmd =~ pm/S[0-9]+-[0-9]+ ]] && [[ $cmd =~ $indirect ]] && { bstack "$cwd" || [[ $cmd =~ $elsewhere ]]; }; then
  block "a story branch named through eval, sh -c, git pull or an alias; merge it with a plain git merge"
fi
targets=$(scan)
[ -n "$targets" ] || exit 0
for w in "${words[@]}"; do   # a HEAD-moving word anywhere in the call, whatever its position
  case $w in switch|checkout|reset|rebase|worktree|stash|bisect|update-ref|symbolic-ref)
    targets=$(printf '%s\n' "$targets" | awk 'BEGIN { FS = OFS = "\t" } { $3 = 1; print }') ;;
  esac
done

review_covers() { # review_covers <sha>: as covers, but a clean merge of the base is allowed
  local sha=$1 c p1 p2 t extra
  [[ $sha =~ ^[0-9a-f]{40}([0-9a-f]{24})?$ ]] && [ "$(git -C "$g" cat-file -t "$sha" 2>/dev/null)" = commit ] \
    || block "$id: the review record '$sha' is not a commit id in this repository"
  git -C "$g" merge-base --is-ancestor "$sha" "$head" 2>/dev/null \
    || block "$id: the reviewed sha $sha is not on $br; review the head $head"
  for c in $(git -C "$g" rev-list --first-parent "$sha..$head"); do
    read -r _ p1 p2 _ <<< "$(git -C "$g" rev-list --parents -n 1 "$c")"
    if [ -n "${p2:-}" ] && git -C "$g" merge-base --is-ancestor "$p2" HEAD \
       && t=$(git -C "$g" merge-tree --write-tree "$p1" "$p2" 2>/dev/null | head -1) \
       && [ "$t" = "$(git -C "$g" rev-parse "$c^{tree}")" ]; then continue; fi
    extra=$(git -C "$g" diff-tree --no-commit-id --name-only -r "${p1:-$c}" "$c" | grep -vE "$RECORD_RE" | head -3 | oneline)
    [ -z "$extra" ] || block "$id: reviewed at $sha, but a later commit on $br changes $extra; review the head $head"
  done
}

covers() { # covers <label> <sha>: a full commit id on the head, and nothing after it but PM records
  local sha=$2 extra
  [[ $sha =~ ^[0-9a-f]{40}([0-9a-f]{24})?$ ]] \
    || block "$id: the $1 record '$sha' is not a full commit id; record the sha it ran at"
  [ "$(git -C "$g" cat-file -t "$sha" 2>/dev/null)" = commit ] \
    || block "$id: the $1 sha $sha is not a commit in this repository"
  git -C "$g" merge-base --is-ancestor "$sha" "$head" 2>/dev/null \
    || block "$id: the $1 sha $sha is not on $br; run it again on the head $head"
  extra=$(git -C "$g" log --format= --name-only --first-parent --diff-merges=first-parent "$sha..$head" \
    | grep -v '^$' | grep -vE "$RECORD_RE" | sort -u | head -3 | oneline)
  [ -z "$extra" ] || block "$id: $1 ran at $sha, but later commits on $br change $extra; run it again on $head"
}

check() { # check <repo dir> <story branch> <1 if an earlier command in the call moves HEAD>
  g=$1 br=$2
  [ "$g" != "?" ] || block "cannot tell which repository the merge of $br runs in; write the cd or -C path out"
  git -C "$g" rev-parse --git-dir >/dev/null 2>&1 || block "$g is not a git repository; check the cd or -C path"
  bstack "$g" || return 0   # not a bstack project
  [ "$3" = 1 ] && block "a story merge after a command that moves HEAD; switch, then merge in a separate call"
  local cur story file meta tags exec gates ver rev extra
  cur=$(git -C "$g" symbolic-ref --short -q HEAD)
  case $cur in pm/*) return 0 ;; esac   # bringing a story branch up to date is not a story merge
  case $br in "?"*) block "cannot read the merge operand '${br#?}'; write the branch name out" ;; esac
  head=$(git -C "$g" rev-parse -q --verify "refs/heads/$br^{commit}") || block "no local branch $br"
  id=$(printf '%s' "${br#pm/}" | grep -oE '^S[0-9]+-[0-9]+')
  [ -n "$id" ] || block "$br does not name a story (pm/S<sprint>-<n>-<slug>)"
  story=$(git -C "$g" ls-tree --name-only HEAD docs/stories/ | grep -E "^docs/stories/$id-[^/]*\.md$" | head -1)
  [ -n "$story" ] || block "no docs/stories/$id-*.md committed on $cur"
  file=$(git -C "$g" show "HEAD:$story")
  meta=$(printf '%s\n' "$file" | grep -m1 'pm-meta:' | sed -nE 's/.*pm-meta: *(\{[^}]*\}).*/\1/p')
  tags=$(printf '%s' "$meta" | sed -nE 's/.*"tags": *\[([^]]*)\].*/\1/p')
  exec=$(printf '%s\n' "$file" | grep -m1 'pm-exec:')
  [ -n "$exec" ] || block "$story has no pm-exec line committed on $cur"
  gates=$(printf '%s' "$exec" | sed -nE 's/.*"gates": *"([^"]*)".*/\1/p')
  ver=$(printf '%s' "$exec" | sed -nE 's/.*"verifier": *"([^"]*)".*/\1/p')
  rev=$(printf '%s' "$exec" | sed -nE 's/.*"review": *"([^"]*)".*/\1/p')

  case $gates in
    "PASS "*) covers gates "${gates#PASS }" ;;
    *) block "$id: pm-exec has no 'gates: PASS <sha>' (has '${gates:-nothing}'); run the gates on the merged tree, record the sha, commit" ;;
  esac
  case $ver in
    "PASS "*) covers verifier "${ver#PASS }" ;;
    WAIVED) git -C "$g" show HEAD:docs/plan.md 2>/dev/null | awk '$0 == "## Waivers" { f = 1; next } /^## / { f = 0 } f' \
        | grep '^|' | grep -i 'verifier' | grep -qE "(^|[^0-9A-Za-z-])$id([^0-9]|$)|all stories" \
        || block "$id: verifier WAIVED, but docs/plan.md ## Waivers has no verifier row for $id" ;;
    *) block "$id: pm-exec has no 'verifier: PASS <sha>' (has '${ver:-nothing}')" ;;
  esac
  case $rev in
    "PASS "*) review_covers "${rev#PASS }" ;;
    *) block "$id: pm-exec has no 'review: PASS <sha>' (has '${rev:-nothing}'); record the reviewed head" ;;
  esac
  extra=$(git -C "$g" diff --name-only "$head...HEAD" | grep -vE "$RECORD_RE" | head -3 | oneline)
  [ -z "$extra" ] || block "$cur changed $extra since $br last merged it; merge $cur into $br, gate again"
  if [ "$(git -C "$g" show HEAD:docs/gate.txt 2>/dev/null | awk 'NR==1{print $1}')" = FAIL ] \
     && ! printf '%s' "$tags" | grep -q '"fixes-gate"'; then
    block "the integration gate is red (docs/gate.txt: FAIL); only a story tagged fixes-gate may merge"
  fi
}

if [ "$(printf '%s\n' "$targets" | cut -f2 | grep -v '^?' | sort -u | wc -l)" -gt 1 ]; then
  while IFS=$'\t' read -r gd _; do
    if [ "$gd" = "?" ] || bstack "$gd"; then
      block "one story per merge: integrate them one at a time, each gated on the new tip"
    fi
  done <<< "$targets"
fi
while IFS=$'\t' read -r gd b mv; do check "$gd" "$b" "$mv"; done <<< "$targets"
exit 0
