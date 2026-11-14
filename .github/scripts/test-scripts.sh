#!/usr/bin/env bash
# test-scripts.sh: regression tests for the plugin's scripts in plugins/bstack/scripts/.
# Builds throwaway repositories under a temp directory. Every token below is fake and is put
# together at run time, so this file never contains one and never trips the scan itself.
# shellcheck disable=SC2016  # single-quoted $1 and backticks are for the child shell and Markdown
set -uo pipefail
root=$(cd "$(dirname "$0")/../.." && pwd)
scan=$root/plugins/bstack/scripts/scan-secrets.sh
logsh=$root/plugins/bstack/scripts/log.sh
guard=$root/plugins/bstack/scripts/merge-guard.sh
ledger=$root/plugins/bstack/scripts/ledger.sh
hygiene=$root/plugins/bstack/scripts/hygiene.sh
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
sout=$(bash "$scan" main..removed 2>&1)   # captured first: under pipefail the scan's exit 1 would decide
if printf '%s' "$sout" | grep -qF "$aws"; then
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
git init -q --bare -b main ../remote.git && git remote add origin ../remote.git
cp "$scan" .git/hooks/pre-push && chmod 755 .git/hooks/pre-push
expect "push: the first commit goes out as the default branch" 0 "" git push -q origin "$base:refs/heads/main"
expect "push: a clean branch goes out" 0 "" git push -q origin clean
expect "push: a key in history blocks" 1 "push blocked" git push -q origin removed
git switch -q main
expect "push: a hit blocks" 1 "legacy.txt:1 aws-access-key" git push -q origin main:refs/heads/legacy
printf 'aws-access-key legacy.txt\n' >> .scan-secrets-allow
expect "push: a work tree allowlist line is ignored" 1 "legacy.txt:1 aws-access-key" git push -q origin main:refs/heads/legacy
commit "allow legacy on the pushed branch"
expect "push: a branch cannot allow its own hit" 1 "legacy.txt:1 aws-access-key" git push -q origin main:refs/heads/legacy
branch allowonly "$base"; printf 'aws-access-key legacy.txt\n' > .scan-secrets-allow; commit "allow legacy"
expect "push: the allowlist itself reaches the default branch" 0 "" git push -q origin allowonly:refs/heads/main
git switch -q main
expect "push: the default branch's allowlist is honoured" 0 "allowed" git push -q origin main:refs/heads/legacy
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

# --- merge-guard.sh ---
# hook <cwd> <command> [env...]: feed the guard a PreToolUse payload, as Claude Code does.
hook() {
  local c=$1 s=$2; shift 2
  s=${s//\\/\\\\}; s=${s//\"/\\\"}
  printf '{"hook_event_name":"PreToolUse","tool_name":"Bash","cwd":"%s","tool_input":{"command":"%s"}}' "$c" "$s" \
    | env "$@" bash "$guard"
}
hookraw() { # hookraw <cwd> <JSON-encoded command, escapes as given>
  printf '{"tool_name":"Bash","cwd":"%s","tool_input":{"command":"%s"}}' "$1" "$2" | bash "$guard"
}
exec_line() { # exec_line <gates> <verifier> [review, default the gates value]: rewrite S1-1's pm-exec, commit on main
  git switch -q main
  sed -i.bak "s|<!-- pm-exec:.*|<!-- pm-exec: {\"status\":\"verified\",\"rounds\":0,\"gates\":\"$1\",\"review\":\"${3:-$1}\",\"verifier\":\"$2\"} -->|" docs/stories/S1-1-a.md
  rm -f docs/stories/S1-1-a.md.bak; commit "state: $1 / $2"
}
cd "$work" && git init -q -b main mg && cd mg || exit 2
git config user.name test && git config user.email test@example.invalid
mkdir -p docs/stories src && echo '{"status":"approved"}' > docs/approval.json
printf '# Plan\n\n## Waivers\n| what | why | date | who | cost seen so far |\n|---|---|---|---|---|\n\n## Sign-off\n' > docs/plan.md
printf '# S1-1: a\n<!-- pm-meta: {"touches":["src/"]} --> <!-- "fixes-gate" -->\n\n## Execution\n<!-- pm-exec: {"status":"claimed","rounds":0} -->\n' > docs/stories/S1-1-a.md
echo base > src/a.txt && commit init
mg=$PWD
branch pm/S1-1-a; echo built >> src/a.txt; commit build; head1=$(git rev-parse HEAD)
git switch -q main
M="git merge --no-ff pm/S1-1-a"
expect "guard: other commands pass" 0 "" hook "$mg" "git status"
expect "guard: no gates record blocks" 2 "no 'gates: PASS" hook "$mg" "$M"
expect "guard: 'command git merge' is checked" 2 "no 'gates: PASS" hook "$mg" "command $M"
expect "guard: a merge in a subshell is checked" 2 "no 'gates: PASS" hook "$mg" "(git merge pm/S1-1-a)"
expect "guard: a split-quoted branch is checked" 2 "no 'gates: PASS" hook "$mg" "git merge \"pm/\"S1-1-a"
expect "guard: a JSON-escaped slash is decoded first" 2 "no 'gates: PASS" hookraw "$mg" 'git merge pm\/S1-1-a'
expect "guard: an operand it cannot read blocks" 2 "write the branch name out" hook "$mg" "git merge \"\$BR\""
exec_line "PASS $head1" "PASS $head1"
expect "guard: gates and verifier at the head pass" 0 "" hook "$mg" "$M"
expect "guard: a quoted message naming pm/ still finds the branch" 0 "" hook "$mg" "$M -m \"feat: merge pm/S1-1-a\""
git switch -q pm/S1-1-a; echo "- J1 label wording" > docs/acceptance-differences.md; commit "accept a difference"; git switch -q main
expect "guard: recording an accepted difference keeps the shas valid" 0 "" hook "$mg" "$M"
expect "guard: a message naming another story is not an operand" 0 "" hook "$mg" "git merge -m \"pm/S1-2-b\" pm/S1-1-a"
git branch -q pm/S1-2-b main
expect "guard: two stories in one merge block" 2 "one story per merge" hook "$mg" "git merge pm/S1-1-a pm/S1-2-b"
expect "guard: two story merges in one call block" 2 "one story per merge" hook "$mg" "git merge pm/S1-1-a && git merge pm/S1-2-b"
exec_line "PASS $head1" "PASS $head1" "none"
expect "guard: no review record blocks" 2 "no 'review: PASS" hook "$mg" "$M"
exec_line "PASS pm/S1-1-a" "PASS pm/S1-1-a"
expect "guard: a ref name is not a recorded sha" 2 "not a full commit id" hook "$mg" "$M"
exec_line "PASS $head1" "PASS $head1"
git switch -q pm/S1-1-a; echo tmp > src/tmp.txt; commit "add tmp"; git rm -q src/tmp.txt; commit "drop tmp"; git switch -q main
expect "guard: a change then its revert after the gated sha blocks" 2 "change src/tmp.txt" hook "$mg" "$M"
git switch -q pm/S1-1-a; echo more >> src/a.txt; commit "late change"; git switch -q main
expect "guard: a code commit after the gated sha blocks" 2 "later commits on pm/S1-1-a change src/a.txt" hook "$mg" "$M"
expect "guard: git -C from elsewhere is followed" 2 "later commits" hook "$work" "git -C $mg merge --no-ff pm/S1-1-a"
expect "guard: cd && merge is followed" 2 "later commits" hook "$work" "cd $mg && $M"
expect "guard: --git-dir from elsewhere blocks" 2 "use cd or -C" hook "$work" "git --git-dir=$mg/.git --work-tree=$mg merge --no-ff pm/S1-1-a"
expect "guard: --git-dir as its own word blocks" 2 "use cd or -C" hook "$work" "git --git-dir $mg/.git merge pm/S1-1-a"
expect "guard: GIT_DIR on the command blocks" 2 "use cd or -C" hook "$work" "GIT_DIR=$mg/.git git merge pm/S1-1-a"
expect "guard: an exported GIT_WORK_TREE blocks" 2 "use cd or -C" hook "$work" "export GIT_WORK_TREE=$mg; git merge pm/S1-1-a"
expect "guard: a chained -C is followed" 2 "later commits" hook "/" "git -C $work -C mg merge --no-ff pm/S1-1-a"
expect "guard: --git-dir without a story merge passes" 0 "" hook "$work" "git --git-dir=$mg/.git log -1"
head2=$(git rev-parse pm/S1-1-a); exec_line "PASS $head2" "PASS $head2"
git switch -q pm/S1-1-a; git merge -q --no-edit main; git switch -q main
expect "guard: a later merge that brings only PM records passes" 0 "" hook "$mg" "$M"
echo other > src/b.txt; commit "unrelated code on main"
expect "guard: main code the branch has not merged blocks" 2 "since pm/S1-1-a last merged it" hook "$mg" "$M"
git switch -q pm/S1-1-a; git merge -q --no-edit main; head3=$(git rev-parse HEAD); git switch -q main
exec_line "PASS $head3" "PASS $head3"
# Review at head3; then main moves on and the branch takes it in with a clean merge.
echo more-main > src/c.txt; commit "more code on main"
git switch -q pm/S1-1-a; git merge -q --no-edit main; head4=$(git rev-parse HEAD); git switch -q main
exec_line "PASS $head4" "PASS $head4" "PASS $head3"
expect "guard: a clean merge of the base after the review passes" 0 "" hook "$mg" "$M"
git switch -q pm/S1-1-a; echo fix > src/d.txt; commit "builder fix after review"; head5=$(git rev-parse HEAD); git switch -q main
exec_line "PASS $head5" "PASS $head5" "PASS $head3"
expect "guard: a code commit after the reviewed sha blocks" 2 "review the head" hook "$mg" "$M"
git switch -q pm/S1-1-a; git reset -q --hard "$head4"; echo evil > src/e.txt
git merge -q --no-ff --no-commit main 2>/dev/null; git add src/e.txt; git commit -q --no-edit -m "merge with a change of its own"
head6=$(git rev-parse HEAD); git switch -q main
exec_line "PASS $head6" "PASS $head6" "PASS $head3"
expect "guard: a merge with a change of its own after the review blocks" 2 "changes src/e.txt" hook "$mg" "$M"
git switch -q pm/S1-1-a; git reset -q --hard "$head4"; git switch -q main; head3=$head4
exec_line "PASS $head3" "PASS $head3"
printf 'FAIL %s 2026-01-01 00:00 3 failed\n' "$head3" > docs/gate.txt; commit "gate red"
git switch -q pm/S1-1-a; git merge -q --no-edit main; git switch -q main
expect "guard: a red integration gate blocks" 2 "integration gate is red" hook "$mg" "$M"
sed -i.bak 's|"touches"|"note":"fixes-gate","touches"|' docs/stories/S1-1-a.md; rm -f docs/stories/S1-1-a.md.bak; commit "note"
expect "guard: fixes-gate outside tags does not count" 2 "integration gate is red" hook "$mg" "$M"
sed -i.bak 's|"touches"|"tags":["fixes-gate"],"touches"|' docs/stories/S1-1-a.md; rm -f docs/stories/S1-1-a.md.bak; commit "tag fixes-gate"
expect "guard: a fixes-gate story merges on red" 0 "" hook "$mg" "$M"
printf 'PASS %s 2026-01-01 00:00\n' "$head3" > docs/gate.txt; commit "gate green"
exec_line "PASS $head3" "WAIVED"
printf '\n## Work log\n| verifier for S1-1 | not a waiver |\n' >> docs/plan.md; commit "a later section"
expect "guard: a waived verifier without a Waivers row blocks" 2 "no verifier row" hook "$mg" "$M"
sed -i.bak 's/^|---|---|---|---|---|$/&\n| verifier for S1-1 | docs only | 2026-01-01 | user | none yet |/' docs/plan.md
rm -f docs/plan.md.bak; commit "waive"
expect "guard: a waived verifier with a Waivers row passes" 0 "" hook "$mg" "$M"
side=$(git commit-tree "HEAD^{tree}" -m side)   # a commit in this repository, on no branch
exec_line "PASS $side" "PASS $head3"
expect "guard: a gates sha not on the branch blocks" 2 "not on pm/S1-1-a" hook "$mg" "$M"
expect "guard: the user's BSTACK_NO_ENFORCE=1 lets it through" 0 "" hook "$mg" "$M" BSTACK_NO_ENFORCE=1
expect "guard: BSTACK_NO_ENFORCE in the command blocks" 2 "the user's switch" hook "$mg" "BSTACK_NO_ENFORCE=1 $M"
for via in python3 node; do   # without jq, the guard reads its input through python3, then node
  command -v "$via" >/dev/null 2>&1 || { echo "skip guard via $via (not installed)"; continue; }
  mkdir -p "$work/bin-$via"
  for t in bash cat env git sed awk grep head tr "$via"; do ln -sf "$(command -v "$t")" "$work/bin-$via/$t"; done
  expect "guard: reads its input via $via" 2 "not on pm/S1-1-a" hook "$mg" "$M" PATH="$work/bin-$via"
done
mkdir -p "$work/bin-none"
for t in bash cat env git sed awk grep head tr; do ln -sf "$(command -v "$t")" "$work/bin-none/$t"; done
expect "guard: without a JSON reader, other commands still run" 0 "" hook "$mg" "ls -la" PATH="$work/bin-none"
expect "guard: without a JSON reader, a story merge blocks" 2 "install jq, python3 or node" hook "$mg" "$M" PATH="$work/bin-none"
expect "guard: an unreadable -C path blocks" 2 "cannot tell which repository" hook "$work" "git -C \"\$REPO\" merge pm/S1-1-a"
expect "guard: a cd inside an sh -c payload blocks" 2 "plain git merge" hook "$work" "sh -c 'cd $mg && git merge pm/S1-1-a'"
expect "guard: a glob in -C blocks" 2 "cannot tell which repository" hook "$work" "git -C $mg* merge pm/S1-1-a"
expect "guard: a -C path that is no repository blocks" 2 "is not a git repository" hook "$work" "git -C $work/nowhere merge pm/S1-1-a"
expect "guard: an unreadable cd blocks" 2 "cannot tell which repository" hook "$work" "cd \"\$REPO\" && git merge pm/S1-1-a"
git switch -q pm/S1-1-a
expect "guard: switching and merging in one call blocks" 2 "moves HEAD" hook "$mg" "git switch main && $M"
expect "guard: a story name through sh -c blocks" 2 "plain git merge" hook "$mg" "sh -c 'git merge pm/S1-1-a'"
expect "guard: a shell flag group with c blocks" 2 "plain git merge" hook "$work" "cd $mg && bash -lc 'git merge pm/S1-1-a'"
expect "guard: a HEAD move in any position blocks" 2 "moves HEAD" hook "$mg" "if git checkout main; then git merge pm/S1-1-a; fi"
expect "guard: a story name through git pull blocks" 2 "plain git merge" hook "$mg" "git pull . pm/S1-1-a"
expect "guard: updating the story branch is not a story merge" 0 "" hook "$mg" "git merge main -m \"bring pm/S1-1-a up to date\""
git switch -q main
git init -q ../plain && git -C ../plain commit -q --allow-empty -m x
expect "guard: a repository without bstack passes" 0 "" hook "$work/plain" "git merge pm/S9-9-x"
expect "guard: sh -c outside a bstack project passes" 0 "" hook "$work/plain" "sh -c 'git merge pm/S9-9-x'"
expect "guard: the doctor's probe is refused anywhere" 2 "the user's switch" hook "$work" "BSTACK_NO_ENFORCE=1 git merge pm/S0-0-doctor"
cd "$work/repo" || exit 2

# --- ledger.sh (in the merge-guard repository, where S1-1 has a pm-exec) ---
cd "$mg" || exit 2
W="builder=claude-opus-5-5:14m reviewer=gpt-6-astra:6m"
printf '# S1-3: a again\nReplaces: S1-1\n<!-- pm-exec: {"status":"merged","rounds":2} -->\n' > docs/stories/S1-3-a.md
printf '# S1-4: a, third try\nReplaces: S1-3\n<!-- pm-exec: {"status":"merged","rounds":1} -->\n' > docs/stories/S1-4-a.md
expect "ledger: appends a row" 0 "" bash "$ledger" S1-1 merged 0 0 1 "$W" "12->30"
expect "ledger: first-pass for a merged story with no review round" 0 "| S1-1 | merged | S1-1 | 0 | 0 | y | 0 | 1 | $W | 12->30 |" cat docs/ledger.md
expect "ledger: rows for a replaced story too" 0 "" bash "$ledger" S1-3 replaced 1 0 0 "$W" n/a
expect "ledger: tests-stage rounds do not spoil first-pass; lineage follows Replaces" 0 "| S1-4 | merged | S1-1 | 1 | 0 | y |" \
  sh -c 'bash "$1" S1-4 merged 0 0 0 "$2" n/a && cat docs/ledger.md' sh "$ledger" "$W"
expect "ledger: a blocked story is never first-pass" 0 "| S1-3 | blocked | S1-1 | 2 | 0 | n |" \
  sh -c 'bash "$1" S1-3 blocked 0 0 0 "$2" n/a && cat docs/ledger.md' sh "$ledger" "$W"
expect "ledger: review rounds cannot exceed all rounds" 1 "more than the story's" bash "$ledger" S1-4 merged 2 0 0 "$W" n/a
expect "ledger: an unknown status is refused" 1 "is not merged, blocked" bash "$ledger" S1-1 held 0 0 0 "$W" n/a
expect "ledger: the old five-argument form is a usage error" 1 "usage" bash "$ledger" S1-1 0 0 "$W" n/a n/a
expect "ledger: wall time needs role=model:minutes" 1 "<role>=<model>:<minutes>m" bash "$ledger" S1-1 merged 0 0 0 "builder 14m" n/a
expect "ledger: empty wall time is refused" 1 "is not <role>" bash "$ledger" S1-1 merged 0 0 0 "   " n/a
expect "ledger: a pipe cannot break the table" 1 "parity" bash "$ledger" S1-1 merged 0 0 0 "$W" "a|b->c"
expect "ledger: an unknown story is refused" 1 "no docs/stories/S7-7" bash "$ledger" S7-7 merged 0 0 0 "$W" n/a
rm -f docs/stories/S1-3-a.md docs/stories/S1-4-a.md

# --- hygiene.sh ---
cd "$work" && git init -q -b main hy && cd hy || exit 2
git config user.name test && git config user.email test@example.invalid
mkdir -p docs/stories && printf -- '- Integration branch: `dev`\n' > docs/plan.md
printf 'tmp/\nnode_modules/\n' > .gitignore && echo x > AGENTS.md && commit init
expect "hygiene: a tidy project passes" 0 "ok   leftovers: none" bash "$hygiene"
expect "hygiene: a flag without its value is a usage error" 2 "usage" bash "$hygiene" --main
expect "hygiene: --max-ahead needs a number" 2 "usage" bash "$hygiene" --max-ahead x
head -c 40000 /dev/zero | tr '\0' x > AGENTS.md
expect "hygiene: a large AGENTS.md warns" 1 "WARN size: AGENTS.md is 40000 bytes" bash "$hygiene"
git checkout -q AGENTS.md
branch dev; for k in 1 2 3; do echo "$k" > "f$k"; commit "dev $k"; done; git tag v0.1
git switch -q main
expect "hygiene: drift past the limit warns" 1 "WARN drift: dev is 3 commits ahead" bash "$hygiene" --max-ahead 2
expect "hygiene: a tag missing from main warns" 1 "v0.1(not on main)" bash "$hygiene"
git merge -q --no-edit dev
printf '<!-- pm-exec: {"status":"merged","branch":"dev","worktree":"/nowhere"} -->\n' > docs/stories/S1-1-x.md; commit story
expect "hygiene: a merged story's branch warns" 1 "branch:dev" bash "$hygiene"
mkdir -p tmp node_modules/pkg && echo 'echo hi' > tmp/fix-state.sh && echo 'x' > node_modules/pkg/index.js
expect "hygiene: an ignored PM script warns" 1 "tmp/fix-state.sh" bash "$hygiene"
n=$((n + 1))
hout=$(bash "$hygiene")
if printf '%s' "$hout" | grep -q node_modules; then fails=$((fails + 1)); echo "FAIL hygiene: dependencies are not scripts"
else echo "ok   hygiene: dependencies are not scripts"; fi
rm -rf tmp node_modules docs/stories/S1-1-x.md
expect "hygiene: current files carry no legacy" 0 "ok   legacy: none" bash "$hygiene"
printf -- '- FR-006: withdrawn, not reused\n' >> docs/plan.md
printf 'line one\n- ~~old rule~~ new rule\n' > AGENTS.md
expect "hygiene: a withdrawn line in the plan warns" 1 "WARN legacy: old text at docs/plan.md:2" bash "$hygiene"
expect "hygiene: struck-through text in AGENTS.md warns" 1 "AGENTS.md:2;" bash "$hygiene"
printf 'The API formerly returned XML.\n' > README.md
git checkout -q docs/plan.md AGENTS.md
expect "hygiene: a README is the reviewer's, not this check's" 0 "ok   legacy: none" bash "$hygiene"
cd "$work/repo" || exit 2

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
