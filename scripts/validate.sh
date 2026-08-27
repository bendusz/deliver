#!/usr/bin/env bash
# Portable validation for the pm-skill plugin — runs locally and in CI (no `claude` CLI needed).
set -u
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root" || exit 2
fail=0
err(){ echo "FAIL: $*" >&2; fail=1; }

command -v jq >/dev/null 2>&1 || { echo "validate.sh: jq is required" >&2; exit 2; }

# 1) JSON validity
for f in .claude-plugin/marketplace.json \
         plugins/pm-skill/.claude-plugin/plugin.json \
         plugins/pm-skill/hooks/hooks.json \
         plugins/pm-skill/schemas/codex-builder-result.schema.json \
         plugins/pm-skill/schemas/story-metadata.schema.json \
         plugins/pm-skill/schemas/builder-benchmark-result.schema.json \
         plugins/pm-skill/schemas/builder-routing-cases.schema.json \
         plugins/pm-skill/benchmarks/codex-builder-routing-cases.json; do
  if [ -f "$f" ]; then jq empty "$f" 2>/dev/null || err "invalid JSON: $f"; else err "missing: $f"; fi
done

# 2) every marketplace source resolves to a plugin dir with a manifest
while IFS= read -r src; do
  [ -d "$src" ] || err "marketplace source is not a directory: $src"
  [ -f "$src/.claude-plugin/plugin.json" ] || err "marketplace source has no plugin.json: $src"
done < <(jq -r '.plugins[].source' .claude-plugin/marketplace.json 2>/dev/null)

# 3) required files
for f in plugins/pm-skill/skills/project-manager/SKILL.md README.md LICENSE CHANGELOG.md; do
  [ -f "$f" ] || err "missing required file: $f"
done

# 4) skill + agent frontmatter must declare name + description
for md in plugins/pm-skill/skills/project-manager/SKILL.md plugins/pm-skill/agents/*.md; do
  [ -f "$md" ] || continue
  head -n 12 "$md" | grep -q '^name:' || err "no 'name:' frontmatter in $md"
  head -n 12 "$md" | grep -q '^description:' || err "no 'description:' frontmatter in $md"
done

# 5) every bundled hook script must be executable
for h in plugins/pm-skill/hooks/*.sh; do
  [ -x "$h" ] || err "hook not executable: $h"
done
[ -x plugins/pm-skill/scripts/codex-builder-run.sh ] || err "Codex builder runner is not executable"
[ -x plugins/pm-skill/scripts/score-builder-benchmark.sh ] || err "builder benchmark scorer is not executable"
[ -x plugins/pm-skill/scripts/smoke-codex-builder-live.sh ] || err "bundled live Codex builder smoke test is not executable"
[ -x scripts/smoke-codex-builder-live.sh ] || err "live Codex builder smoke test is not executable"

# 6) the installed plugin must stay generic (no third-party *plugin* names).
# The OpenAI Codex CLI is an intentional, documented external dependency of the
# codex-review/codex-help commands, so bare 'codex' is allowed since v0.10.0.
if grep -riE 'superpowers|skill-codex' plugins/pm-skill/ >/dev/null 2>&1; then
  err "third-party plugin name found under plugins/pm-skill/ (keep the artifact generic)"
fi

# 7) every references/<x>.md named in SKILL.md exists
skill=plugins/pm-skill/skills/project-manager/SKILL.md
if [ -f "$skill" ]; then
  while IFS= read -r r; do
    [ -f "plugins/pm-skill/skills/project-manager/$r" ] || err "SKILL.md references missing file: $r"
  done < <(grep -oE 'references/[a-z0-9-]+\.md' "$skill" | sort -u)
fi

# 8) every *.template referenced (path or bare name) in skills/commands/agents exists
while IFS= read -r t; do
  [ -f "plugins/pm-skill/templates/$t" ] || err "referenced template missing: $t"
done < <(grep -rhoE '[A-Za-z0-9._-]+\.template' plugins/pm-skill/skills plugins/pm-skill/commands plugins/pm-skill/agents 2>/dev/null | sort -u)

# 9) every command has 'description:' frontmatter
for md in plugins/pm-skill/commands/*.md; do
  [ -f "$md" ] || continue
  head -n 6 "$md" | grep -q '^description:' || err "no 'description:' frontmatter in $md"
done

# 10) JSON templates parse
for f in plugins/pm-skill/templates/pm-state.json.template \
         plugins/pm-skill/templates/actor-state.json.template \
         plugins/pm-skill/templates/claude-settings-hardening.json.template; do
  [ -f "$f" ] && { jq empty "$f" 2>/dev/null || err "invalid JSON template: $f"; }
done

# 11) CHANGELOG top version matches plugin.json version
pv="$(jq -r '.version' plugins/pm-skill/.claude-plugin/plugin.json 2>/dev/null)"
cv="$(grep -m1 -oE '^## [0-9]+\.[0-9]+\.[0-9]+' CHANGELOG.md 2>/dev/null | awk '{print $2}')"
{ [ -n "$pv" ] && [ "$pv" = "$cv" ]; } || err "version mismatch: plugin.json=$pv CHANGELOG top=$cv"

# 12) keep the artifact generic and self-contained (no external jargon)
if grep -rnE '/speckit|\btmux\b|\bsockets?\b|\bPi\b' README.md plugins/pm-skill >/dev/null 2>&1; then
  err "forbidden reference (speckit/tmux/socket/Pi) found"
fi

# 13) agent frontmatter must be valid YAML — an unquoted plain scalar may not contain ': '
# (a colon+space mid-value turns the line into a nested mapping and breaks agent loading).
for md in plugins/pm-skill/agents/*.md plugins/pm-skill/skills/project-manager/SKILL.md; do
  [ -f "$md" ] || continue
  fm="$(awk 'NR==1 && $0!="---"{exit} /^---$/{n++; next} n==1{print} n==2{exit}' "$md")"
  [ -n "$fm" ] || { err "no frontmatter block in $md"; continue; }
  while IFS= read -r line; do
    case "$line" in
      [a-z]*': '*) ;;
      *) err "malformed frontmatter line in $md: ${line%%:*}"; continue ;;
    esac
    val="${line#*: }"
    case "$val" in
      \"*\"|\'*\') ;;  # quoted scalar — ': ' is fine inside quotes
      *': '*) err "unquoted ': ' inside frontmatter value in $md (invalid YAML plain scalar): key '${line%%:*}'" ;;
    esac
  done < <(printf '%s\n' "$fm")
  if command -v ruby >/dev/null 2>&1; then
    # shellcheck disable=SC2016  # $stdin is a Ruby global, not a shell expansion
    printf '%s\n' "$fm" | ruby -ryaml -e 'YAML.safe_load($stdin.read)' >/dev/null 2>&1 || \
      err "frontmatter fails strict YAML parse: $md"
  fi
done

# 14) Opus fleet defaults are deliberate and may not drift to a moving alias or excessive effort.
check_agent_regime() {
  agent="$1"
  expected_model="$2"
  expected_effort="$3"
  path="plugins/pm-skill/agents/$agent.md"
  actual_model="$(grep -m1 '^model:' "$path" 2>/dev/null | awk '{print $2}')"
  actual_effort="$(grep -m1 '^effort:' "$path" 2>/dev/null | awk '{print $2}')"
  [ "$actual_model" = "$expected_model" ] || \
    err "$agent model must be $expected_model, found ${actual_model:-missing}"
  [ "$actual_effort" = "$expected_effort" ] || \
    err "$agent effort must be $expected_effort, found ${actual_effort:-missing}"
}
check_agent_regime expert-builder claude-opus-5 high
check_agent_regime security-auditor claude-opus-5 high
check_agent_regime debugger claude-opus-5 high
check_agent_regime architecture-reviewer claude-opus-5 medium
check_agent_regime code-integrity-reviewer claude-opus-5 medium
check_agent_regime pm-verifier claude-opus-5 medium
check_agent_regime test-engineer claude-opus-5 medium

for md in plugins/pm-skill/agents/*.md; do
  model="$(grep -m1 '^model:' "$md" 2>/dev/null | awk '{print $2}')"
  effort="$(grep -m1 '^effort:' "$md" 2>/dev/null | awk '{print $2}')"
  [ "$model" != "opus" ] || err "moving model alias is forbidden in $md"
  if [ "$model" = "claude-opus-5" ]; then
    case "$effort" in
      xhigh|max) err "Opus agent may not ship at $effort effort: $md" ;;
    esac
  fi
done

# 15) behavioral tests (quota-free; needs jq + git, both required above)
if ! bash "$(dirname "$0")/test-hooks.sh" >/dev/null 2>&1; then
  bash "$(dirname "$0")/test-hooks.sh" || true
  err "hook behavioral tests failed (scripts/test-hooks.sh)"
fi
if ! bash "$(dirname "$0")/test-codex-builder.sh" >/dev/null 2>&1; then
  bash "$(dirname "$0")/test-codex-builder.sh" || true
  err "Codex builder behavioral tests failed (scripts/test-codex-builder.sh)"
fi
if ! bash "$(dirname "$0")/test-builder-benchmark.sh" >/dev/null 2>&1; then
  bash "$(dirname "$0")/test-builder-benchmark.sh" || true
  err "builder benchmark tests failed (scripts/test-builder-benchmark.sh)"
fi

# 16) poteto companion plugin (plugins/poteto): manifest, attribution, skills, no Cursor residue
pp=plugins/poteto
if [ -d "$pp" ]; then
  jq empty "$pp/.claude-plugin/plugin.json" 2>/dev/null || err "invalid JSON: $pp/.claude-plugin/plugin.json"
  [ "$(jq -r '.license' "$pp/.claude-plugin/plugin.json" 2>/dev/null)" = "MIT" ] || err "poteto plugin.json license must be MIT"
  for f in "$pp/LICENSE" "$pp/README.md" "$pp/PORT.md"; do [ -f "$f" ] || err "missing required file: $f"; done
  grep -q '^MIT License' "$pp/LICENSE" 2>/dev/null || err "poteto LICENSE is not the upstream MIT text"
  grep -q 'Lauren Tan' "$pp/LICENSE" 2>/dev/null || err "poteto LICENSE lost the copyright holder"
  n=0
  for md in "$pp"/skills/*/SKILL.md; do
    [ -f "$md" ] || continue
    n=$((n+1))
    head -n 12 "$md" | grep -q '^name:' || err "no 'name:' frontmatter in $md"
    head -n 12 "$md" | grep -q '^description:' || err "no 'description:' frontmatter in $md"
    fm="$(awk 'NR==1 && $0!="---"{exit} /^---$/{c++; next} c==1{print} c==2{exit}' "$md")"
    [ -n "$fm" ] || { err "no frontmatter block in $md"; continue; }
    while IFS= read -r line; do
      case "$line" in [a-z]*': '*) ;; *) err "malformed frontmatter line in $md: ${line%%:*}"; continue ;; esac
      val="${line#*: }"
      case "$val" in \"*\"|\'*\') ;; *': '*) err "unquoted ': ' inside frontmatter value in $md: key '${line%%:*}'" ;; esac
    done < <(printf '%s\n' "$fm")
    if command -v ruby >/dev/null 2>&1; then
      # shellcheck disable=SC2016
      printf '%s\n' "$fm" | ruby -ryaml -e 'YAML.safe_load($stdin.read)' >/dev/null 2>&1 || err "frontmatter fails strict YAML parse: $md"
    fi
  done
  want="$(grep -m1 -oE '^Skills bundled: [0-9]+' "$pp/PORT.md" 2>/dev/null | awk '{print $3}')"
  { [ -n "$want" ] && [ "$want" = "$n" ]; } || err "poteto skill count mismatch: PORT.md says '${want:-?}', found $n"
  if grep -rnE '\.cursor/|grok-4|sol-max|thinking-max|generalPurpose|pstack-models|agent-transcripts' "$pp/skills" >/dev/null 2>&1; then
    grep -rnE '\.cursor/|grok-4|sol-max|thinking-max|generalPurpose|pstack-models|agent-transcripts' "$pp/skills" | head -5 >&2
    err "Cursor-only string survived under $pp/skills (see above)"
  fi
fi

if [ "$fail" -eq 0 ]; then echo "validate.sh: OK"; else echo "validate.sh: FAILED" >&2; exit 1; fi
