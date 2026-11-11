#!/usr/bin/env bash
# check.sh: the repository's convention checks (AGENTS.md "Conventions"), then the script tests.
# Run from anywhere: bash .github/scripts/check.sh. Exit 0 when every check passes.
# shellcheck disable=SC2013  # the greps below emit one whitespace-free token per line
set -uo pipefail
root=$(cd "$(dirname "$0")/../.." && pwd)
cd "$root" || exit 2
b=plugins/bstack
refs=$b/skills/project-manager/references
fails=0
ok() { printf 'ok   %s\n' "$1"; }
bad() { fails=$((fails + 1)); printf 'FAIL %s\n' "$1"; }

# The model ids bstack may name. CI cannot ask T3, so this list is the pin: when a default
# changes, check the new id against orchestrator_capabilities and update it here.
models="claude-opus-5-5 claude-fable-5-2 gpt-6-astra gpt-6.1-sol"

# 1. plugin.json version equals the top CHANGELOG heading.
ver=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$b/.claude-plugin/plugin.json" | head -1)
top=$(sed -n 's/^## \([0-9][^ ]*\).*/\1/p' CHANGELOG.md | head -1)
if [ -n "$ver" ] && [ "$ver" = "$top" ]; then ok "version $ver matches the top CHANGELOG heading"
else bad "plugin.json version '$ver' differs from the top CHANGELOG heading '$top'"; fi

# 2. Every bstack SKILL.md stays under 16,000 characters, with a name equal to its directory
#    and a description. No legacy commands directory.
for f in "$b"/skills/*/SKILL.md; do
  d=$(basename "$(dirname "$f")")
  c=$(wc -m < "$f" | tr -d ' ')
  if [ "$c" -lt 16000 ]; then ok "$d/SKILL.md is $c characters"; else bad "$d/SKILL.md is $c characters, the limit is 16,000"; fi
  grep -qx "name: $d" "$f" || bad "$d/SKILL.md lacks 'name: $d'"
  grep -q '^description: .' "$f" || bad "$d/SKILL.md lacks a description"
done
if [ -e "$b/commands" ]; then bad "$b/commands exists; entry points are skills"; else ok "no legacy commands directory"; fi

# 3. Every reference and template a skill or reference names exists.
miss=0
for r in $(grep -rhoE 'references/[a-z-]+\.md' "$b/skills" | sort -u); do
  [ -f "$b/skills/project-manager/$r" ] || { miss=1; bad "named but missing: $r"; }
done
for t in $(grep -rhoE '[A-Za-z.-]+\.template' "$b/skills" | sort -u); do
  [ -f "$b/templates/$t" ] || { miss=1; bad "named but missing: templates/$t"; }
done
[ "$miss" -ne 0 ] || ok "every named reference and template exists"

# 4. ${CLAUDE_PLUGIN_ROOT} is substituted only in a SKILL.md body: references say <plugin>.
if grep -rn 'CLAUDE_PLUGIN_ROOT' "$refs" "$b/templates"; then
  bad "a reference or template uses \${CLAUDE_PLUGIN_ROOT}; write <plugin> there"
else ok "no \${CLAUDE_PLUGIN_ROOT} outside a SKILL.md body"; fi
for f in "$b"/skills/*/SKILL.md; do
  grep -q 'CLAUDE_PLUGIN_ROOT' "$f" || bad "$(basename "$(dirname "$f")")/SKILL.md never resolves the plugin root"
done

# 5. Model ids are pinned, never a moving alias.
unknown=0
for m in $(grep -rhoE '(claude-(opus|sonnet|haiku|fable)|gpt)-[0-9][0-9a-z.-]*[0-9a-z]' "$b" README.md | sort -u); do
  case " $models " in *" $m "*) ;; *) unknown=1; bad "model id '$m' is not in check.sh's pinned list" ;; esac
done
[ "$unknown" -ne 0 ] || ok "every model id is pinned"

# 6. The only code in the plugin is the two scripts, executable, with LF endings.
code=$(git ls-files "$b" | grep -vE '\.(md|json|template)$' | sort | tr '\n' ' ')
want="$b/scripts/log.sh $b/scripts/scan-secrets.sh "
if [ "$code" = "$want" ]; then ok "log.sh and scan-secrets.sh are the plugin's only code"
else bad "unexpected non-prose files in the plugin: $code"; fi
for s in log.sh scan-secrets.sh; do
  mode=$(git ls-files -s "$b/scripts/$s" | cut -d' ' -f1)
  [ "$mode" = 100755 ] || bad "$s is mode '$mode' in git, wanted 100755"
  if grep -q "$(printf '\r')" "$b/scripts/$s"; then bad "$s has CRLF line endings"; fi
done
grep -qx '\*\.sh text eol=lf' .gitattributes || bad ".gitattributes no longer pins *.sh to LF"

# 7. poteto keeps its licence, its attribution and an honest skill count.
grep -q '^MIT License' plugins/poteto/LICENSE 2>/dev/null || bad "plugins/poteto/LICENSE is not the MIT licence"
grep -q 'Lauren Tan' plugins/poteto/README.md || bad "plugins/poteto/README.md lost its attribution"
have=$(find plugins/poteto/skills -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')
said=$(sed -n 's/^Skills bundled: \([0-9]*\).*/\1/p' plugins/poteto/PORT.md)
if [ "$have" = "$said" ]; then ok "poteto bundles $have skills, as PORT.md says"
else bad "poteto has $have skill directories, PORT.md says '$said'"; fi
if grep -rnE '\.cursor|grok-4|sol-max|thinking-max|generalPurpose|pstack-models|agent-transcripts|create-skill' plugins/poteto/skills; then
  bad "a Cursor-only string is back in poteto (see PORT.md, Re-sync recipe)"
else ok "no Cursor-only strings in poteto"; fi

# 8. Lint and test the scripts.
if command -v shellcheck >/dev/null 2>&1; then
  if shellcheck "$b"/scripts/*.sh .github/scripts/*.sh; then ok "shellcheck"; else bad "shellcheck"; fi
else printf 'skip shellcheck (not installed)\n'; fi
if bash .github/scripts/test-scripts.sh > /tmp/bstack-test-scripts.$$ 2>&1; then
  ok "script tests: $(tail -1 /tmp/bstack-test-scripts.$$)"
else
  bad "script tests"; cat /tmp/bstack-test-scripts.$$
fi
rm -f /tmp/bstack-test-scripts.$$

printf '%s failed\n' "$fails"
[ "$fails" -eq 0 ]
