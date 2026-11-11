#!/usr/bin/env bash
# test-scripts.sh: regression tests for plugins/bstack/scripts/{scan-secrets,log}.sh.
# Builds throwaway repositories under a temp directory. Every token below is fake and is put
# together at run time, so this file never contains one and never trips the scan itself.
set -uo pipefail
root=$(cd "$(dirname "$0")/../.." && pwd)
scan=$root/plugins/bstack/scripts/scan-secrets.sh
logsh=$root/plugins/bstack/scripts/log.sh
fails=0; n=0
work=$(mktemp -d "${TMPDIR:-/tmp}/bstack-test.XXXXXX") || exit 2
trap 'rm -rf "$work"' EXIT

# expect <name> <wanted exit> <wanted output substring or ""> <command...>
expect() {
  local name=$1 want=$2 sub=$3 out st; shift 3
  n=$((n + 1))
  out=$("$@" 2>&1); st=$?
  if [ "$st" -ne "$want" ]; then
    fails=$((fails + 1)); printf 'FAIL %s: exit %s, wanted %s\n%s\n' "$name" "$st" "$want" "$out"
  elif [ -n "$sub" ] && ! printf '%s' "$out" | grep -qF -- "$sub"; then
    fails=$((fails + 1)); printf 'FAIL %s: output lacks "%s"\n%s\n' "$name" "$sub" "$out"
  else
    printf 'ok   %s\n' "$name"
  fi
}
commit() { git add -A && git commit -q -m "$1"; }
branch() { git switch -q -c "$1" "${2:-main}"; }

aws="AKIA""ABCDEFGHIJKLMNOP"
jwt="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"".eyJzdWIiOiIxMjM0NTY3ODkwIn0"".sig"
skk="sk""-ant-api03-abcdefghijklmnopqrstuvwxyz"
stripe="sk""_live_""4eC39HqLyjWDarjtT1zdp7dc"
gitlab="glpat""-abcdefghij0123456789"
npmt="npm""_abcdefghijklmnopqrstuvwxyz0123456789"
pypi="pypi""-AgEIcHlwaS5vcmc""abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
sendgrid="SG"".abcdefghijklmnopqrstuv"".abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ"

cd "$work" && git init -q -b main repo && cd repo || exit 2
git config user.name test && git config user.email test@example.invalid
echo hello > a.txt && commit init
base=$(git rev-parse HEAD)

# --- range scans ---
branch clean; echo more >> a.txt; commit clean
expect "clean range" 0 "" bash "$scan" main..clean

branch removed; echo "key=$aws" > cfg.env; commit add; git rm -q cfg.env; commit rm
expect "a key removed in a later commit still blocks" 1 "cfg.env:1 aws-access-key" bash "$scan" main..removed
expect "the block names the mode and the allowlist" 1 "merge blocked" bash "$scan" main..removed
n=$((n + 1))
if bash "$scan" main..removed 2>&1 | grep -qF "$aws"; then
  fails=$((fails + 1)); echo "FAIL the hit output contains the value"
else echo "ok   the hit output omits the value"; fi

i=0
for t in "$stripe:stripe-key" "$gitlab:gitlab-token" "$npmt:npm-token" "$pypi:pypi-token" \
  "$sendgrid:sendgrid-key" "$skk:sk-api-key" "$jwt:jwt"; do
  i=$((i + 1)); branch "fmt$i"; echo "v=${t%:*}" > "f$i.env"; commit "fmt$i"
  expect "format ${t##*:}" 1 "f$i.env:1 ${t##*:}" bash "$scan" "main..fmt$i"
done

branch ident; echo "id = task-abcdefghijklmnopqrstuvwxyz0123" > ids.txt; commit ident
expect "an identifier containing sk- passes" 0 "" bash "$scan" main..ident

branch u16; printf 'k=%s\n' "$skk" | iconv -f utf-8 -t utf-16le > u16.txt; commit u16
expect "a UTF-16 file is read" 1 "u16.txt:1 sk-api-key" bash "$scan" main..u16

branch msg; echo z >> a.txt; commit "deploy with $aws"
expect "a commit message is scanned" 1 "(commit message):1 aws-access-key" bash "$scan" main..msg

# --- allowlist ---
branch fixture; mkdir -p "test/fix tures"; echo "t = '$jwt'" > "test/fix tures/jwt.txt"; commit fixture
expect "a fixture blocks without an allowlist line" 1 "jwt" bash "$scan" main..fixture
echo "jwt test/*" > .scan-secrets-allow; commit "allow on the story branch"
expect "a story branch cannot allow its own hit" 1 "jwt" bash "$scan" main..fixture
git switch -q main; printf '# fixtures\njwt test/*\n' > .scan-secrets-allow; commit "allow jwt fixtures"
expect "the base's allowlist line lets it pass" 0 "1 hit(s) allowed" bash "$scan" main..fixture
branch wrongname; mkdir -p test; echo "k=$aws" > test/aws.txt; commit wrongname
expect "an allowlist line covers only its pattern" 1 "aws-access-key" bash "$scan" main..wrongname

# --- merges ---
git switch -q main; echo "legacy $aws" > legacy.txt; commit "a hit already on main"
branch story "$base"; echo story > story.txt; commit story
git merge -q --no-edit main
expect "a merge of main does not re-report main's hit" 0 "" bash "$scan" main..story
branch evil "$base"; echo e > e.txt; commit e
git merge -q --no-commit --no-ff main >/dev/null 2>&1; echo "new $aws" > sneaked.txt; commit "evil merge"
expect "a secret added in a merge commit blocks" 1 "sneaked.txt:1 aws-access-key" bash "$scan" main..evil

# --- usage ---
expect "no argument is an error" 2 "usage" bash "$scan"
expect "a single ref is an error" 2 "usage" bash "$scan" main
expect "a bad range is an error" 2 "bad range" bash "$scan" nosuch..main

# --- pre-push hook ---
git init -q --bare ../remote.git && git remote add origin ../remote.git
cp "$scan" .git/hooks/pre-push && chmod 755 .git/hooks/pre-push
expect "push: a clean branch goes out" 0 "" git push -q origin clean
expect "push: a key in history blocks" 1 "push blocked" git push -q origin removed
git switch -q main
expect "push: a hit on main blocks" 1 "legacy.txt:1 aws-access-key" git push -q origin main
printf 'aws-access-key legacy.txt\n' >> .scan-secrets-allow
expect "push: the work tree's allowlist is honoured" 0 "allowed" git push -q origin main
git checkout -q -- .scan-secrets-allow
git worktree add -q ../wt -b wtb "$base"
( cd ../wt && echo "k=$aws" > w.env && git add w.env && git commit -q -m w )
expect "push: the hook runs from a linked worktree" 1 "w.env:1 aws-access-key" git -C ../wt push -q origin wtb

# A hook manager owns pre-push through core.hooksPath. Calling the installed copy, as the husky
# recipe does, keeps the scan; a manager hook without the call lets the push out unscanned.
mkdir -p ../managed && git config core.hooksPath ../managed
cat > ../managed/pre-push <<'HOOK'
#!/usr/bin/env sh
bash "$(git rev-parse --git-common-dir)/hooks/pre-push" "$@"
HOOK
chmod 755 ../managed/pre-push
expect "push: a manager hook that calls the copy blocks" 1 "w.env:1 aws-access-key" git -C ../wt push -q origin wtb:managed
printf '#!/usr/bin/env sh\nexit 0\n' > ../managed/pre-push
expect "push: a manager hook without the call skips the scan" 0 "" git -C ../wt push -q origin wtb:skipped
git config --unset core.hooksPath

# --- log.sh ---
expect "log: writes a line" 0 "" bash "$logsh" "first line"
expect "log: the file has the heading and the line" 0 "first line" cat docs/log.md
expect "log: 100 two-byte characters fit" 0 "" bash "$logsh" "$(printf 'é%.0s' $(seq 1 100))"
expect "log: 101 characters are refused" 1 "limit is 100" bash "$logsh" "$(printf 'x%.0s' $(seq 1 101))"
expect "log: a newline is refused" 1 "newline" bash "$logsh" "two
lines"
expect "log: an empty message is refused" 1 "empty" bash "$logsh" ""
( cd ../wt && bash "$logsh" "from a worktree" )
expect "log: a worktree writes the main checkout's file" 0 "from a worktree" tail -1 docs/log.md
cd ../remote.git || exit 2
expect "log: a bare repository is refused" 1 "main checkout" bash "$logsh" bare
cd "$work" || exit 2
expect "log: outside a repository is refused" 1 "not inside a git repository" bash "$logsh" nogit

printf '%s checks, %s failed\n' "$n" "$fails"
[ "$fails" -eq 0 ]
